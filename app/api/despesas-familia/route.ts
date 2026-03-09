import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { currentCompetencia } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const competencia = req.nextUrl.searchParams.get("competencia") || currentCompetencia();
  const despesas = await prisma.despesaFamilia.findMany({ where: { competencia }, orderBy: { dataVencimento: "asc" } });
  const totalPrevisto = despesas.reduce((acc, d) => acc + Number(d.valorPrevisto), 0);
  const totalPago = despesas.reduce((acc, d) => acc + Number(d.valorPago), 0);

  return ok({ despesas, totalPrevisto, totalPago, totalPendente: totalPrevisto - totalPago });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const despesa = await prisma.despesaFamilia.create({
    data: {
      dataVencimento: new Date(body.dataVencimento),
      competencia: body.competencia || currentCompetencia(),
      descricao: body.descricao,
      categoria: body.categoria,
      valorPrevisto: body.valorPrevisto,
      valorPago: body.valorPago || 0,
      status: body.status || "PENDENTE",
      dataPagamento: body.dataPagamento ? new Date(body.dataPagamento) : null,
      observacao: body.observacao,
    },
  });
  return ok({ despesa }, 201);
}
