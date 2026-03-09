import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { currentCompetencia } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const tipo = req.nextUrl.searchParams.get("tipo") || "resumo";
  const competencia = req.nextUrl.searchParams.get("competencia") || currentCompetencia();

  if (tipo === "inadimplentes") {
    const data = await prisma.mensalidade.findMany({
      where: { competencia, status: { in: ["PENDENTE", "ATRASADO", "PARCIAL"] } },
      include: { aluno: true },
    });
    return ok({ tipo, data });
  }

  if (tipo === "frequencia") {
    const from = new Date(`${competencia}-01T00:00:00`);
    const to = new Date(from);
    to.setMonth(to.getMonth() + 1);
    const data = await prisma.presenca.groupBy({ by: ["alunoId"], where: { data: { gte: from, lt: to } }, _count: true });
    return ok({ tipo, data });
  }

  const [alunosAtivos, receita, despesas] = await Promise.all([
    prisma.aluno.count({ where: { status: "ATIVO" } }),
    prisma.mensalidade.aggregate({ where: { competencia, status: { in: ["PAGO", "PARCIAL"] } }, _sum: { valor: true } }),
    prisma.despesaAcademia.aggregate({ where: { competencia }, _sum: { valorPago: true } }),
  ]);

  return ok({
    tipo: "resumo",
    competencia,
    data: {
      alunosAtivos,
      receita: Number(receita._sum.valor || 0),
      despesas: Number(despesas._sum.valorPago || 0),
    },
  });
}
