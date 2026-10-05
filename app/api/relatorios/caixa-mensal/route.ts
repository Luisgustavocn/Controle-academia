import { TipoMovimentacao } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { currentCompetencia } from "@/lib/competencia";
import { syncAutomaticEntriesInCaixa } from "@/lib/services/caixa";

export async function GET(request: NextRequest) {
  const auth = requireCapability(request, "reports.financial");
  if (auth instanceof Response) return auth;

  await syncAutomaticEntriesInCaixa();

  const competenciaParam = request.nextUrl.searchParams.get("competencia");
  if (competenciaParam && !/^\d{4}-\d{2}$/.test(competenciaParam)) {
    return fail("competencia inválida. Use yyyy-mm", 400);
  }
  const competencia = competenciaParam || currentCompetencia();
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
