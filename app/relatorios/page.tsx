"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Minus,
  TrendingDown,
  TrendingUp
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { ModuleHeader } from "@/components/ui/module-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MonthYearPicker } from "@/components/ui/month-year-picker";

type AlunoAtivo = {
  id: string;
  nomeCompleto: string;
  telefone: string;
  status: string;
  vencimentoDia: number;
  modalidade?: {
    nome: string;
  } | null;
};

type Inadimplente = {
  id: string;
  competencia: string;
  valor: number;
  vencimento: string;
  status: string;
  aluno: {
    nomeCompleto: string;
    telefone: string;
  };
};

type CaixaItem = {
  id: string;
  data: string;
  tipo: "ENTRADA" | "SAIDA";
  descricao: string;
  valor: number;
  categoria?: {
    nome: string;
  } | null;
  aluno?: {
    nomeCompleto: string;
  } | null;
};

type FrequenciaRanking = {
  nome: string;
  total: number;
};

type VencimentoItem = {
  id: string;
  competencia: string;
  valor: number;
  vencimento: string;
  status: string;
  dataPagamento?: string | null;
  aluno: {
    nomeCompleto: string;
    telefone: string;
    vencimentoDia: number;
    modalidade?: {
      nome: string;
    } | null;
  };
};

type DespesaCategoriaItem = {
  categoria: string;
  quantidade: number;
  valorPrevisto: number;
  valorPago: number;
  pendentes: number;
};

type PedidoResumoItem = {
  id: string;
  clienteNome: string;
  valorTotal: number;
  pago: number;
  dataPedido: string;
  aluno?: {
    nomeCompleto: string;
  } | null;
};

type ProdutoResumo = {
  produto: string;
  quantidade: number;
  faturamento: number;
};

type AlunoMovimentoSerie = {
  competencia: string;
  inicioMes: number;
  entrou: number;
  saiu: number;
  totalFinal: number;
};

type MensalidadesResumo = {
  pagas: number;
  pendentes: number;
  atrasadas: number;
  totalPagoMes: number;
  totalPendenteMes: number;
  totalAtrasado: number;
};

