import {
  DespesaStatus,
  MensalidadeStatus,
  MovimentacaoCaixa,
  MovimentacaoCaixaOrigem,
  PagamentoStatus,
  Prisma
} from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { academyToday, prismaDateToCivil } from "@/lib/attendance-date";
import { prisma } from "@/lib/prisma";

const PAYMENT_PREFIX = "auto_pagamento_";
const MONTHLY_PREFIX = "auto_mensalidade_";
const ORDER_PREFIX = "auto_pedido_";

export class CashDeletionError extends Error {
  constructor(message: string, readonly status = 409, readonly code?: string) {
    super(message);
  }
}

type Input = { movementId: string; reason: string; actorId: string };

function overdue(date: Date) {
  return prismaDateToCivil(date) < academyToday();
}

async function deleteIndependent(tx: Prisma.TransactionClient, movement: Record<string, unknown>, input: Input) {
  if (movement["pagamentoId"] || movement["mensalidadeId"] || movement["despesaAcademiaId"] || movement["pedidoProdutoId"]) {
    throw new CashDeletionError("O lançamento possui vínculos financeiros e não pode ser excluído como independente.");
  }
  await logAudit({
    userId: input.actorId,
    modulo: "caixa",
    entidade: "MovimentacaoCaixa",
    entidadeId: input.movementId,
    acao: "DELETE_CASH_MOVEMENT",
    antes: movement,
    depois: { removido: true, motivo: input.reason }
  }, tx);
  await tx.movimentacaoCaixa.delete({ where: { id: input.movementId } });
  return { action: "DELETE_CASH_MOVEMENT" };
}

async function reversePayment(tx: Prisma.TransactionClient, movement: MovimentacaoCaixa, paymentId: string, input: Input) {
  if (movement.despesaAcademiaId || movement.pedidoProdutoId) throw new CashDeletionError("Lançamento possui vínculos de origem conflitantes.");
  const payment = await tx.pagamento.findUnique({ where: { id: paymentId } });
  if (!payment || !payment.mensalidadeId) throw new CashDeletionError("Pagamento legado não pôde ser reconciliado com segurança.");
  if (movement.pagamentoId && movement.pagamentoId !== payment.id) throw new CashDeletionError("Vínculo de pagamento conflitante.");
  if (movement.mensalidadeId && movement.mensalidadeId !== payment.mensalidadeId) throw new CashDeletionError("Vínculo de mensalidade conflitante.");

  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Mensalidade" WHERE "id" = ${payment.mensalidadeId} FOR UPDATE`);
  const monthly = await tx.mensalidade.findUnique({
    where: { id: payment.mensalidadeId },
    include: { pagamentos: { where: { status: PagamentoStatus.CONFIRMADO }, orderBy: { dataPagamento: "desc" } } }
  });
  if (!monthly) throw new CashDeletionError("Mensalidade do pagamento não encontrada.");
  const remaining = monthly.pagamentos.filter((item) => item.id !== payment.id);
  const totalBefore = monthly.pagamentos.reduce((sum, item) => sum.plus(item.valor), new Prisma.Decimal(0));
  const totalAfter = remaining.reduce((sum, item) => sum.plus(item.valor), new Prisma.Decimal(0));
  const due = new Prisma.Decimal(monthly.valorFinal ?? monthly.valor);
  const nextStatus = totalAfter.gte(due)
    ? MensalidadeStatus.PAGO
    : overdue(monthly.vencimento)
      ? MensalidadeStatus.ATRASADO
      : MensalidadeStatus.PENDENTE;
  const lastPayment = remaining[0] ?? null;

  await tx.movimentacaoCaixa.delete({ where: { id: movement.id } });
  await tx.pagamento.delete({ where: { id: payment.id } });
  const updated = await tx.mensalidade.update({
    where: { id: monthly.id },
    data: {
      status: nextStatus,
      dataPagamento: nextStatus === MensalidadeStatus.PAGO ? lastPayment?.dataPagamento ?? null : null,
      formaPagamento: nextStatus === MensalidadeStatus.PAGO ? lastPayment?.formaPagamento ?? null : null
    }
  });
  await logAudit({
    userId: input.actorId,
    modulo: "caixa",
    entidade: "Pagamento",
    entidadeId: payment.id,
    acao: "REVERSE_PAYMENT_FROM_CASH",
    antes: { caixa: movement, pagamento: payment, mensalidade: monthly, totalPago: totalBefore.toFixed(2) },
    depois: { caixaRemovido: true, pagamentoRemovido: true, mensalidade: updated, totalPago: totalAfter.toFixed(2), motivo: input.reason }
  }, tx);
  return { action: "REVERSE_PAYMENT", monthlyStatus: updated.status };
}

