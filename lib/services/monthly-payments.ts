import { createHash } from "node:crypto";
import { MensalidadeStatus, MovimentacaoCaixaOrigem, PagamentoStatus, Prisma, TipoMovimentacao } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { academyToday, parseCivilDate, prismaDateToCivil } from "@/lib/attendance-date";
import { toCompetencia } from "@/lib/competencia";
import { prisma } from "@/lib/prisma";
import { AUTO_PAGAMENTO_PREFIX } from "@/lib/services/caixa";
import { resolvePaymentMethodForWrite } from "@/lib/services/payment-methods";

export class MonthlyPaymentError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export type MonthlyPaymentInput = {
  mensalidadeId: string;
  valor: unknown;
  formaPagamento: unknown;
  dataPagamento?: unknown;
  valorFinal?: unknown;
  motivoAjuste?: unknown;
  idempotencyKey: unknown;
  actor: { id: string; name: string };
};

function money(value: unknown, field: string) {
  try {
    const parsed = new Prisma.Decimal(String(value ?? "").replace(",", "."));
    if (!parsed.isPositive() || parsed.decimalPlaces() > 2) throw new Error();
    return parsed;
  } catch {
    throw new MonthlyPaymentError(`${field} deve ser maior que zero e possuir no máximo duas casas decimais`);
  }
}

function optionalMoney(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  return money(value, field);
}

function paymentDate(value: unknown) {
  if (value === undefined || value === null || value === "") return new Date();
  try {
    const dateKey = parseCivilDate(String(value));
    return new Date(`${dateKey}T12:00:00-03:00`);
  } catch {
    throw new MonthlyPaymentError("Data de pagamento inválida");
  }
}

function stablePaymentId(mensalidadeId: string, key: unknown) {
  const normalized = String(key ?? "").trim();
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(normalized)) throw new MonthlyPaymentError("Chave de idempotência inválida");
  return `pay_${createHash("sha256").update(`${mensalidadeId}:${normalized}`).digest("hex").slice(0, 32)}`;
}

export function monthlyAmounts(input: { valor: Prisma.Decimal | number | string; valorFinal?: Prisma.Decimal | number | string | null; pagamentos?: Array<{ valor: Prisma.Decimal | number | string; status: PagamentoStatus }> }) {
  const original = new Prisma.Decimal(input.valor);
  const due = input.valorFinal === null || input.valorFinal === undefined ? original : new Prisma.Decimal(input.valorFinal);
  const paid = (input.pagamentos ?? [])
    .filter((item) => item.status === PagamentoStatus.CONFIRMADO)
    .reduce((total, item) => total.plus(item.valor), new Prisma.Decimal(0));
  return { original, due, paid, balance: Prisma.Decimal.max(due.minus(paid), 0) };
}

function statusForBalance(balance: Prisma.Decimal, vencimento: Date, reference = new Date(), totalPaid = new Prisma.Decimal(0)) {
  if (balance.lte(0)) return MensalidadeStatus.PAGO;
  if (totalPaid.gt(0)) return MensalidadeStatus.PARCIAL;
  return prismaDateToCivil(vencimento) < academyToday(reference) ? MensalidadeStatus.ATRASADO : MensalidadeStatus.PENDENTE;
}

async function receiptCategory(tx: Prisma.TransactionClient) {
  const existing = await tx.categoriaFinanceira.findFirst({
    where: { nome: { equals: "Mensalidades", mode: Prisma.QueryMode.insensitive } },
    select: { id: true, tipo: true, ativa: true }
  });
  if (existing) {
    if (existing.tipo && existing.tipo !== TipoMovimentacao.ENTRADA) throw new MonthlyPaymentError("Categoria Mensalidades não aceita entradas");
    if (existing.ativa === false) throw new MonthlyPaymentError("Categoria Mensalidades está inativa; reative-a antes de registrar pagamentos");
    return existing.id;
  }
  const created = await tx.categoriaFinanceira.create({ data: { nome: "Mensalidades", tipo: TipoMovimentacao.ENTRADA, ativa: true }, select: { id: true } });
  return created.id;
}

