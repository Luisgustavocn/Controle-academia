import { AlunoStatus, MensalidadeStatus, TipoMovimentacao } from "@prisma/client";
import { monthRange } from "@/lib/services/mensalidades";
import { prisma } from "@/lib/prisma";
import { currentCompetencia } from "@/lib/competencia";

export async function getDashboardSummary(referenceCompetencia = currentCompetencia()) {
  if (!process.env.DATABASE_URL) {
    return {
      referencia: referenceCompetencia,
      kpis: {
        alunos_ativos: 0,
        alunos_inadimplentes: 0,
        receita_mes: 0,
        despesa_mes: 0,
        saldo_mes: 0,
        novas_matriculas_mes: 0,
        cancelamentos_mes: 0,
        frequencia_total_mes: 0,
        ticket_medio: 0,
        taxa_inadimplencia: 0,
        taxa_retencao: 0
      },
      series: monthRange(new Date(), 12).map((competencia) => ({
        competencia,
        receita: 0,
        despesa: 0,
        saldo: 0
      }))
    };
  }

  const [alunosAtivos, alunosInadimplentes, mensalidades, despesasAcademia, despesasFamilia, caixa, presencas] = await Promise.all([
    prisma.aluno.count({ where: { status: AlunoStatus.ATIVO } }),
    prisma.mensalidade.count({ where: { competencia: referenceCompetencia, status: { in: [MensalidadeStatus.PENDENTE, MensalidadeStatus.ATRASADO] } } }),
    prisma.mensalidade.findMany({ where: { competencia: referenceCompetencia } }),
    prisma.despesaAcademia.findMany({ where: { competencia: referenceCompetencia } }),
    prisma.despesaFamilia.findMany({ where: { competencia: referenceCompetencia } }),
    prisma.movimentacaoCaixa.findMany({ where: { competencia: referenceCompetencia } }),
    prisma.presenca.count({
      where: {
        data: {
          gte: new Date(`${referenceCompetencia}-01T00:00:00.000Z`),
          lt: new Date(new Date(`${referenceCompetencia}-01T00:00:00.000Z`).setMonth(new Date(`${referenceCompetencia}-01T00:00:00.000Z`).getMonth() + 1))
        }
      }
    })
  ]);

  const receitaMes = mensalidades
    .filter((m) => m.status === MensalidadeStatus.PAGO || m.status === MensalidadeStatus.PARCIAL)
    .reduce((acc, item) => acc + Number(item.valor), 0);

  const despesaMes =
    despesasAcademia.reduce((acc, item) => acc + Number(item.valorPago || item.valorPrevisto), 0) +
    despesasFamilia.reduce((acc, item) => acc + Number(item.valorPago || item.valorPrevisto), 0);

  const saldoMes = caixa.reduce((acc, item) => {
    return item.tipo === TipoMovimentacao.ENTRADA ? acc + Number(item.valor) : acc - Number(item.valor);
  }, receitaMes - despesaMes);

  const alunosPagantes =
    mensalidades.filter((m) => m.status === MensalidadeStatus.PAGO || m.status === MensalidadeStatus.PARCIAL).length || 1;

  const taxaInadimplencia = alunosAtivos === 0 ? 0 : alunosInadimplentes / alunosAtivos;

  const controle = await prisma.controleMensalAlunos.findUnique({ where: { competencia: referenceCompetencia } });
  const taxaRetencao = controle && controle.inicioMes > 0 ? controle.totalFinal / controle.inicioMes : 1;

  const series = await buildFinanceSeries();

  return {
    referencia: referenceCompetencia,
    kpis: {
      alunos_ativos: alunosAtivos,
      alunos_inadimplentes: alunosInadimplentes,
      receita_mes: receitaMes,
      despesa_mes: despesaMes,
      saldo_mes: saldoMes,
      novas_matriculas_mes: controle?.entrou ?? 0,
      cancelamentos_mes: controle?.saiu ?? 0,
      frequencia_total_mes: presencas,
      ticket_medio: receitaMes / alunosPagantes,
      taxa_inadimplencia: taxaInadimplencia,
      taxa_retencao: taxaRetencao
    },
    series
  };
}

async function buildFinanceSeries() {
  const competencias = monthRange(new Date(), 12);
  const result = [] as Array<{ competencia: string; receita: number; despesa: number; saldo: number }>;

  for (const competencia of competencias) {
    const [mensalidades, despesasA, despesasF] = await Promise.all([
      prisma.mensalidade.findMany({ where: { competencia } }),
      prisma.despesaAcademia.findMany({ where: { competencia } }),
      prisma.despesaFamilia.findMany({ where: { competencia } })
    ]);

    const receita = mensalidades
      .filter((m) => m.status === MensalidadeStatus.PAGO || m.status === MensalidadeStatus.PARCIAL)
      .reduce((acc, item) => acc + Number(item.valor), 0);

    const despesa =
      despesasA.reduce((acc, item) => acc + Number(item.valorPago || item.valorPrevisto), 0) +
      despesasF.reduce((acc, item) => acc + Number(item.valorPago || item.valorPrevisto), 0);

    result.push({
      competencia,
      receita,
      despesa,
      saldo: receita - despesa
    });
  }

  return result;
}
