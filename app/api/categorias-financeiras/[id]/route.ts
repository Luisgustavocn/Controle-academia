import { TipoMovimentacao } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireCapability(request, "finance.cash.manage"); if (auth instanceof Response) return auth;
  const { id } = await context.params; const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const previous = await prisma.categoriaFinanceira.findUnique({ where: { id }, include: { _count: { select: { movimentacoes: true, despesasAcademia: true } } } });
  if (!previous) return fail("Categoria não encontrada", 404);
  const tipo = body.tipo ? String(body.tipo).toUpperCase() as TipoMovimentacao : previous.tipo;
  if (tipo && !Object.values(TipoMovimentacao).includes(tipo)) return fail("Tipo inválido", 400);
  if (previous._count.movimentacoes + previous._count.despesasAcademia > 0 && tipo !== previous.tipo) return fail("O tipo de uma categoria com histórico financeiro não pode ser alterado.", 409);
  const item = await prisma.categoriaFinanceira.update({ where: { id }, data: { nome: body.nome === undefined ? undefined : String(body.nome).trim(), descricao: body.descricao === undefined ? undefined : String(body.descricao).trim() || null, ativa: body.ativa === undefined ? undefined : body.ativa === true || body.ativa === "true", tipo } });
  await logAudit({ userId: auth.id, modulo: "categorias-financeiras", entidade: "CategoriaFinanceira", entidadeId: id, acao: "UPDATE", antes: previous, depois: item });
  return ok({ item });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireCapability(request, "finance.cash.manage"); if (auth instanceof Response) return auth;
  const { id } = await context.params;
  const previous = await prisma.categoriaFinanceira.findUnique({ where: { id }, include: { _count: { select: { movimentacoes: true, despesasAcademia: true } } } });
  if (!previous) return fail("Categoria não encontrada", 404);
  if (previous._count.movimentacoes + previous._count.despesasAcademia > 0) return fail("Esta categoria possui histórico financeiro e não pode ser excluída. Desative-a para impedir novos usos.", 409);
  await prisma.categoriaFinanceira.delete({ where: { id } });
  await logAudit({ userId: auth.id, modulo: "categorias-financeiras", entidade: "CategoriaFinanceira", entidadeId: id, acao: "DELETE", antes: previous, depois: null });
  return ok({ ok: true });
}