export async function registerMonthlyPayment(input: MonthlyPaymentInput, options: { tx?: Prisma.TransactionClient } = {}) {
  const paymentId = stablePaymentId(input.mensalidadeId, input.idempotencyKey);
  let paymentMethod: string | null | undefined;
  try {
    paymentMethod = await resolvePaymentMethodForWrite({ value: input.formaPagamento, application: "RECEBIMENTO", required: true });
  } catch (error) {
    throw new MonthlyPaymentError(error instanceof Error ? error.message : "Forma de pagamento inválida");
  }
  const amount = money(input.valor, "Valor recebido");
  const paidAt = paymentDate(input.dataPagamento);
  const proposedFinal = optionalMoney(input.valorFinal, "Valor final");
  const adjustmentReason = String(input.motivoAjuste ?? "").trim();

  const operation = async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Mensalidade" WHERE "id" = ${input.mensalidadeId} FOR UPDATE`);

    const alreadyProcessed = await tx.pagamento.findUnique({ where: { id: paymentId } });
    if (alreadyProcessed) {
      const monthly = await tx.mensalidade.findUnique({ where: { id: input.mensalidadeId }, include: { pagamentos: true } });
      if (!monthly) throw new MonthlyPaymentError("Mensalidade não encontrada", 404);
      const amounts = monthlyAmounts(monthly);
      return { payment: alreadyProcessed, monthly, amounts, alreadyProcessed: true };
    }

    const monthly = await tx.mensalidade.findUnique({
      where: { id: input.mensalidadeId },
      include: { aluno: { select: { nomeCompleto: true, arquivadoEm: true } }, pagamentos: true }
    });
    if (!monthly) throw new MonthlyPaymentError("Mensalidade não encontrada", 404);
    if (monthly.aluno.arquivadoEm) throw new MonthlyPaymentError("Aluno arquivado não pode receber novo pagamento", 409);
    if (monthly.status === MensalidadeStatus.PAGO) throw new MonthlyPaymentError("Mensalidade já está paga", 409);

    const current = monthlyAmounts(monthly);
    let finalValue = monthly.valorFinal;
    let finalReason = monthly.motivoAjuste;
    if (proposedFinal !== undefined) {
      if (proposedFinal.lt(current.paid)) throw new MonthlyPaymentError("Valor final não pode ser menor que o total já pago");
      if (proposedFinal.eq(current.original)) {
        finalValue = null;
        finalReason = null;
      } else {
        if (!adjustmentReason) throw new MonthlyPaymentError("Motivo do ajuste é obrigatório");
        finalValue = proposedFinal;
        finalReason = adjustmentReason;
      }
    }

    const due = finalValue ?? current.original;
    const balanceBefore = new Prisma.Decimal(due).minus(current.paid);
    if (amount.gt(balanceBefore)) throw new MonthlyPaymentError("Valor recebido excede o saldo restante");

    const payment = await tx.pagamento.create({
      data: {
        id: paymentId,
        alunoId: monthly.alunoId,
        mensalidadeId: monthly.id,
        valor: amount,
        dataPagamento: paidAt,
        formaPagamento: paymentMethod!,
        status: PagamentoStatus.CONFIRMADO,
        observacao: finalReason ? `Ajuste da cobrança: ${finalReason}` : null
      }
    });

    const totalPaid = current.paid.plus(amount);
    const balance = Prisma.Decimal.max(new Prisma.Decimal(due).minus(totalPaid), 0);
    const nextStatus = statusForBalance(balance, monthly.vencimento, paidAt, totalPaid);
    const updated = await tx.mensalidade.update({
      where: { id: monthly.id },
      data: {
        valorFinal: finalValue,
        motivoAjuste: finalReason,
        status: nextStatus,
        dataPagamento: nextStatus === MensalidadeStatus.PAGO ? paidAt : null,
        formaPagamento: paymentMethod
      }
    });

    const categoryId = await receiptCategory(tx);
    await tx.movimentacaoCaixa.create({
      data: {
        id: `${AUTO_PAGAMENTO_PREFIX}${payment.id}`,
        data: paidAt,
        tipo: TipoMovimentacao.ENTRADA,
        categoriaId: categoryId,
        descricao: `Pagamento mensalidade ${monthly.competencia} - ${monthly.aluno.nomeCompleto}`,
        valor: amount,
        origemDestino: monthly.aluno.nomeCompleto,
        alunoId: monthly.alunoId,
        formaPagamento: paymentMethod,
        competencia: toCompetencia(paidAt),
        pagamentoId: payment.id,
        mensalidadeId: monthly.id,
        observacao: `Pagamento ${payment.id}`,
        origem: MovimentacaoCaixaOrigem.PAGAMENTO_MENSALIDADE
      }
    });

    await logAudit({
      userId: input.actor.id,
      modulo: "mensalidades",
      entidade: "Mensalidade",
      entidadeId: monthly.id,
      acao: "REGISTER_PAYMENT",
      antes: { status: monthly.status, valorFinal: monthly.valorFinal, totalPago: current.paid.toFixed(2) },
      depois: { status: updated.status, valorFinal: updated.valorFinal, totalPago: totalPaid.toFixed(2), pagamentoId: payment.id }
    }, tx);

    return { payment, monthly: updated, amounts: { original: current.original, due: new Prisma.Decimal(due), paid: totalPaid, balance }, alreadyProcessed: false };
  };
  if (options.tx) return operation(options.tx);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  throw new MonthlyPaymentError("Não foi possível concluir o pagamento concorrente", 409);
}

export function initialMonthlyStatus(vencimento: Date, reference = new Date()) {
  return statusForBalance(new Prisma.Decimal(1), vencimento, reference);
}
