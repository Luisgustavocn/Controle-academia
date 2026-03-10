import { TipoMovimentacao, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/guards";
import { toCompetencia } from "@/lib/competencia";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { isAutoCaixaEntryId } from "@/lib/services/caixa";

function parseDate(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${fieldName} é obrigatória`);
  }

  const raw = String(value).trim();
  if (!raw) {
    throw new Error(`${fieldName} é obrigatória`);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    const parsed = new Date(year, month - 1, day);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`${fieldName} inválida`);
    }
    return parsed;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} inválida`);
  }
  return parsed;
}

function parseTipo(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const normalized = String(value).toUpperCase();
  if (normalized !== "ENTRADA" && normalized !== "SAIDA") {
    throw new Error("tipo inválido");
  }

  return normalized as TipoMovimentacao;
}

function parseValor(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error("valor inválido");
  }
  return parsed;
}

function optionalString(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized === "" ? null : normalized;
}

async function validateCategoria(categoriaId: string | null | undefined, tipo: TipoMovimentacao) {
  if (!categoriaId) {
    return;
  }

  const categoria = await prisma.categoriaFinanceira.findUnique({
    where: { id: categoriaId },
    select: { id: true, ativa: true, tipo: true }
  });

  if (!categoria) {
    throw new Error("Categoria não encontrada");
  }

  if (!categoria.ativa) {
    throw new Error("Categoria inativa");
  }

  if (categoria.tipo && categoria.tipo !== tipo) {
    throw new Error(`Categoria não pertence ao tipo ${tipo}`);
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, UserRole.FINANCEIRO);
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  if (isAutoCaixaEntryId(id)) {
    return fail("Lançamento automático. Edite o pagamento na origem (mensalidade ou pedido).", 400);
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const previous = await prisma.movimentacaoCaixa.findUnique({ where: { id } });
  if (!previous) {
    return fail("Movimentação não encontrada", 404);
  }

  try {
    const data = body.data === undefined ? previous.data : parseDate(body.data, "data");
    const tipo = parseTipo(body.tipo) ?? previous.tipo;
    const valor = parseValor(body.valor);
    const categoriaId = optionalString(body.categoriaId);
    const descricao = body.descricao === undefined ? undefined : String(body.descricao).trim();

    if (descricao !== undefined && !descricao) {
      return fail("descrição é obrigatória", 400);
    }

    await validateCategoria(categoriaId === undefined ? previous.categoriaId : categoriaId, tipo);

    const updated = await prisma.movimentacaoCaixa.update({
      where: { id },
      data: {
        data,
        tipo,
        categoriaId,
        descricao,
        valor,
        origemDestino: optionalString(body.origemDestino),
        alunoId: optionalString(body.alunoId),
        formaPagamento: optionalString(body.formaPagamento),
        competencia: toCompetencia(data),
        observacao: optionalString(body.observacao)
      }
    });

    await logAudit({
      userId: auth.id,
      modulo: "caixa",
      entidade: "movimentacaoCaixa",
      entidadeId: id,
      acao: "UPDATE",
      antes: previous,
      depois: updated
    });

    return ok({ item: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar movimentação";
    return fail(message, 400);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, UserRole.FINANCEIRO);
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  if (isAutoCaixaEntryId(id)) {
    return fail("Lançamento automático. Remova ou ajuste o pagamento na origem.", 400);
  }
  const previous = await prisma.movimentacaoCaixa.findUnique({ where: { id } });
  if (!previous) {
    return fail("Movimentação não encontrada", 404);
  }

  await prisma.movimentacaoCaixa.delete({ where: { id } });

  await logAudit({
    userId: auth.id,
    modulo: "caixa",
    entidade: "movimentacaoCaixa",
    entidadeId: id,
    acao: "DELETE",
    antes: previous
  });

  return ok({ ok: true });
}