async function reverseLegacyMonthly(tx: Prisma.TransactionClient, movement: MovimentacaoCaixa, monthlyId: string, input: Input) {
  if (movement.pagamentoId || movement.despesaAcademiaId || movement.pedidoProdutoId) throw new CashDeletionError("Lançamento possui vínculos de origem conflitantes.");
  const monthly = await tx.mensalidade.findUnique({ where: { id: monthlyId }, include: { pagamentos: true } });
  if (!monthly || monthly.pagamentos.length) throw new CashDeletionError("Mensalidade legada não pôde ser reconciliada com segurança.");
  if (movement.mensalidadeId && movement.mensalidadeId !== monthly.id) throw new CashDeletionError("Vínculo de mensalidade conflitante.");
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Mensalidade" WHERE "id" = ${monthly.id} FOR UPDATE`);
  const status = overdue(monthly.vencimento) ? MensalidadeStatus.ATRASADO : MensalidadeStatus.PENDENTE;
  await tx.movimentacaoCaixa.delete({ where: { id: movement.id } });
  const updated = await tx.mensalidade.update({ where: { id: monthly.id }, data: { status, dataPagamento: null, formaPagamento: null } });
  await logAudit({ userId: input.actorId, modulo: "caixa", entidade: "Mensalidade", entidadeId: monthly.id, acao: "REVERSE_LEGACY_MONTHLY_PAYMENT", antes: { caixa: movement, mensalidade: monthly }, depois: { caixaRemovido: true, mensalidade: updated, motivo: input.reason } }, tx);
  return { action: "REVERSE_LEGACY_MONTHLY", monthlyStatus: updated.status };
}

async function reverseExpense(tx: Prisma.TransactionClient, movement: MovimentacaoCaixa, expenseId: string, input: Input) {
  if (movement.pagamentoId || movement.mensalidadeId || movement.pedidoProdutoId) throw new CashDeletionError("Lançamento possui vínculos de origem conflitantes.");
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "DespesaAcademia" WHERE "id" = ${expenseId} FOR UPDATE`);
  const expense = await tx.despesaAcademia.findUnique({ where: { id: expenseId } });
  if (!expense || movement.despesaAcademiaId !== expense.id) throw new CashDeletionError("Despesa não pôde ser reconciliada com segurança.");
  const status = overdue(expense.dataVencimento) ? DespesaStatus.ATRASADO : DespesaStatus.PENDENTE;
  await tx.movimentacaoCaixa.delete({ where: { id: movement.id } });
  const updated = await tx.despesaAcademia.update({ where: { id: expense.id }, data: { valorPago: 0, status, dataPagamento: null, formaPagamento: null } });
  await logAudit({ userId: input.actorId, modulo: "caixa", entidade: "DespesaAcademia", entidadeId: expense.id, acao: "REVERSE_EXPENSE_PAYMENT", antes: { caixa: movement, despesa: expense }, depois: { caixaRemovido: true, despesa: updated, motivo: input.reason } }, tx);
  return { action: "REVERSE_EXPENSE", expenseStatus: updated.status };
}

async function reverseOrder(tx: Prisma.TransactionClient, movement: MovimentacaoCaixa, orderId: string, input: Input) {
  if (movement.pagamentoId || movement.mensalidadeId || movement.despesaAcademiaId) throw new CashDeletionError("Lançamento possui vínculos de origem conflitantes.");
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "PedidoProduto" WHERE "id" = ${orderId} FOR UPDATE`);
  const order = await tx.pedidoProduto.findUnique({ where: { id: orderId } });
  if (!order) throw new CashDeletionError("Pedido não pôde ser reconciliado com segurança.");
  if (movement.pedidoProdutoId && movement.pedidoProdutoId !== order.id) throw new CashDeletionError("Vínculo de pedido conflitante.");
  await tx.movimentacaoCaixa.delete({ where: { id: movement.id } });
  const updated = await tx.pedidoProduto.update({ where: { id: order.id }, data: { pago: 0 } });
  await logAudit({ userId: input.actorId, modulo: "caixa", entidade: "PedidoProduto", entidadeId: order.id, acao: "REVERSE_ORDER_PAYMENT", antes: { caixa: movement, pedido: order }, depois: { caixaRemovido: true, pedido: updated, motivo: input.reason } }, tx);
  return { action: "REVERSE_ORDER" };
}

