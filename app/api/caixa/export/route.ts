import {} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { currentCompetencia } from "@/lib/competencia";
import { syncAutomaticEntriesInCaixa } from "@/lib/services/caixa";

export async function GET(request: NextRequest) {
  const auth = requireCapability(request, "reports.financial");
  if (auth instanceof Response) return auth;

  await syncAutomaticEntriesInCaixa();

  const competencia = request.nextUrl.searchParams.get("competencia") || currentCompetencia();
  const items = await prisma.movimentacaoCaixa.findMany({
    where: { competencia },
    include: {
      categoria: { select: { nome: true } },
      aluno: { select: { nomeCompleto: true } }
    },
    orderBy: { data: "asc" }
  });

  const headers = ["data", "tipo", "categoria", "descricao", "valor", "origemDestino", "aluno", "formaPagamento", "competencia", "observacao"];
  const lines = [headers.join(";")];

  for (const item of items) {
    lines.push(
      [
        item.data.toISOString().slice(0, 10),
        item.tipo,
        item.categoria?.nome ?? "",
        item.descricao,
        Number(item.valor).toFixed(2),
        item.origemDestino ?? "",
        item.aluno?.nomeCompleto ?? "",
        item.formaPagamento ?? "",
        item.competencia,
        item.observacao ?? ""
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(";")
    );
  }

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=caixa-${competencia}.csv`
    }
  });
}
