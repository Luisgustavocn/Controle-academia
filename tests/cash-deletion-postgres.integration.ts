import assert from "node:assert/strict";
import {
  AlunoStatus,
  MensalidadeStatus,
  MovimentacaoCaixaOrigem,
  TipoMovimentacao,
  UserRole
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import { CashDeletionError, deleteCashMovement, deleteLegacyCashMovement } from "../lib/services/cash-deletion";
import { createExpense } from "../lib/services/expense-payments";
import { registerMonthlyPayment } from "../lib/services/monthly-payments";

async function main() {
  const suffix = Date.now().toString(36);
  const actorId = `cash-delete-admin-${suffix}`;
  const studentId = `cash-delete-student-${suffix}`;
  const methodName = `PIX CASH DELETE ${suffix}`;
  const manualId = `cash-delete-manual-${suffix}`;
  const unknownId = `cash-delete-legacy-${suffix}`;
  const monthlyId = `cash-delete-monthly-${suffix}`;
  const orderId = `cash-delete-order-${suffix}`;
  let expenseId: string | undefined;

  await prisma.user.create({ data: { id: actorId, name: "Cash Delete Admin", email: `${actorId}@test.local`, passwordHash: "unused", role: UserRole.ADMIN } });
  await prisma.formaPagamento.create({ data: { nome: methodName, nomeNormalizado: methodName.toLowerCase(), aplicacao: "AMBOS", ativo: true } });
  await prisma.aluno.create({ data: { id: studentId, nomeCompleto: "Cash Delete Student", telefone: suffix, vencimentoDia: 10, status: AlunoStatus.ATIVO } });

  try {
    await prisma.movimentacaoCaixa.create({ data: { id: manualId, data: new Date(), tipo: TipoMovimentacao.ENTRADA, descricao: "Manual", valor: 10, competencia: "2026-10", origem: MovimentacaoCaixaOrigem.MANUAL } });
    await deleteCashMovement({ movementId: manualId, reason: "Teste manual", actorId });
    assert.equal(await prisma.movimentacaoCaixa.count({ where: { id: manualId } }), 0);

    await prisma.mensalidade.create({ data: { id: monthlyId, alunoId: studentId, competencia: "2026-10", valor: 100, vencimento: new Date("2026-10-10T12:00:00.000Z") } });
    const registered = await registerMonthlyPayment({ mensalidadeId: monthlyId, valor: 100, formaPagamento: methodName, dataPagamento: "2026-10-10", idempotencyKey: `cash_delete_${suffix}`, actor: { id: actorId, name: "Cash Delete Admin" } });
    const paymentCash = await prisma.movimentacaoCaixa.findUniqueOrThrow({ where: { pagamentoId: registered.payment.id } });
    assert.equal(paymentCash.origem, MovimentacaoCaixaOrigem.PAGAMENTO_MENSALIDADE);
    await deleteCashMovement({ movementId: paymentCash.id, reason: "Teste pagamento", actorId });
    assert.equal(await prisma.pagamento.count({ where: { id: registered.payment.id } }), 0);
    assert.equal((await prisma.mensalidade.findUniqueOrThrow({ where: { id: monthlyId } })).status, MensalidadeStatus.ATRASADO);

    const expense = await createExpense({ dataVencimento: "2026-10-10", descricao: "Despesa integrada", valorPrevisto: 50, valorPago: 50, status: "PAGO", dataPagamento: "2026-10-10", formaPagamento: methodName }, actorId);
    expenseId = expense.id;
    const expenseCash = await prisma.movimentacaoCaixa.findUniqueOrThrow({ where: { despesaAcademiaId: expense.id } });
    assert.equal(expenseCash.origem, MovimentacaoCaixaOrigem.DESPESA);
    await deleteCashMovement({ movementId: expenseCash.id, reason: "Teste despesa", actorId });
    const revertedExpense = await prisma.despesaAcademia.findUniqueOrThrow({ where: { id: expense.id } });
    assert.equal(Number(revertedExpense.valorPago), 0);
    assert.equal(revertedExpense.status, "ATRASADO");

    await prisma.pedidoProduto.create({ data: { id: orderId, clienteNome: "Venda integrada", quantidade: 1, valorUnitario: 30, valorTotal: 30, pago: 30 } });
    await prisma.movimentacaoCaixa.create({ data: { id: `auto_pedido_${orderId}`, data: new Date(), tipo: TipoMovimentacao.ENTRADA, descricao: "Pedido", valor: 30, competencia: "2026-10", origem: MovimentacaoCaixaOrigem.PEDIDO, pedidoProdutoId: orderId } });
    await deleteCashMovement({ movementId: `auto_pedido_${orderId}`, reason: "Teste pedido", actorId });
    assert.equal(Number((await prisma.pedidoProduto.findUniqueOrThrow({ where: { id: orderId } })).pago), 0);

    await prisma.movimentacaoCaixa.create({ data: { id: unknownId, data: new Date(), tipo: TipoMovimentacao.SAIDA, descricao: "Legado", valor: 5, competencia: "2026-10" } });
    await assert.rejects(() => deleteCashMovement({ movementId: unknownId, reason: "Teste legado", actorId }), (error: unknown) => error instanceof CashDeletionError && error.status === 409);
    assert.equal(await prisma.movimentacaoCaixa.count({ where: { id: unknownId } }), 1);
    const beforeLegacy = {
      monthly: await prisma.mensalidade.count(),
      payments: await prisma.pagamento.count(),
      expenses: await prisma.despesaAcademia.count(),
      orders: await prisma.pedidoProduto.count()
    };
    await deleteLegacyCashMovement({ movementId: unknownId, reason: "Exclusão administrativa controlada", actorId });
    assert.equal(await prisma.movimentacaoCaixa.count({ where: { id: unknownId } }), 0);
    assert.deepEqual({
      monthly: await prisma.mensalidade.count(),
      payments: await prisma.pagamento.count(),
      expenses: await prisma.despesaAcademia.count(),
      orders: await prisma.pedidoProduto.count()
    }, beforeLegacy);
    assert.equal(await prisma.logAuditoria.count({ where: { userId: actorId, acao: "DELETE_LEGACY_CASH", entidadeId: unknownId } }), 1);
    await assert.rejects(() => deleteLegacyCashMovement({ movementId: unknownId, reason: "Repetição", actorId }), (error: unknown) => error instanceof CashDeletionError && error.status === 404);
    console.log(JSON.stringify({ status: "ok", manual: true, payment: true, expense: true, order: true, legacyBlocked: true, legacyAdminDeleted: true }));
  } finally {
    await prisma.logAuditoria.deleteMany({ where: { userId: actorId } });
    await prisma.movimentacaoCaixa.deleteMany({ where: { OR: [{ id: { in: [manualId, unknownId, `auto_pedido_${orderId}`] } }, { mensalidadeId: monthlyId }, ...(expenseId ? [{ despesaAcademiaId: expenseId }] : [])] } });
    await prisma.pagamento.deleteMany({ where: { mensalidadeId: monthlyId } });
    await prisma.mensalidade.deleteMany({ where: { id: monthlyId } });
    if (expenseId) await prisma.despesaAcademia.deleteMany({ where: { id: expenseId } });
    await prisma.pedidoProduto.deleteMany({ where: { id: orderId } });
    await prisma.aluno.deleteMany({ where: { id: studentId } });
    await prisma.formaPagamento.deleteMany({ where: { nomeNormalizado: methodName.toLowerCase() } });
    await prisma.user.deleteMany({ where: { id: actorId } });
  }
}

main().finally(() => prisma.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