type DashboardKpis = {
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

type RelatoriosState = {
  ativos: AlunoAtivo[];
  inadimplentes: Inadimplente[];
  vencimentos: VencimentoItem[];
  caixa: {
    competencia: string;
    totalEntradas: number;
    totalSaidas: number;
    saldoMes: number;
    items: CaixaItem[];
  };
  frequencia: {
    competencia: string;
    totalPresencasMes: number;
    ranking: FrequenciaRanking[];
    baixaFrequencia: FrequenciaRanking[];
  };
  despesasCategorias: {
    totalPrevisto: number;
    totalPago: number;
    items: DespesaCategoriaItem[];
  };
  pedidos: {
    totalPedidos: number;
    totalFaturado: number;
    totalRecebido: number;
    totalEmAberto: number;
    items: PedidoResumoItem[];
    topProdutos: ProdutoResumo[];
  };
  alunosMovimento: {
    atual: AlunoMovimentoSerie | null;
    series: AlunoMovimentoSerie[];
  };
  mensalidadesResumo: MensalidadesResumo;
};

type ChartView = "financeiro" | "mensalidades" | "frequencia";

const EMPTY_MENSALIDADES_RESUMO: MensalidadesResumo = {
  pagas: 0,
  pendentes: 0,
  atrasadas: 0,
  totalPagoMes: 0,
  totalPendenteMes: 0,
  totalAtrasado: 0
};

const EMPTY_KPIS: DashboardKpis = {
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
};

const EMPTY_STATE: RelatoriosState = {
  ativos: [],
  inadimplentes: [],
  vencimentos: [],
  caixa: {
    competencia: "",
    totalEntradas: 0,
    totalSaidas: 0,
    saldoMes: 0,
    items: []
  },
  frequencia: {
    competencia: "",
    totalPresencasMes: 0,
    ranking: [],
    baixaFrequencia: []
  },
  despesasCategorias: {
    totalPrevisto: 0,
    totalPago: 0,
    items: []
  },
  pedidos: {
    totalPedidos: 0,
    totalFaturado: 0,
    totalRecebido: 0,
    totalEmAberto: 0,
    items: [],
    topProdutos: []
  },
  alunosMovimento: {
    atual: null,
    series: []
  },
  mensalidadesResumo: EMPTY_MENSALIDADES_RESUMO
};

function currency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

function percentage(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("pt-BR");
}

function previousCompetencia(competencia: string) {
  const [yearRaw, monthRaw] = competencia.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return competencia;
  }

  const date = new Date(Date.UTC(year, month - 1, 1));
  date.setUTCMonth(date.getUTCMonth() - 1);

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function normalizeResumo(payload: unknown): MensalidadesResumo {
  const raw = ((payload as { resumo?: unknown })?.resumo ?? {}) as Partial<MensalidadesResumo>;
  return {
    pagas: Number(raw.pagas ?? 0),
    pendentes: Number(raw.pendentes ?? 0),
    atrasadas: Number(raw.atrasadas ?? 0),
    totalPagoMes: Number(raw.totalPagoMes ?? 0),
    totalPendenteMes: Number(raw.totalPendenteMes ?? 0),
    totalAtrasado: Number(raw.totalAtrasado ?? 0)
  };
}

function normalizeKpis(payload: unknown): DashboardKpis {
  const raw = ((payload as { kpis?: unknown })?.kpis ?? {}) as Partial<DashboardKpis>;
  return {
    alunos_ativos: Number(raw.alunos_ativos ?? 0),
    alunos_inadimplentes: Number(raw.alunos_inadimplentes ?? 0),
    receita_mes: Number(raw.receita_mes ?? 0),
    despesa_mes: Number(raw.despesa_mes ?? 0),
    saldo_mes: Number(raw.saldo_mes ?? 0),
    novas_matriculas_mes: Number(raw.novas_matriculas_mes ?? 0),
    cancelamentos_mes: Number(raw.cancelamentos_mes ?? 0),
    frequencia_total_mes: Number(raw.frequencia_total_mes ?? 0),
    ticket_medio: Number(raw.ticket_medio ?? 0),
    taxa_inadimplencia: Number(raw.taxa_inadimplencia ?? 0),
    taxa_retencao: Number(raw.taxa_retencao ?? 0)
  };
}

async function exportRows(filename: string, rows: Array<Record<string, unknown>>) {
  const res = await fetch("/api/relatorios/export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ filename, rows })
  });

  if (!res.ok) {
    throw new Error("Falha ao exportar CSV");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function RelatoriosPage() {
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [chartView, setChartView] = useState<ChartView>("financeiro");
  const [data, setData] = useState<RelatoriosState>(EMPTY_STATE);
  const [previousResumo, setPreviousResumo] = useState<MensalidadesResumo>(EMPTY_MENSALIDADES_RESUMO);
  const [kpisAtual, setKpisAtual] = useState<DashboardKpis>(EMPTY_KPIS);
  const [kpisAnterior, setKpisAnterior] = useState<DashboardKpis>(EMPTY_KPIS);

  async function loadAllReports() {
    setLoading(true);
    setError("");

    try {
      const query = `competencia=${encodeURIComponent(competencia)}`;
      const prev = previousCompetencia(competencia);
      const prevQuery = `competencia=${encodeURIComponent(prev)}`;

      const [
        ativosRes,
        inadimplentesRes,
        vencimentosRes,
        caixaRes,
        frequenciaRes,
        despesasCategoriasRes,
        pedidosRes,
        alunosMovimentoRes,
        mensalidadesResumoRes,
        summaryAtualRes,
        mensalidadesResumoAnteriorRes,
        summaryAnteriorRes
      ] = await Promise.all([
        fetch("/api/relatorios/ativos", { cache: "no-store" }),
        fetch(`/api/relatorios/inadimplentes?${query}`, { cache: "no-store" }),
        fetch(`/api/relatorios/vencimentos?${query}`, { cache: "no-store" }),
        fetch(`/api/relatorios/caixa-mensal?${query}`, { cache: "no-store" }),
        fetch(`/api/relatorios/frequencia?${query}`, { cache: "no-store" }),
        fetch(`/api/relatorios/despesas-categorias?${query}`, { cache: "no-store" }),
        fetch(`/api/relatorios/pedidos?${query}`, { cache: "no-store" }),
        fetch(`/api/relatorios/alunos-movimento?${query}`, { cache: "no-store" }),
        fetch(`/api/mensalidades/colunas?${query}`, { cache: "no-store" }),
        fetch(`/api/dashboard/summary?${query}`, { cache: "no-store" }),
        fetch(`/api/mensalidades/colunas?${prevQuery}`, { cache: "no-store" }),
        fetch(`/api/dashboard/summary?${prevQuery}`, { cache: "no-store" })
      ]);

      const [
        ativosPayload,
        inadimplentesPayload,
        vencimentosPayload,
        caixaPayload,
        frequenciaPayload,
        despesasCategoriasPayload,
        pedidosPayload,
        alunosMovimentoPayload,
        mensalidadesResumoPayload,
        summaryAtualPayload,
        mensalidadesResumoAnteriorPayload,
        summaryAnteriorPayload
      ] = await Promise.all([
        ativosRes.json().catch(() => ({})),
        inadimplentesRes.json().catch(() => ({})),
        vencimentosRes.json().catch(() => ({})),
        caixaRes.json().catch(() => ({})),
        frequenciaRes.json().catch(() => ({})),
        despesasCategoriasRes.json().catch(() => ({})),
        pedidosRes.json().catch(() => ({})),
        alunosMovimentoRes.json().catch(() => ({})),
        mensalidadesResumoRes.json().catch(() => ({})),
        summaryAtualRes.json().catch(() => ({})),
        mensalidadesResumoAnteriorRes.json().catch(() => ({})),
        summaryAnteriorRes.json().catch(() => ({}))
      ]);

      if (
        !ativosRes.ok ||
        !inadimplentesRes.ok ||
        !vencimentosRes.ok ||
        !caixaRes.ok ||
        !frequenciaRes.ok ||
        !despesasCategoriasRes.ok ||
        !pedidosRes.ok ||
        !alunosMovimentoRes.ok ||
        !mensalidadesResumoRes.ok ||
        !summaryAtualRes.ok ||
        !mensalidadesResumoAnteriorRes.ok ||
        !summaryAnteriorRes.ok
      ) {
        const message =
          (ativosPayload as { error?: string }).error ||
          (inadimplentesPayload as { error?: string }).error ||
          (vencimentosPayload as { error?: string }).error ||
          (caixaPayload as { error?: string }).error ||
          (frequenciaPayload as { error?: string }).error ||
          (despesasCategoriasPayload as { error?: string }).error ||
          (pedidosPayload as { error?: string }).error ||
          (alunosMovimentoPayload as { error?: string }).error ||
          (mensalidadesResumoPayload as { error?: string }).error ||
          (summaryAtualPayload as { error?: string }).error ||
          (mensalidadesResumoAnteriorPayload as { error?: string }).error ||
          (summaryAnteriorPayload as { error?: string }).error ||
          "Falha ao carregar relatórios.";
        throw new Error(message);
      }

      setData({
        ativos: Array.isArray((ativosPayload as { items?: unknown[] }).items)
          ? ((ativosPayload as { items: AlunoAtivo[] }).items ?? [])
          : [],
        inadimplentes: Array.isArray((inadimplentesPayload as { items?: unknown[] }).items)
          ? ((inadimplentesPayload as { items: Inadimplente[] }).items ?? [])
          : [],
        vencimentos: Array.isArray((vencimentosPayload as { items?: unknown[] }).items)
          ? ((vencimentosPayload as { items: VencimentoItem[] }).items ?? [])
          : [],
        caixa: {
          competencia: String((caixaPayload as { competencia?: string }).competencia ?? competencia),
          totalEntradas: Number((caixaPayload as { totalEntradas?: number }).totalEntradas ?? 0),
          totalSaidas: Number((caixaPayload as { totalSaidas?: number }).totalSaidas ?? 0),
          saldoMes: Number((caixaPayload as { saldoMes?: number }).saldoMes ?? 0),
          items: Array.isArray((caixaPayload as { items?: unknown[] }).items)
            ? ((caixaPayload as { items: CaixaItem[] }).items ?? [])
            : []
        },
        frequencia: {
          competencia: String((frequenciaPayload as { competencia?: string }).competencia ?? competencia),
          totalPresencasMes: Number((frequenciaPayload as { totalPresencasMes?: number }).totalPresencasMes ?? 0),
          ranking: Array.isArray((frequenciaPayload as { ranking?: unknown[] }).ranking)
            ? ((frequenciaPayload as { ranking: FrequenciaRanking[] }).ranking ?? [])
            : [],
          baixaFrequencia: Array.isArray((frequenciaPayload as { baixaFrequencia?: unknown[] }).baixaFrequencia)
            ? ((frequenciaPayload as { baixaFrequencia: FrequenciaRanking[] }).baixaFrequencia ?? [])
            : []
        },
        despesasCategorias: {
          totalPrevisto: Number((despesasCategoriasPayload as { totalPrevisto?: number }).totalPrevisto ?? 0),
          totalPago: Number((despesasCategoriasPayload as { totalPago?: number }).totalPago ?? 0),
          items: Array.isArray((despesasCategoriasPayload as { items?: unknown[] }).items)
            ? ((despesasCategoriasPayload as { items: DespesaCategoriaItem[] }).items ?? [])
            : []
        },
        pedidos: {
          totalPedidos: Number((pedidosPayload as { totalPedidos?: number }).totalPedidos ?? 0),
          totalFaturado: Number((pedidosPayload as { totalFaturado?: number }).totalFaturado ?? 0),
          totalRecebido: Number((pedidosPayload as { totalRecebido?: number }).totalRecebido ?? 0),
          totalEmAberto: Number((pedidosPayload as { totalEmAberto?: number }).totalEmAberto ?? 0),
          items: Array.isArray((pedidosPayload as { items?: unknown[] }).items)
            ? ((pedidosPayload as { items: PedidoResumoItem[] }).items ?? [])
            : [],
          topProdutos: Array.isArray((pedidosPayload as { topProdutos?: unknown[] }).topProdutos)
            ? ((pedidosPayload as { topProdutos: ProdutoResumo[] }).topProdutos ?? [])
            : []
        },
        alunosMovimento: {
          atual: ((alunosMovimentoPayload as { atual?: AlunoMovimentoSerie | null }).atual ?? null),
          series: Array.isArray((alunosMovimentoPayload as { series?: unknown[] }).series)
            ? ((alunosMovimentoPayload as { series: AlunoMovimentoSerie[] }).series ?? [])
            : []
        },
        mensalidadesResumo: normalizeResumo(mensalidadesResumoPayload)
      });

      setPreviousResumo(normalizeResumo(mensalidadesResumoAnteriorPayload));
      setKpisAtual(normalizeKpis(summaryAtualPayload));
      setKpisAnterior(normalizeKpis(summaryAnteriorPayload));
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "Falha ao carregar relatórios.";
      setError(message);
      setData(EMPTY_STATE);
      setPreviousResumo(EMPTY_MENSALIDADES_RESUMO);
      setKpisAtual(EMPTY_KPIS);
      setKpisAnterior(EMPTY_KPIS);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAllReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competencia]);

  const stats = useMemo(
    () => [
      { label: "Alunos ativos", value: String(data.ativos.length) },
      { label: "Inadimplentes", value: String(data.inadimplentes.length) },
      { label: "Saldo caixa", value: currency(data.caixa.saldoMes) }
    ],
    [data]
  );

  const comparativoCards = useMemo(() => {
    const items = [
      {
        key: "receita",
        label: "Receita",
        current: kpisAtual.receita_mes,
        previous: kpisAnterior.receita_mes,
        formatter: currency,
        positiveIsGood: true
      },
      {
        key: "despesa",
        label: "Despesa",
        current: kpisAtual.despesa_mes,
        previous: kpisAnterior.despesa_mes,
        formatter: currency,
        positiveIsGood: false
      },
      {
        key: "saldo",
        label: "Saldo",
        current: kpisAtual.saldo_mes,
        previous: kpisAnterior.saldo_mes,
        formatter: currency,
        positiveIsGood: true
      },
      {
        key: "inadimplentes",
        label: "Inadimplentes",
        current: kpisAtual.alunos_inadimplentes,
        previous: kpisAnterior.alunos_inadimplentes,
        formatter: (value: number) => String(value),
        positiveIsGood: false
      },
      {
        key: "frequencia",
        label: "Frequência",
        current: kpisAtual.frequencia_total_mes,
        previous: kpisAnterior.frequencia_total_mes,
        formatter: (value: number) => String(value),
        positiveIsGood: true
      },
      {
        key: "ticket-medio",
        label: "Ticket médio",
        current: kpisAtual.ticket_medio,
        previous: kpisAnterior.ticket_medio,
        formatter: currency,
        positiveIsGood: true
      }
    ];

    return items.map((item) => {
      const delta = item.current - item.previous;
      const deltaPercent = item.previous === 0 ? (item.current === 0 ? 0 : 100) : (delta / Math.abs(item.previous)) * 100;
      const wentUp = delta > 0;
      const wentDown = delta < 0;
      const isGood = delta === 0 ? null : item.positiveIsGood ? wentUp : wentDown;

      return {
        ...item,
        delta,
        deltaPercent,
        isGood
      };
    });
  }, [kpisAtual, kpisAnterior]);

  const financeiroChartData = useMemo(
    () => [
      { indicador: "Receita", atual: kpisAtual.receita_mes, anterior: kpisAnterior.receita_mes },
      { indicador: "Despesa", atual: kpisAtual.despesa_mes, anterior: kpisAnterior.despesa_mes },
      { indicador: "Saldo", atual: kpisAtual.saldo_mes, anterior: kpisAnterior.saldo_mes }
    ],
    [kpisAtual, kpisAnterior]
  );

  const mensalidadesChartData = useMemo(
    () => [
      { status: "Pagas", atual: data.mensalidadesResumo.pagas, anterior: previousResumo.pagas },
      { status: "Pendentes", atual: data.mensalidadesResumo.pendentes, anterior: previousResumo.pendentes },
      { status: "Atrasadas", atual: data.mensalidadesResumo.atrasadas, anterior: previousResumo.atrasadas }
    ],
    [data.mensalidadesResumo, previousResumo]
  );

  const mensalidadesPieData = useMemo(
    () => [
      { name: "Pagas", value: data.mensalidadesResumo.pagas, color: "#2b8a57" },
      { name: "Pendentes", value: data.mensalidadesResumo.pendentes, color: "#bf6c16" },
      { name: "Atrasadas", value: data.mensalidadesResumo.atrasadas, color: "#a4131f" }
    ],
    [data.mensalidadesResumo]
  );

  const frequenciaChartData = useMemo(
    () => data.frequencia.ranking.slice(0, 10).map((item) => ({ aluno: item.nome, presencas: item.total })),
    [data.frequencia.ranking]
  );

  const prevCompetencia = previousCompetencia(competencia);

  return (
    <div className="space-y-4">
      <ModuleHeader
        title="Relatórios"
        description="Todos os relatórios em uma única tela, com comparativo automático contra o mês anterior."
        icon={BarChart3}
        badges={["Consolidado", "Filtro por mês", "Comparativo M-1"]}
        stats={stats}
      />

      <Card className="space-y-3">
        <label className="max-w-[230px] text-sm font-semibold text-ink">
          Mês de referência
          <MonthYearPicker value={competencia} onChange={setCompetencia} />
        </label>

        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
          Comparando <strong className="text-ink">{competencia}</strong> com <strong className="text-ink">{prevCompetencia}</strong>
        </p>

        {loading ? <p className="text-sm text-muted">Carregando relatórios...</p> : null}
        {error ? <p className="text-sm font-semibold text-[#a21b25]">{error}</p> : null}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-ink">Comparativo com mês anterior</h2>
          <Button variant="secondary" onClick={() => void loadAllReports()} disabled={loading}>
            Atualizar
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {comparativoCards.map((item) => {
            const deltaLabel = item.delta === 0 ? "Sem mudança" : item.delta > 0 ? "Subiu" : "Diminuiu";
            const toneClass =
              item.isGood === null
                ? "text-muted"
                : item.isGood
                  ? "text-[#1f6d44]"
                  : "text-[#a21b25]";

            return (
              <div key={item.key} className="rounded-xl border border-line/85 bg-white/85 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.11em] text-muted">{item.label}</p>
                <p className="mt-1 text-xl font-black text-ink">{item.formatter(item.current)}</p>
                <p className="text-xs text-muted">Mês anterior: {item.formatter(item.previous)}</p>
                <div className={`mt-2 flex items-center gap-1 text-sm font-semibold ${toneClass}`}>
                  {item.delta > 0 ? <ArrowUpRight className="h-4 w-4" /> : null}
                  {item.delta < 0 ? <ArrowDownRight className="h-4 w-4" /> : null}
                  {item.delta === 0 ? <Minus className="h-4 w-4" /> : null}
                  <span>{deltaLabel}</span>
                  <span>({percentage(item.deltaPercent)})</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button variant={chartView === "financeiro" ? "primary" : "secondary"} onClick={() => setChartView("financeiro")}>
            Gráfico financeiro
          </Button>
          <Button variant={chartView === "mensalidades" ? "primary" : "secondary"} onClick={() => setChartView("mensalidades")}>
            Gráfico mensalidades
          </Button>
          <Button variant={chartView === "frequencia" ? "primary" : "secondary"} onClick={() => setChartView("frequencia")}>
            Gráfico frequência
          </Button>
        </div>

        {chartView === "financeiro" ? (
          <div>
            <h2 className="text-lg font-black text-ink">Financeiro: {competencia} x {prevCompetencia}</h2>
            <div className="mt-3 h-[320px] w-full rounded-xl border border-line/80 bg-white/80 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={financeiroChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e1d7d9" />
                  <XAxis dataKey="indicador" tick={{ fill: "#6f6568", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#6f6568", fontSize: 12 }} tickFormatter={(value) => currency(Number(value))} />
                  <Tooltip
                    formatter={(value: number) => currency(Number(value))}
                    contentStyle={{
                      background: "rgba(255,255,255,0.95)",
                      border: "1px solid #ded7d9",
                      borderRadius: "12px"
                    }}
                  />
                  <Legend />
                  <Bar dataKey="atual" name={competencia} fill="#c51623" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="anterior" name={prevCompetencia} fill="#2f2228" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null}

        {chartView === "mensalidades" ? (
          <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            <div>
              <h2 className="text-lg font-black text-ink">Status mensalidades: {competencia} x {prevCompetencia}</h2>
              <div className="mt-3 h-[320px] w-full rounded-xl border border-line/80 bg-white/80 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mensalidadesChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e1d7d9" />
                    <XAxis dataKey="status" tick={{ fill: "#6f6568", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#6f6568", fontSize: 12 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(255,255,255,0.95)",
                        border: "1px solid #ded7d9",
                        borderRadius: "12px"
                      }}
                    />
                    <Legend />
                    <Bar dataKey="atual" name={competencia} fill="#c51623" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="anterior" name={prevCompetencia} fill="#2f2228" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-black text-ink">Distribuição do mês</h3>
              <div className="mt-3 h-[320px] w-full rounded-xl border border-line/80 bg-white/80 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={mensalidadesPieData} dataKey="value" nameKey="name" innerRadius={56} outerRadius={98} label>
                      {mensalidadesPieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => String(value)}
                      contentStyle={{
                        background: "rgba(255,255,255,0.95)",
                        border: "1px solid #ded7d9",
                        borderRadius: "12px"
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ) : null}

        {chartView === "frequencia" ? (
          <div>
            <h2 className="text-lg font-black text-ink">Top 10 frequência do mês ({competencia})</h2>
            <div className="mt-3 h-[360px] w-full rounded-xl border border-line/80 bg-white/80 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={frequenciaChartData} layout="vertical" margin={{ left: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e1d7d9" />
                  <XAxis type="number" tick={{ fill: "#6f6568", fontSize: 12 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="aluno" tick={{ fill: "#6f6568", fontSize: 11 }} width={130} />
                  <Tooltip
                    formatter={(value: number) => `${Number(value)} presença(s)`}
                    contentStyle={{
                      background: "rgba(255,255,255,0.95)",
                      border: "1px solid #ded7d9",
                      borderRadius: "12px"
                    }}
                  />
                  <Bar dataKey="presencas" fill="#8e1018" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-[rgba(34,136,83,0.22)] bg-[rgba(230,249,239,0.85)] p-3 text-sm font-semibold text-[#1f6d44]">
                <div className="flex items-center gap-1"><TrendingUp className="h-4 w-4" /> Presenças mês atual</div>
                <p className="mt-1 text-lg font-black">{kpisAtual.frequencia_total_mes}</p>
              </div>
              <div className="rounded-xl border border-[rgba(190,104,18,0.22)] bg-[rgba(255,242,228,0.84)] p-3 text-sm font-semibold text-[#95510f]">
                <div className="flex items-center gap-1"><TrendingDown className="h-4 w-4" /> Presenças mês anterior</div>
                <p className="mt-1 text-lg font-black">{kpisAnterior.frequencia_total_mes}</p>
              </div>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-black text-ink">Movimento de alunos</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-line bg-white/80 p-3 text-sm font-semibold text-ink">
            Inicio do mes: {data.alunosMovimento.atual?.inicioMes ?? 0}
          </div>
          <div className="rounded-xl border border-[rgba(34,136,83,0.22)] bg-[rgba(230,249,239,0.85)] p-3 text-sm font-semibold text-[#1f6d44]">
            Entraram: {data.alunosMovimento.atual?.entrou ?? 0}
          </div>
          <div className="rounded-xl border border-[rgba(159,16,24,0.22)] bg-[rgba(253,236,239,0.88)] p-3 text-sm font-semibold text-accentDark">
            Sairam: {data.alunosMovimento.atual?.saiu ?? 0}
          </div>
          <div className="rounded-xl border border-[rgba(30,63,139,0.22)] bg-[rgba(236,242,255,0.88)] p-3 text-sm font-semibold text-[#1d3f8b]">
            Total final: {data.alunosMovimento.atual?.totalFinal ?? 0}
          </div>
        </div>

        <div className="max-h-[320px] overflow-auto rounded-xl border border-line/80 bg-white/85">
          <table>
            <thead>
              <tr>
                <th>Competencia</th>
                <th>Inicio</th>
                <th>Entraram</th>
                <th>Sairam</th>
                <th>Total final</th>
              </tr>
            </thead>
            <tbody>
              {data.alunosMovimento.series.length === 0 ? (
                <tr>
                  <td colSpan={5}>{loading ? "Carregando..." : "Sem dados de movimento."}</td>
                </tr>
              ) : (
                data.alunosMovimento.series.map((item) => (
                  <tr key={item.competencia}>
                    <td>{item.competencia}</td>
                    <td>{item.inicioMes}</td>
                    <td>{item.entrou}</td>
                    <td>{item.saiu}</td>
                    <td>{item.totalFinal}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-black text-ink">Vencimentos do mês ({competencia})</h2>
            <Button
              variant="secondary"
              onClick={() =>
                void exportRows(
                  `vencimentos-${competencia}`,
                  data.vencimentos.map((item) => ({
                    aluno: item.aluno.nomeCompleto,
                    telefone: item.aluno.telefone,
                    modalidade: item.aluno.modalidade?.nome ?? "",
                    vencimento: formatDate(item.vencimento),
                    valor: Number(item.valor),
                    status: item.status,
                    pagamento: item.dataPagamento ? formatDate(item.dataPagamento) : ""
                  }))
                )
              }
            >
              Exportar CSV
            </Button>
          </div>
          <div className="max-h-[360px] overflow-auto rounded-xl border border-line/80 bg-white/85">
            <table>
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Telefone</th>
                  <th>Modalidade</th>
                  <th>Venc.</th>
                  <th>Valor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.vencimentos.length === 0 ? (
                  <tr>
                    <td colSpan={6}>{loading ? "Carregando..." : "Sem vencimentos."}</td>
                  </tr>
                ) : (
                  data.vencimentos.map((item) => (
                    <tr key={item.id}>
                      <td>{item.aluno.nomeCompleto}</td>
                      <td>{item.aluno.telefone}</td>
                      <td>{item.aluno.modalidade?.nome ?? "-"}</td>
                      <td>{formatDate(item.vencimento)}</td>
                      <td>{currency(Number(item.valor))}</td>
                      <td>{item.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-black text-ink">Despesas por categoria ({competencia})</h2>
            <Button
              variant="secondary"
              onClick={() =>
                void exportRows(
                  `despesas-categorias-${competencia}`,
                  data.despesasCategorias.items.map((item) => ({
                    categoria: item.categoria,
                    quantidade: item.quantidade,
                    valor_previsto: item.valorPrevisto,
                    valor_pago: item.valorPago,
                    pendentes: item.pendentes
                  }))
                )
              }
            >
              Exportar CSV
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-[rgba(190,104,18,0.22)] bg-[rgba(255,242,228,0.84)] p-2.5 text-sm font-semibold text-[#95510f]">
              Previsto: {currency(data.despesasCategorias.totalPrevisto)}
            </div>
            <div className="rounded-xl border border-[rgba(34,136,83,0.22)] bg-[rgba(230,249,239,0.85)] p-2.5 text-sm font-semibold text-[#1f6d44]">
              Pago: {currency(data.despesasCategorias.totalPago)}
            </div>
          </div>
          <div className="max-h-[320px] overflow-auto rounded-xl border border-line/80 bg-white/85">
            <table>
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Qtd.</th>
                  <th>Previsto</th>
                  <th>Pago</th>
                  <th>Pendentes</th>
                </tr>
              </thead>
              <tbody>
                {data.despesasCategorias.items.length === 0 ? (
                  <tr>
                    <td colSpan={5}>{loading ? "Carregando..." : "Sem despesas."}</td>
                  </tr>
                ) : (
                  data.despesasCategorias.items.map((item) => (
                    <tr key={item.categoria}>
                      <td>{item.categoria}</td>
                      <td>{item.quantidade}</td>
                      <td>{currency(item.valorPrevisto)}</td>
                      <td>{currency(item.valorPago)}</td>
                      <td>{item.pendentes}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-black text-ink">Pedidos do mês ({competencia})</h2>
            <Button
              variant="secondary"
              onClick={() =>
                void exportRows(
                  `pedidos-${competencia}`,
                  data.pedidos.items.map((item) => ({
                    cliente: item.clienteNome,
                    aluno: item.aluno?.nomeCompleto ?? "",
                    data: formatDate(item.dataPedido),
                    valor_total: item.valorTotal,
                    pago: item.pago,
                    em_aberto: Number(item.valorTotal) - Number(item.pago)
                  }))
                )
              }
            >
              Exportar CSV
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-white/80 p-2.5 text-sm font-semibold text-ink">
              Pedidos: {data.pedidos.totalPedidos}
            </div>
            <div className="rounded-xl border border-[rgba(34,136,83,0.22)] bg-[rgba(230,249,239,0.85)] p-2.5 text-sm font-semibold text-[#1f6d44]">
              Recebido: {currency(data.pedidos.totalRecebido)}
            </div>
            <div className="rounded-xl border border-[rgba(159,16,24,0.22)] bg-[rgba(253,236,239,0.88)] p-2.5 text-sm font-semibold text-accentDark">
              Em aberto: {currency(data.pedidos.totalEmAberto)}
            </div>
          </div>
          <div className="max-h-[320px] overflow-auto rounded-xl border border-line/80 bg-white/85">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Aluno</th>
                  <th>Total</th>
                  <th>Pago</th>
                </tr>
              </thead>
              <tbody>
                {data.pedidos.items.length === 0 ? (
                  <tr>
                    <td colSpan={5}>{loading ? "Carregando..." : "Sem pedidos."}</td>
                  </tr>
                ) : (
                  data.pedidos.items.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDate(item.dataPedido)}</td>
                      <td>{item.clienteNome}</td>
                      <td>{item.aluno?.nomeCompleto ?? "-"}</td>
                      <td>{currency(Number(item.valorTotal))}</td>
                      <td>{currency(Number(item.pago))}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-black text-ink">Top produtos vendidos</h2>
          <div className="max-h-[430px] overflow-auto rounded-xl border border-line/80 bg-white/85">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Qtd.</th>
                  <th>Faturamento</th>
                </tr>
              </thead>
              <tbody>
                {data.pedidos.topProdutos.length === 0 ? (
                  <tr>
                    <td colSpan={3}>{loading ? "Carregando..." : "Sem produtos vendidos."}</td>
                  </tr>
                ) : (
                  data.pedidos.topProdutos.map((item) => (
                    <tr key={item.produto}>
                      <td>{item.produto}</td>
                      <td>{item.quantidade}</td>
                      <td>{currency(item.faturamento)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="text-lg font-black text-ink">Alunos ativos</h2>
          <div className="max-h-[360px] overflow-auto rounded-xl border border-line/80 bg-white/85">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>Modalidade</th>
                  <th>Venc.</th>
                </tr>
              </thead>
              <tbody>
                {data.ativos.length === 0 ? (
                  <tr>
                    <td colSpan={4}>{loading ? "Carregando..." : "Sem dados."}</td>
                  </tr>
                ) : (
                  data.ativos.map((item) => (
                    <tr key={item.id}>
                      <td>{item.nomeCompleto}</td>
                      <td>{item.telefone}</td>
                      <td>{item.modalidade?.nome ?? "-"}</td>
                      <td>{item.vencimentoDia}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-black text-ink">Inadimplentes ({competencia})</h2>
          <div className="max-h-[360px] overflow-auto rounded-xl border border-line/80 bg-white/85">
            <table>
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Telefone</th>
                  <th>Mês</th>
                  <th>Venc.</th>
                  <th>Valor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.inadimplentes.length === 0 ? (
                  <tr>
                    <td colSpan={6}>{loading ? "Carregando..." : "Sem inadimplentes."}</td>
                  </tr>
                ) : (
                  data.inadimplentes.map((item) => (
                    <tr key={item.id}>
                      <td>{item.aluno.nomeCompleto}</td>
                      <td>{item.aluno.telefone}</td>
                      <td>{item.competencia}</td>
                      <td>{formatDate(item.vencimento)}</td>
                      <td>{currency(Number(item.valor))}</td>
                      <td>{item.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="text-lg font-black text-ink">Caixa mensal ({competencia})</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-[rgba(34,136,83,0.22)] bg-[rgba(230,249,239,0.85)] p-2.5 text-sm font-semibold text-[#1f6d44]">
              Entradas: {currency(data.caixa.totalEntradas)}
            </div>
            <div className="rounded-xl border border-[rgba(190,104,18,0.22)] bg-[rgba(255,242,228,0.84)] p-2.5 text-sm font-semibold text-[#95510f]">
              Saídas: {currency(data.caixa.totalSaidas)}
            </div>
            <div className="rounded-xl border border-[rgba(159,16,24,0.22)] bg-[rgba(253,236,239,0.88)] p-2.5 text-sm font-semibold text-accentDark">
              Saldo: {currency(data.caixa.saldoMes)}
            </div>
          </div>

          <div className="max-h-[360px] overflow-auto rounded-xl border border-line/80 bg-white/85">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Categoria</th>
                  <th>Descrição</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {data.caixa.items.length === 0 ? (
                  <tr>
                    <td colSpan={5}>{loading ? "Carregando..." : "Sem movimentações."}</td>
                  </tr>
                ) : (
                  data.caixa.items.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDate(item.data)}</td>
                      <td>{item.tipo}</td>
                      <td>{item.categoria?.nome ?? "-"}</td>
                      <td>{item.descricao}</td>
                      <td>{currency(Number(item.valor))}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-black text-ink">Frequência mensal ({competencia})</h2>
          <div className="rounded-xl border border-line bg-white/80 p-2.5 text-sm">
            <strong>Total de presenças:</strong> {data.frequencia.totalPresencasMes}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">Ranking</p>
              <div className="max-h-[280px] overflow-auto rounded-xl border border-line/80 bg-white/85">
                <table>
                  <thead>
                    <tr>
                      <th>Aluno</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.frequencia.ranking.length === 0 ? (
                      <tr>
                        <td colSpan={2}>{loading ? "Carregando..." : "Sem dados."}</td>
                      </tr>
                    ) : (
                      data.frequencia.ranking.map((item, index) => (
                        <tr key={`${item.nome}-${index}`}>
                          <td>{item.nome}</td>
                          <td>{item.total}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-ink">Baixa frequência</p>
              <div className="max-h-[280px] overflow-auto rounded-xl border border-line/80 bg-white/85">
                <table>
                  <thead>
                    <tr>
                      <th>Aluno</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.frequencia.baixaFrequencia.length === 0 ? (
                      <tr>
                        <td colSpan={2}>{loading ? "Carregando..." : "Sem casos de baixa frequência."}</td>
                      </tr>
                    ) : (
                      data.frequencia.baixaFrequencia.map((item, index) => (
                        <tr key={`${item.nome}-${index}`}>
                          <td>{item.nome}</td>
                          <td>{item.total}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
