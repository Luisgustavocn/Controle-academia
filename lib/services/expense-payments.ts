import { DespesaAcademia, DespesaStatus, MovimentacaoCaixaOrigem, Prisma, TipoMovimentacao } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { toCompetencia } from "@/lib/competencia";
import { prisma } from "@/lib/prisma";
import { resolvePaymentMethodForWrite } from "@/lib/services/payment-methods";

export class ExpensePaymentError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

type ExpenseInput = Record<string, unknown>;

function date(value: unknown, field: string, required = false) {
  if (value === undefined) return undefined;
  if (value === null || value === "") {
    if (required) throw new ExpensePaymentError(`${field} é obrigatório`);
    return null;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new ExpensePaymentError(`${field} inválido`);
  return parsed;
}

function decimal(value: unknown, field: string, fallback?: Prisma.Decimal) {
  if (value === undefined) return fallback;
  try {
    const parsed = new Prisma.Decimal(String(value).replace(",", "."));
    if (parsed.isNegative() || parsed.decimalPlaces() > 2) throw new Error();
    return parsed;
  } catch {
    throw new ExpensePaymentError(`${field} inválido`);
  }
}

function optionalText(value: unknown, fallback?: string | null) {
  if (value === undefined) return fallback;
  if (value === null) return null;
  return String(value).trim() || null;
}

function status(value: unknown, fallback: DespesaStatus = DespesaStatus.PENDENTE) {
  if (value === undefined) return fallback;
  const normalized = String(value).toUpperCase();
  if (!Object.values(DespesaStatus).includes(normalized as DespesaStatus)) throw new ExpensePaymentError("Status inválido");
  return normalized as DespesaStatus;
}

async function normalized(input: ExpenseInput, previous?: DespesaAcademia) {
  const dataVencimento = date(input.dataVencimento, "Vencimento", !previous) ?? previous?.dataVencimento;
  if (!dataVencimento) throw new ExpensePaymentError("Vencimento é obrigatório");
  const descricao = optionalText(input.descricao, previous?.descricao);
  if (!descricao) throw new ExpensePaymentError("Descrição é obrigatória");
  const valorPago = decimal(input.valorPago, "Valor pago", previous?.valorPago ?? new Prisma.Decimal(0))!;
  const valorPrevisto = decimal(input.valorPrevisto, "Valor previsto", previous?.valorPrevisto ?? valorPago)!;
  const targetStatus = status(input.status, previous?.status ?? (valorPago.gt(0) ? DespesaStatus.PAGO : DespesaStatus.PENDENTE));
  const paid = targetStatus === DespesaStatus.PAGO || valorPago.gt(0);
  if (targetStatus === DespesaStatus.PARCIAL || (paid && !valorPago.eq(valorPrevisto))) {
    throw new ExpensePaymentError("Pagamento parcial de despesa ainda não é suportado; informe o valor integral.");
  }
  const dataPagamento = paid ? (date(input.dataPagamento, "Data de pagamento") ?? previous?.dataPagamento ?? new Date()) : null;
  const formaPagamento = await resolvePaymentMethodForWrite({
    value: input.formaPagamento,
    previousValue: previous?.formaPagamento ?? null,
    application: "DESPESA",
    required: paid
  });
  return {
    dataVencimento,
    competencia: optionalText(input.competencia, previous?.competencia) ?? toCompetencia(dataPagamento ?? dataVencimento),
    descricao,
    categoriaId: optionalText(input.categoriaId, previous?.categoriaId),
    valorPrevisto,
    valorPago: paid ? valorPrevisto : new Prisma.Decimal(0),
    status: paid ? DespesaStatus.PAGO : targetStatus,
    dataPagamento,
    formaPagamento: paid ? formaPagamento : null,
    observacao: optionalText(input.observacao, previous?.observacao)
  };
}

async function syncCash(tx: Prisma.TransactionClient, expense: DespesaAcademia, previous: DespesaAcademia | null) {
  const existing = await tx.movimentacaoCaixa.findUnique({ where: { despesaAcademiaId: expense.id } });
  const nowPaid = expense.status === DespesaStatus.PAGO && new Prisma.Decimal(expense.valorPago).gt(0);
  const wasPaid = previous?.status === DespesaStatus.PAGO && new Prisma.Decimal(previous?.valorPago ?? 0).gt(0);
  if (!nowPaid) {
    if (existing) await tx.movimentacaoCaixa.delete({ where: { id: existing.id } });
    return;
  }
  // Não converte automaticamente uma baixa histórica paga e sem vínculo.
  if (!existing && wasPaid) return;
  const movement = {
    data: expense.dataPagamento ?? new Date(),
    tipo: TipoMovimentacao.SAIDA,
    categoriaId: expense.categoriaId,
    descricao: `Pagamento de despesa - ${expense.descricao}`,
    valor: expense.valorPago,
    origemDestino: expense.descricao,
    formaPagamento: expense.formaPagamento,
    competencia: toCompetencia(expense.dataPagamento ?? expense.dataVencimento),
    observacao: `Baixa da despesa ${expense.id}`,
    origem: MovimentacaoCaixaOrigem.DESPESA,
    despesaAcademiaId: expense.id
  };
  if (existing) await tx.movimentacaoCaixa.update({ where: { id: existing.id }, data: movement });
  else await tx.movimentacaoCaixa.create({ data: movement });
}

export async function createExpense(input: ExpenseInput, actorId: string) {
  const data = await normalized(input);
  return prisma.$transaction(async (tx) => {
    const created = await tx.despesaAcademia.create({ data });
    await syncCash(tx, created, null);
    await logAudit({ userId: actorId, modulo: "despesas-academia", entidade: "despesaAcademia", entidadeId: created.id, acao: "CREATE", depois: created }, tx);
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateExpense(id: string, input: ExpenseInput, actorId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "DespesaAcademia" WHERE "id" = ${id} FOR UPDATE`);
    const previous = await tx.despesaAcademia.findUnique({ where: { id } });
    if (!previous) throw new ExpensePaymentError("Despesa não encontrada", 404);
    const data = await normalized(input, previous);
    const updated = await tx.despesaAcademia.update({ where: { id }, data });
    await syncCash(tx, updated, previous);
    await logAudit({ userId: actorId, modulo: "despesas-academia", entidade: "despesaAcademia", entidadeId: id, acao: "UPDATE", antes: previous, depois: updated }, tx);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
