import { AlunoStatus, MensalidadeStatus, TipoMovimentacao } from "@prisma/client";
import { monthRange } from "@/lib/services/mensalidades";
import { prisma } from "@/lib/prisma";
import { currentCompetencia } from "@/lib/competencia";
import { syncAutomaticEntriesInCaixa } from "@/lib/services/caixa";

function competenciaRange(competencia: string) {
  const start = new Date(`${competencia}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

export async function getDashboardSummary(referenceCompetencia = currentCompetencia()) {
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
    series: monthRange(new Date(), 12).map((competencia) => ({
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
    await syncAutomaticEntriesInCaixa();

    const { start: mesStart, end: mesEnd } = competenciaRange(referenceCompetencia);

    const [alunosAtivos, alunosInadimplentes, mensalidadesRecebidasNoMes, despesasAcademia, caixa, presencas, pedidosPagosMes] = await Promise.all([
      prisma.aluno.count({ where: { status: AlunoStatus.ATIVO } }),
      prisma.mensalidade.count({ where: { competencia: referenceCompetencia, status: { in: [MensalidadeStatus.PENDENTE, MensalidadeStatus.ATRASADO] } } }),
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
      })
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

    const alunosPagantes = new Set(mensalidadesRecebidasNoMes.map((m) => m.alunoId)).size || 1;

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
  } catch {
    return {
      ...fallback
    };
  }
}

async function buildFinanceSeries() {
  const competencias = monthRange(new Date(), 12);
  const result = [] as Array<{ competencia: string; receita: number; despesa: number; saldo: number }>;

  for (const competencia of competencias) {
    const { start, end } = competenciaRange(competencia);

    const [mensalidadesRecebidasNoMes, despesasA, pedidosPagos] = await Promise.all([
      prisma.mensalidade.findMany({
        where: {
          status: { in: [MensalidadeStatus.PAGO, MensalidadeStatus.PARCIAL] },
          dataPagamento: {
            gte: start,
            lt: end
          }
        },
        select: {
          valor: true
        }
      }),
      prisma.despesaAcademia.findMany({ where: { competencia } }),
      prisma.pedidoProduto.aggregate({
        _sum: { pago: true },
        where: {
          dataPedido: {
            gte: start,
            lt: end
          }
        }
      })
    ]);

    const receitaMensalidades = mensalidadesRecebidasNoMes.reduce((acc, item) => acc + Number(item.valor), 0);
    const receitaProdutos = Number(pedidosPagos._sum.pago ?? 0);
    const receita = receitaMensalidades + receitaProdutos;

    const despesa = despesasA.reduce((acc, item) => acc + Number(item.valorPago || item.valorPrevisto), 0);

    result.push({
      competencia,
      receita,
      despesa,
      saldo: receita - despesa
    });
  }

  return result;
}
