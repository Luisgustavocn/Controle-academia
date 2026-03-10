import { Prisma, TipoMovimentacao, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/guards";
import { toCompetencia } from "@/lib/competencia";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { syncAutomaticEntriesInCaixa } from "@/lib/services/caixa";

function parseDate(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${fieldName} é obrigatório`);
  }

  const raw = String(value).trim();
  if (!raw) {
    throw new Error(`${fieldName} é obrigatório`);
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

function parseTipo(value: unknown, required = false) {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new Error("tipo é obrigatório");
    }
    return undefined;
  }

  const normalized = String(value).toUpperCase();
  if (normalized !== "ENTRADA" && normalized !== "SAIDA") {
    throw new Error("tipo inválido");
  }

  return normalized as TipoMovimentacao;
}

function parseValor(value: unknown) {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error("valor inválido");
  }
  return parsed;
}

function optionalString(value: unknown) {
  if (value === undefined || value === null) return undefined;
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

function parseTipoQuery(value: string | null) {
  if (!value) return undefined;
  const normalized = value.toUpperCase();
  if (normalized === "ENTRADA" || normalized === "SAIDA") {
    return normalized as TipoMovimentacao;
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, UserRole.FINANCEIRO);
  if (auth instanceof Response) return auth;

  await syncAutomaticEntriesInCaixa();

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const competencia = request.nextUrl.searchParams.get("competencia") ?? "";
  const tipo = parseTipoQuery(request.nextUrl.searchParams.get("tipo"));
  const categoriaId = request.nextUrl.searchParams.get("categoriaId") ?? "";

  const where: Prisma.MovimentacaoCaixaWhereInput = {
    ...(competencia ? { competencia } : {}),
    ...(tipo ? { tipo } : {}),
    ...(categoriaId ? { categoriaId } : {}),
    ...(q
      ? {
          OR: [
            { descricao: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { origemDestino: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { competencia: { contains: q, mode: Prisma.QueryMode.insensitive } }
          ]
        }
      : {})
  };

  const items = await prisma.movimentacaoCaixa.findMany({
    where,
    include: {
      aluno: { select: { nomeCompleto: true } },
      categoria: { select: { id: true, nome: true, tipo: true } }
    },
    orderBy: [{ data: "desc" }, { createdAt: "desc" }]
  });

  return ok({ items });
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, UserRole.FINANCEIRO);
  if (auth instanceof Response) return auth;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const data = parseDate(body.data, "data");
    const tipo = parseTipo(body.tipo, true) as TipoMovimentacao;
    const descricao = String(body.descricao ?? "").trim();
    const valor = parseValor(body.valor);
    const categoriaId = optionalString(body.categoriaId);

    if (!descricao) {
      return fail("descrição é obrigatória", 400);
    }

    await validateCategoria(categoriaId, tipo);

    const created = await prisma.movimentacaoCaixa.create({
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
      entidadeId: String(created.id),
      acao: "CREATE",
      depois: created
    });

    return ok({ item: created }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar movimentação";
    return fail(message, 400);
  }
}
