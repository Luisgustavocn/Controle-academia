import { AlunoStatus, MensalidadeStatus, TipoMovimentacao } from "@prisma/client";
import { monthRange } from "@/lib/services/mensalidades";
import { prisma } from "@/lib/prisma";
import { currentCompetencia } from "@/lib/competencia";

export type DashboardKpis = {
  alunos_ativos: number;
  alunos_inadimplentes: number;
  receita_mes: number;
  despesa_mes: number;
  saldo_mes: number;
  novas_matriculas_mes: number;
  cancelamentos_mes: number;
  frequencia_total_mes: number;
  ticket_medio: number;
  taxa_inadimplencia: number;
  taxa_retencao: number;
};

export type FinanceSeriesItem = {
  competencia: string;
  receita: number;
  despesa: number;
  saldo: number;
};

type FinanceSeriesRows = {
  mensalidades: Array<{ dataPagamento: Date | null; valor: unknown }>;
  despesas: Array<{ competencia: string; valorPrevisto: unknown; valorPago: unknown }>;
  pedidos: Array<{ dataPedido: Date; pago: unknown }>;
};

function competenciaRange(competencia: string) {
  const start = new Date(`${competencia}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

export async function getDashboardSummary(referenceCompetencia = currentCompetencia()) {
  const competencias = monthRange(new Date(), 12);
  const fallback = {
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
    series: competencias.map((competencia) => ({
      competencia,
      receita: 0,
      despesa: 0,
      saldo: 0
    }))
  };

  if (!process.env.DATABASE_URL) {
    return fallback;
  }

  try {
    const [kpis, series] = await Promise.all([
      getDashboardKpis(referenceCompetencia),
      buildFinanceSeries(competencias)
    ]);

    return {
      referencia: referenceCompetencia,
      kpis,
      series
    };
  } catch {
    return {
      ...fallback
    };
  }
}

export async function getDashboardKpis(referenceCompetencia: string): Promise<DashboardKpis> {
  const { start: mesStart, end: mesEnd } = competenciaRange(referenceCompetencia);

  const [
    alunosAtivos,
    alunosInadimplentes,
    mensalidadesRecebidasNoMes,
    despesasAcademia,
    caixa,
    presencas,
    pedidosPagosMes,
    controle
  ] = await Promise.all([
    prisma.aluno.count({ where: { status: AlunoStatus.ATIVO } }),
    prisma.mensalidade.count({
      where: {
        competencia: referenceCompetencia,
        status: { in: [MensalidadeStatus.PENDENTE, MensalidadeStatus.ATRASADO] }
      }
    }),
    prisma.mensalidade.findMany({
      where: {
        status: { in: [MensalidadeStatus.PAGO, MensalidadeStatus.PARCIAL] },
        dataPagamento: {
          gte: mesStart,
          lt: mesEnd
        }
      },
      select: {
        alunoId: true,
        valor: true
      }
    }),
    prisma.despesaAcademia.findMany({ where: { competencia: referenceCompetencia } }),
    prisma.movimentacaoCaixa.findMany({ where: { competencia: referenceCompetencia } }),
    prisma.presenca.count({
      where: {
        data: {
          gte: mesStart,
          lt: mesEnd
        }
      }
    }),
    prisma.pedidoProduto.aggregate({
      _sum: { pago: true },
      where: {
        dataPedido: {
          gte: mesStart,
          lt: mesEnd
        }
      }
    }),
    prisma.controleMensalAlunos.findUnique({ where: { competencia: referenceCompetencia } })
  ]);

  const receitaMensalidades = mensalidadesRecebidasNoMes.reduce((acc, item) => acc + Number(item.valor), 0);
  const receitaProdutos = Number(pedidosPagosMes._sum.pago ?? 0);
  const receitaMes = receitaMensalidades + receitaProdutos;
  const despesaMes = despesasAcademia.reduce((acc, item) => acc + Number(item.valorPago || item.valorPrevisto), 0);
  const ajustesManuaisCaixa = caixa
    .filter((item) => !item.id.startsWith("auto_"))
    .reduce((acc, item) => {
      return item.tipo === TipoMovimentacao.ENTRADA ? acc + Number(item.valor) : acc - Number(item.valor);
    }, 0);
  const saldoMes = receitaMes - despesaMes + ajustesManuaisCaixa;
  const alunosPagantes = new Set(mensalidadesRecebidasNoMes.map((item) => item.alunoId)).size || 1;
  const taxaInadimplencia = alunosAtivos === 0 ? 0 : alunosInadimplentes / alunosAtivos;
  const taxaRetencao = controle && controle.inicioMes > 0 ? controle.totalFinal / controle.inicioMes : 1;

  return {
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
  };
}

function dateCompetencia(date: Date) {
  return date.toISOString().slice(0, 7);
}

export function buildFinanceSeriesFromRows(
  competencias: string[],
  rows: FinanceSeriesRows
): FinanceSeriesItem[] {
  const byCompetencia = new Map(
    competencias.map((competencia) => [competencia, { receita: 0, despesa: 0 }])
  );

  for (const mensalidade of rows.mensalidades) {
    if (!mensalidade.dataPagamento) continue;
    const totals = byCompetencia.get(dateCompetencia(mensalidade.dataPagamento));
    if (totals) totals.receita += Number(mensalidade.valor);
  }

  for (const pedido of rows.pedidos) {
    const totals = byCompetencia.get(dateCompetencia(pedido.dataPedido));
    if (totals) totals.receita += Number(pedido.pago);
  }

  for (const despesa of rows.despesas) {
    const totals = byCompetencia.get(despesa.competencia);
    if (totals) totals.despesa += Number(despesa.valorPago || despesa.valorPrevisto);
  }

  return competencias.map((competencia) => {
    const totals = byCompetencia.get(competencia) ?? { receita: 0, despesa: 0 };
    return {
      competencia,
      receita: totals.receita,
      despesa: totals.despesa,
      saldo: totals.receita - totals.despesa
    };
  });
}

async function buildFinanceSeries(competencias: string[]) {
  const first = competencias[0];
  const last = competencias[competencias.length - 1];
  if (!first || !last) return [];

  const start = competenciaRange(first).start;
  const end = competenciaRange(last).end;
  const [mensalidades, despesas, pedidos] = await Promise.all([
    prisma.mensalidade.findMany({
      where: {
        status: { in: [MensalidadeStatus.PAGO, MensalidadeStatus.PARCIAL] },
        dataPagamento: { gte: start, lt: end }
      },
      select: { dataPagamento: true, valor: true }
    }),
    prisma.despesaAcademia.findMany({
      where: { competencia: { in: competencias } },
      select: { competencia: true, valorPrevisto: true, valorPago: true }
    }),
    prisma.pedidoProduto.findMany({
      where: { dataPedido: { gte: start, lt: end } },
      select: { dataPedido: true, pago: true }
    })
  ]);

  return buildFinanceSeriesFromRows(competencias, { mensalidades, despesas, pedidos });
}