async function operation(tx: Prisma.TransactionClient, input: Input) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "MovimentacaoCaixa" WHERE "id" = ${input.movementId} FOR UPDATE`);
  const movement = await tx.movimentacaoCaixa.findUnique({ where: { id: input.movementId } });
  if (!movement) throw new CashDeletionError("Movimentação não encontrada", 404);

  switch (movement.origem) {
    case MovimentacaoCaixaOrigem.MANUAL:
    case MovimentacaoCaixaOrigem.AJUSTE:
      return deleteIndependent(tx, movement as unknown as Record<string, unknown>, input);
    case MovimentacaoCaixaOrigem.PAGAMENTO_MENSALIDADE:
      if (movement.pagamentoId) return reversePayment(tx, movement, movement.pagamentoId, input);
      if (movement.mensalidadeId) return reverseLegacyMonthly(tx, movement, movement.mensalidadeId, input);
      throw new CashDeletionError("Origem de pagamento sem vínculo financeiro válido.");
    case MovimentacaoCaixaOrigem.DESPESA:
      if (!movement.despesaAcademiaId) throw new CashDeletionError("Origem de despesa sem vínculo estrutural válido.");
      return reverseExpense(tx, movement, movement.despesaAcademiaId, input);
    case MovimentacaoCaixaOrigem.PEDIDO:
      if (!movement.pedidoProdutoId) throw new CashDeletionError("Origem de pedido sem vínculo estrutural válido.");
      return reverseOrder(tx, movement, movement.pedidoProdutoId, input);
    case MovimentacaoCaixaOrigem.IMPORTACAO:
      throw new CashDeletionError("Lançamentos importados não podem ser excluídos automaticamente nesta etapa.");
    case null:
      if (movement.id.startsWith(PAYMENT_PREFIX)) {
        const id = movement.id.slice(PAYMENT_PREFIX.length);
        if (await tx.pagamento.findUnique({ where: { id }, select: { id: true } })) return reversePayment(tx, movement, id, input);
      }
      if (movement.id.startsWith(MONTHLY_PREFIX)) {
        const id = movement.id.slice(MONTHLY_PREFIX.length);
        if (await tx.mensalidade.findUnique({ where: { id }, select: { id: true } })) return reverseLegacyMonthly(tx, movement, id, input);
      }
      if (movement.id.startsWith(ORDER_PREFIX)) {
        const id = movement.id.slice(ORDER_PREFIX.length);
        if (await tx.pedidoProduto.findUnique({ where: { id }, select: { id: true } })) return reverseOrder(tx, movement, id, input);
      }
      throw new CashDeletionError("Este lançamento é anterior ao rastreamento de origem e não possui vínculo automático identificável.", 409, "LEGACY_UNIDENTIFIED");
  }
}

export async function deleteCashMovement(input: Input) {
  const reason = input.reason.trim();
  if (!reason) throw new CashDeletionError("Motivo é obrigatório", 400);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction((tx) => operation(tx, { ...input, reason }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  throw new CashDeletionError("Não foi possível concluir a exclusão concorrente.");
}

async function legacyOperation(tx: Prisma.TransactionClient, input: Input) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "MovimentacaoCaixa" WHERE "id" = ${input.movementId} FOR UPDATE`);
  const movement = await tx.movimentacaoCaixa.findUnique({ where: { id: input.movementId } });
  if (!movement) throw new CashDeletionError("Movimentação não encontrada", 404);
  if (movement.origem || movement.pagamentoId || movement.mensalidadeId || movement.despesaAcademiaId || movement.pedidoProdutoId) {
    throw new CashDeletionError("Este lançamento possui origem ou vínculo conhecido e deve usar a reversão financeira normal.");
  }

  if (movement.id.startsWith(PAYMENT_PREFIX)) {
    const payment = await tx.pagamento.findUnique({ where: { id: movement.id.slice(PAYMENT_PREFIX.length) }, select: { id: true } });
    if (payment) throw new CashDeletionError("Pagamento reconhecido deve usar a reversão financeira normal.");
  }
  if (movement.id.startsWith(MONTHLY_PREFIX)) {
    const monthly = await tx.mensalidade.findUnique({ where: { id: movement.id.slice(MONTHLY_PREFIX.length) }, select: { id: true } });
    if (monthly) throw new CashDeletionError("Mensalidade reconhecida deve usar a reversão financeira normal.");
  }
  if (movement.id.startsWith(ORDER_PREFIX)) {
    const order = await tx.pedidoProduto.findUnique({ where: { id: movement.id.slice(ORDER_PREFIX.length) }, select: { id: true } });
    if (order) throw new CashDeletionError("Pedido reconhecido deve usar a reversão financeira normal.");
  }

  await logAudit({
    userId: input.actorId,
    modulo: "caixa",
    entidade: "MovimentacaoCaixa",
    entidadeId: movement.id,
    acao: "DELETE_LEGACY_CASH",
    antes: movement,
    depois: {
      removidoSomenteDoCaixa: true,
      origemAnterior: null,
      exclusaoAdministrativa: true,
      motivo: input.reason,
      solicitadoEm: new Date().toISOString()
    }
  }, tx);
  await tx.movimentacaoCaixa.delete({ where: { id: movement.id } });
  return { action: "DELETE_LEGACY_CASH" };
}

export async function deleteLegacyCashMovement(input: Input) {
  const reason = input.reason.trim();
  if (!reason) throw new CashDeletionError("Motivo é obrigatório", 400);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction((tx) => legacyOperation(tx, { ...input, reason }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  throw new CashDeletionError("Não foi possível concluir a exclusão concorrente.");
}
