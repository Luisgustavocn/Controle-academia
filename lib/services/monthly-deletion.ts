import { Prisma, TipoMovimentacao } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { AUTO_PAGAMENTO_PREFIX } from "@/lib/services/caixa";

const AUTO_MENSALIDADE_PREFIX = "auto_mensalidade_";
export class MonthlyDeletionError extends Error { constructor(message: string, readonly status = 409) { super(message); } }

export async function deleteMonthlySafely(id: string, reason: string, actorId: string) {
  if (!reason.trim()) throw new MonthlyDeletionError("Motivo da exclusão é obrigatório", 400);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Mensalidade" WHERE "id" = ${id} FOR UPDATE`);
    const monthly = await tx.mensalidade.findUnique({ where: { id }, include: { aluno: { select: { id: true, nomeCompleto: true } }, pagamentos: true } });
    if (!monthly) throw new MonthlyDeletionError("Mensalidade não encontrada", 404);
    const paymentIds = monthly.pagamentos.map((payment) => payment.id);
    const deterministicIds = [...paymentIds.map((paymentId) => `${AUTO_PAGAMENTO_PREFIX}${paymentId}`), `${AUTO_MENSALIDADE_PREFIX}${id}`];
    const cash = await tx.movimentacaoCaixa.findMany({ where: { OR: [
      { pagamentoId: { in: paymentIds.length ? paymentIds : ["__none__"] } },
      { mensalidadeId: id },
      { id: { in: deterministicIds } }
    ] } });
    const byPayment = new Map(cash.filter((item) => item.pagamentoId).map((item) => [item.pagamentoId!, item]));
    for (const payment of monthly.pagamentos) {
      const candidates = cash.filter((item) => item.pagamentoId === payment.id || item.id === `${AUTO_PAGAMENTO_PREFIX}${payment.id}`);
      if (candidates.length !== 1) throw new MonthlyDeletionError("Esta mensalidade possui histórico financeiro legado que não pode ser reconciliado automaticamente com segurança.");
      const entry = candidates[0];
      if (entry.pagamentoId && entry.pagamentoId !== payment.id) throw new MonthlyDeletionError("Vínculo financeiro conflitante");
      if (entry.tipo !== TipoMovimentacao.ENTRADA || entry.alunoId !== monthly.alunoId || !new Prisma.Decimal(entry.valor).eq(payment.valor)) {
        throw new MonthlyDeletionError("Esta mensalidade possui histórico financeiro legado que não pode ser reconciliado automaticamente com segurança.");
      }
      byPayment.set(payment.id, entry);
    }
    if (monthly.pagamentos.length === 0) {
      const legacy = cash.filter((item) => item.id === `${AUTO_MENSALIDADE_PREFIX}${id}` || item.mensalidadeId === id);
      if (legacy.length > 1) throw new MonthlyDeletionError("Esta mensalidade possui histórico financeiro legado ambíguo.");
    }
    const allowedIds = new Set([...byPayment.values()].map((item) => item.id));
    for (const item of cash) {
      if (item.pagamentoId || item.mensalidadeId === id || item.id === `${AUTO_MENSALIDADE_PREFIX}${id}`) allowedIds.add(item.id);
    }
    const snapshot = {
      motivo: reason.trim(), mensalidade: { id: monthly.id, alunoId: monthly.alunoId, alunoNome: monthly.aluno.nomeCompleto, competencia: monthly.competencia, valor: monthly.valor, valorFinal: monthly.valorFinal, motivoAjuste: monthly.motivoAjuste, status: monthly.status },
      pagamentos: monthly.pagamentos.map((p) => ({ id: p.id, valor: p.valor, formaPagamento: p.formaPagamento, dataPagamento: p.dataPagamento, status: p.status })),
      caixa: cash.filter((item) => allowedIds.has(item.id)).map((item) => ({ id: item.id, valor: item.valor, data: item.data, pagamentoId: item.pagamentoId, mensalidadeId: item.mensalidadeId }))
    };
    if (allowedIds.size) await tx.movimentacaoCaixa.deleteMany({ where: { id: { in: [...allowedIds] } } });
    if (paymentIds.length) await tx.pagamento.deleteMany({ where: { id: { in: paymentIds } } });
    await tx.mensalidade.delete({ where: { id } });
    await logAudit({ userId: actorId, modulo: "mensalidades", entidade: "Mensalidade", entidadeId: id, acao: "DELETE_RECONCILED", antes: snapshot, depois: null }, tx);
    return { removedPayments: paymentIds.length, removedCash: allowedIds.size };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
