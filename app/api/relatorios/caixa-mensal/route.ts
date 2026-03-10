import { TipoMovimentacao, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { currentCompetencia } from "@/lib/competencia";

export async function GET(request: NextRequest) {
  const auth = requireRole(request, UserRole.FINANCEIRO);
  if (auth instanceof Response) return auth;

  const competencia = request.nextUrl.searchParams.get("competencia") || currentCompetencia();
  const items = await prisma.movimentacaoCaixa.findMany({
    where: { competencia },
    include: {
      categoria: { select: { nome: true } },
      aluno: { select: { nomeCompleto: true } }
    },
    orderBy: { data: "asc" }
  });

  const totalEntradas = items
    .filter((item) => item.tipo === TipoMovimentacao.ENTRADA)
    .reduce((acc, item) => acc + Number(item.valor), 0);

  const totalSaidas = items
    .filter((item) => item.tipo === TipoMovimentacao.SAIDA)
    .reduce((acc, item) => acc + Number(item.valor), 0);

  return ok({
    competencia,
    totalEntradas,
    totalSaidas,
    saldoMes: totalEntradas - totalSaidas,
    items
  });
}
