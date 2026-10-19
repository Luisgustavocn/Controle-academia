import { MovimentacaoCaixaOrigem, Prisma, TipoMovimentacao } from "@prisma/client";
import { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { requireCapability } from "@/lib/auth/guards";
import { toCompetencia } from "@/lib/competencia";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { syncAutomaticEntriesInCaixa } from "@/lib/services/caixa";
import { resolvePaymentMethodForWrite } from "@/lib/services/payment-methods";
import { addCivilDays, civilDateToPrisma, civilMonthRange, parseCivilDate } from "@/lib/attendance-date";

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
  const auth = requireCapability(request, "finance.cash.read");
  if (auth instanceof Response) return auth;

  await syncAutomaticEntriesInCaixa();

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const competencia = request.nextUrl.searchParams.get("competencia") ?? "";
  const tipo = parseTipoQuery(request.nextUrl.searchParams.get("tipo"));
  const categoriaId = request.nextUrl.searchParams.get("categoriaId") ?? "";
  const visao = request.nextUrl.searchParams.get("visao") ?? "mensal";
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("pageSize") ?? "50") || 50));
  let range: { start: Date; end: Date } | undefined;
  try {
    if (visao === "diaria") { const date = parseCivilDate(request.nextUrl.searchParams.get("data")); range = { start: civilDateToPrisma(date), end: civilDateToPrisma(addCivilDays(date, 1)) }; }
    else if (visao === "anual") { const year = Number(request.nextUrl.searchParams.get("ano")); if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error(); range = { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) }; }
    else if (competencia) range = civilMonthRange(competencia);
  } catch { return fail("Período inválido", 400); }

  const where: Prisma.MovimentacaoCaixaWhereInput = {
    ...(competencia ? { competencia } : {}),
    ...(tipo ? { tipo } : {}),
    ...(categoriaId ? { categoriaId } : {}),
    ...(range ? { data: { gte: range.start, lt: range.end } } : {}),
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

  const [items, totalItems, entradas, saidas] = await Promise.all([
    prisma.movimentacaoCaixa.findMany({ where, include: {
      aluno: { select: { nomeCompleto: true } },
      categoria: { select: { id: true, nome: true, tipo: true } }
    }, orderBy: [{ data: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.movimentacaoCaixa.count({ where }),
    prisma.movimentacaoCaixa.aggregate({ where: { ...where, tipo: TipoMovimentacao.ENTRADA }, _sum: { valor: true } }),
    prisma.movimentacaoCaixa.aggregate({ where: { ...where, tipo: TipoMovimentacao.SAIDA }, _sum: { valor: true } })
  ]);
  const entrada = entradas._sum.valor ?? new Prisma.Decimal(0); const saida = saidas._sum.valor ?? new Prisma.Decimal(0);
  const monthly = visao === "anual" && range ? await prisma.$queryRaw<Array<{ mes: number; entradas: Prisma.Decimal; saidas: Prisma.Decimal }>>(Prisma.sql`
    SELECT EXTRACT(MONTH FROM "data")::int AS mes,
      COALESCE(SUM(CASE WHEN "tipo" = 'ENTRADA' THEN "valor" ELSE 0 END), 0) AS entradas,
      COALESCE(SUM(CASE WHEN "tipo" = 'SAIDA' THEN "valor" ELSE 0 END), 0) AS saidas
    FROM "MovimentacaoCaixa" WHERE "data" >= ${range.start} AND "data" < ${range.end} GROUP BY 1 ORDER BY 1`) : [];

  return ok({ items, summary: { entradas: entrada, saidas: saida, saldo: entrada.minus(saida) }, monthly: monthly.map((m) => ({ ...m, saldo: new Prisma.Decimal(m.entradas).minus(m.saidas) })), pagination: { page, pageSize, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)) } });
}

export async function POST(request: NextRequest) {
  const auth = requireCapability(request, "finance.cash.manage");
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
    const formaPagamento = await resolvePaymentMethodForWrite({
      value: body.formaPagamento,
      application: tipo === TipoMovimentacao.SAIDA ? "DESPESA" : "RECEBIMENTO",
      required: false
    });

    const created = await prisma.movimentacaoCaixa.create({
      data: {
        data,
        tipo,
        categoriaId,
        descricao,
        valor,
        origemDestino: optionalString(body.origemDestino),
        alunoId: optionalString(body.alunoId),
        formaPagamento,
        competencia: toCompetencia(data),
        observacao: optionalString(body.observacao),
        origem: MovimentacaoCaixaOrigem.MANUAL
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
