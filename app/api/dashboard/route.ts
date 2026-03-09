import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { currentCompetencia } from "@/lib/utils";

export async function GET() {
  const competencia = currentCompetencia();

  const [alunosAtivos, alunosInadimplentes, mensalidades, despesasAcademia, despesasFamilia, presencasMes, matriculasMes, cancelamentosMes] = await Promise.all([
    prisma.aluno.count({ where: { status: "ATIVO" } }),
    prisma.mensalidade.count({ where: { competencia, status: { in: ["PENDENTE", "ATRASADO", "PARCIAL"] } } }),
    prisma.mensalidade.findMany({ where: { competencia } }),
    prisma.despesaAcademia.findMany({ where: { competencia } }),
    prisma.despesaFamilia.findMany({ where: { competencia } }),
    prisma.presenca.count({ where: { data: { gte: new Date(`${competencia}-01T00:00:00`) } } }),
    prisma.aluno.count({ where: { dataInicio: { gte: new Date(`${competencia}-01T00:00:00`) } } }),
    prisma.aluno.count({ where: { dataSaida: { gte: new Date(`${competencia}-01T00:00:00`) } } }),
  ]);

  const receitaMes = mensalidades
    .filter((m) => ["PAGO", "PARCIAL"].includes(m.status))
    .reduce((acc, m) => acc + Number(m.valor), 0);

  const despesaMes = [...despesasAcademia, ...despesasFamilia].reduce((acc, d) => acc + Number(d.valorPago), 0);

  const pagantes = mensalidades.filter((m) => ["PAGO", "PARCIAL"].includes(m.status)).length || 1;
  const ticketMedio = receitaMes / pagantes;

  return ok({
    competencia,
    kpis: {
      alunosAtivos,
      alunosInadimplentes,
      receitaMes,
      despesaMes,
      saldoMes: receitaMes - despesaMes,
      novasMatriculasMes: matriculasMes,
      cancelamentosMes,
      frequenciaTotalMes: presencasMes,
      ticketMedio,
      taxaInadimplencia: alunosAtivos ? alunosInadimplentes / alunosAtivos : 0,
    },
  });
}
