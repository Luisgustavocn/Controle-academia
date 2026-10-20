"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CrudModule } from "@/components/forms/crud-module";
import { ModuleHeader } from "@/components/ui/module-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MonthYearPicker } from "@/components/ui/month-year-picker";
import { Input } from "@/components/ui/input";

type CaixaItem = {
  id: string;
  tipo: "ENTRADA" | "SAIDA";
  valor: number;
  categoria?: {
    nome?: string;
  } | null;
};

function currency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function aggregateByCategory(items: CaixaItem[]) {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = item.categoria?.nome?.trim() || "Sem categoria";
    map.set(key, (map.get(key) ?? 0) + Number(item.valor));
  }

  return Array.from(map.entries())
    .map(([categoria, valor]) => ({ categoria, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 12);
}

export default function CaixaPage() {
  const [visao, setVisao] = useState<"diaria" | "mensal" | "anual">("mensal");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [loadingCharts, setLoadingCharts] = useState(false);
  const [entradas, setEntradas] = useState<CaixaItem[]>([]);
  const [saidas, setSaidas] = useState<CaixaItem[]>([]);
  const [summary, setSummary] = useState({ entradas: 0, saidas: 0, saldo: 0 });
  const [monthly, setMonthly] = useState<Array<{ mes: number; entradas: number; saidas: number; saldo: number }>>([]);

  async function loadChartData() {
    setLoadingCharts(true);
    try {
      const params = new URLSearchParams({ visao, pageSize: "100" });
      if (visao === "diaria") params.set("data", data); else if (visao === "mensal") params.set("competencia", competencia); else params.set("ano", ano);
      window.history.replaceState(null, "", `/caixa?${params}`);
      const res = await fetch(`/api/caixa?${params}`, { cache: "no-store" });
      const payload = await res.json().catch(() => ({})) as { error?: string; items?: CaixaItem[]; summary?: typeof summary; monthly?: typeof monthly };
      if (!res.ok) throw new Error(payload.error ?? "Falha ao carregar caixa");
      const items = payload.items ?? []; setEntradas(items.filter((item) => item.tipo === "ENTRADA")); setSaidas(items.filter((item) => item.tipo === "SAIDA"));
      setSummary(payload.summary ?? { entradas: 0, saidas: 0, saldo: 0 }); setMonthly(payload.monthly ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao carregar gráficos de caixa";
      alert(message);
      setEntradas([]);
      setSaidas([]);
    } finally {
      setLoadingCharts(false);
    }
  }

  useEffect(() => {
    void loadChartData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competencia, data, ano, visao]);

  const chartEntradas = useMemo(() => aggregateByCategory(entradas), [entradas]);
  const chartSaidas = useMemo(() => aggregateByCategory(saidas), [saidas]);
  const totalEntradas = Number(summary.entradas);
  const totalSaidas = Number(summary.saidas);

  return (
    <div className="space-y-4">
      <ModuleHeader
        title="Financeiro / Caixa"
        description="Livro-caixa mensal com entradas, saídas, saldo e fechamento automático."
        icon={Wallet}
        badges={["Livro caixa", "Entradas e saídas", "Saldo mensal"]}
        stats={[
          { label: "Fechamento", value: "Automatizado" },
          { label: "Visão", value: "Mensal" }
        ]}
      />

      <Card className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Execute o fechamento para consolidar o saldo do mês.</p>
        <Button
          onClick={async () => {
            const res = await fetch("/api/jobs/fechamento-caixa", {
              method: "POST"
            });
            const payload = (await res.json().catch(() => ({}))) as {
              result?: {
                backupSaved?: boolean;
                backupFilePath?: string;
                backupError?: string;
              };
              error?: string;
            };

            if (!res.ok) {
              alert(payload.error ?? "Falha ao executar fechamento.");
              return;
            }

            if (payload.result?.backupSaved) {
              alert(`Fechamento executado e backup salvo em: ${payload.result.backupFilePath}`);
              return;
            }

            if (payload.result?.backupError) {
              alert(`Fechamento executado, mas o backup automatico falhou: ${payload.result.backupError}`);
              return;
            }

            alert("Fechamento executado.");
          }}
        >
          Fechar caixa do mês
        </Button>
      </Card>

      <Card className="space-y-3">
        <div className="flex gap-2">{(["diaria", "mensal", "anual"] as const).map((item) => <Button key={item} variant={visao === item ? "primary" : "secondary"} onClick={() => setVisao(item)}>{item === "diaria" ? "Diário" : item === "mensal" ? "Mensal" : "Anual"}</Button>)}</div>
        <div className="flex flex-wrap items-end gap-2">
          {visao === "mensal" ? <label className="w-full max-w-[220px] text-sm font-medium text-ink">
            Mês dos gráficos
            <MonthYearPicker value={competencia} onChange={setCompetencia} />
          </label> : visao === "diaria" ? <label className="w-full max-w-[220px] text-sm font-medium text-ink">Data<Input type="date" value={data} onChange={(event) => setData(event.target.value)} /></label> : <label className="w-full max-w-[220px] text-sm font-medium text-ink">Ano<Input type="number" value={ano} onChange={(event) => setAno(event.target.value)} /></label>}
          <Button variant="secondary" onClick={() => void loadChartData()} disabled={loadingCharts}>
            {loadingCharts ? "Carregando..." : "Atualizar gráficos"}
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-[rgba(34,136,83,0.22)] bg-[rgba(230,249,239,0.85)] p-3 text-sm font-semibold text-[#1f6d44]">
            Entradas: {currency(totalEntradas)}
          </div>
          <div className="rounded-xl border border-[rgba(159,16,24,0.22)] bg-[rgba(253,236,239,0.88)] p-3 text-sm font-semibold text-accentDark">
            Saídas: {currency(totalSaidas)}
          </div>
          <div className="rounded-xl border border-line bg-white p-3 text-sm font-semibold text-ink">Saldo: {currency(Number(summary.saldo))}</div>
        </div>
        {visao === "anual" ? <div className="overflow-x-auto"><table><thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Saldo</th></tr></thead><tbody>{monthly.map((item) => <tr key={item.mes}><td>{String(item.mes).padStart(2, "0")}</td><td>{currency(Number(item.entradas))}</td><td>{currency(Number(item.saidas))}</td><td>{currency(Number(item.saldo))}</td></tr>)}</tbody></table></div> : null}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="space-y-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[#1f6d44]" />
            <h2 className="text-lg font-black text-ink">Entradas por categoria ({competencia})</h2>
          </div>

          <div className="h-[330px] rounded-xl border border-line/80 bg-white/80 p-2">
            {chartEntradas.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                {loadingCharts ? "Carregando..." : "Sem entradas no período."}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartEntradas}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e1d7d9" />
                  <XAxis
                    dataKey="categoria"
                    tick={{ fill: "#6f6568", fontSize: 11 }}
                    interval={0}
                    angle={-18}
                    height={64}
                    textAnchor="end"
                  />
                  <YAxis tick={{ fill: "#6f6568", fontSize: 12 }} tickFormatter={(value) => currency(Number(value))} />
                  <Tooltip formatter={(value: number) => currency(Number(value))} />
                  <Bar dataKey="valor" fill="#2b8a57" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="space-y-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-accentDark" />
            <h2 className="text-lg font-black text-ink">Saídas por categoria ({competencia})</h2>
          </div>

          <div className="h-[330px] rounded-xl border border-line/80 bg-white/80 p-2">
            {chartSaidas.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                {loadingCharts ? "Carregando..." : "Sem saídas no período."}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartSaidas}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e1d7d9" />
                  <XAxis
                    dataKey="categoria"
                    tick={{ fill: "#6f6568", fontSize: 11 }}
                    interval={0}
                    angle={-18}
                    height={64}
                    textAnchor="end"
                  />
                  <YAxis tick={{ fill: "#6f6568", fontSize: 12 }} tickFormatter={(value) => currency(Number(value))} />
                  <Tooltip formatter={(value: number) => currency(Number(value))} />
                  <Bar dataKey="valor" fill="#a4131f" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <CrudModule
        endpoint="/api/caixa"
        title="Movimentações de caixa"
        createLabel="Nova movimentação"
        onDataChanged={() => loadChartData()}
        listFields={[
          { key: "data", label: "Data" },
          { key: "tipo", label: "Tipo" },
          { key: "descricao", label: "Descrição" },
          { key: "valor", label: "Valor" },
          { key: "formaPagamento", label: "Forma pagto." }
        ]}
        fields={[
          { key: "data", label: "Data", type: "date", required: true },
          {
            key: "tipo",
            label: "Tipo",
            type: "select",
            required: true,
            options: [
              { label: "Entrada", value: "ENTRADA" },
              { label: "Saída", value: "SAIDA" }
            ]
          },
          { key: "categoriaId", label: "Categoria" },
          { key: "descricao", label: "Descrição", required: true },
          { key: "valor", label: "Valor", type: "number", required: true },
          { key: "origemDestino", label: "Origem/Destino" },
          { key: "alunoId", label: "Aluno" },
          { key: "formaPagamento", label: "Forma pagamento" },
          { key: "observacao", label: "Observação", type: "textarea" }
        ]}
        createCapability="finance.cash.manage"
        updateCapability="finance.cash.manage"
        deleteCapability="finance.cash.manage"
        deleteReasonRequired
        legacyDeleteCapability="finance.cash.legacy.delete"
        isLegacyDelete={(item) => item.origem == null && !item.pagamentoId && !item.mensalidadeId && !item.despesaAcademiaId && !item.pedidoProdutoId && !String(item.id).startsWith("auto_pagamento_") && !String(item.id).startsWith("auto_mensalidade_") && !String(item.id).startsWith("auto_pedido_")}
        deleteLabel={(item) => {
          if (item.origem === "PAGAMENTO_MENSALIDADE" || item.pagamentoId || String(item.id).startsWith("auto_pagamento_") || String(item.id).startsWith("auto_mensalidade_")) return "Desfazer pagamento";
          if (item.origem === "DESPESA") return "Desfazer pagamento da despesa";
          if (item.origem === "PEDIDO" || item.pedidoProdutoId || String(item.id).startsWith("auto_pedido_")) return "Desfazer pagamento da venda";
          return "Excluir lançamento";
        }}
        deleteConfirmation={(item) => {
          if (item.origem === "PAGAMENTO_MENSALIDADE" || item.pagamentoId || String(item.id).startsWith("auto_pagamento_") || String(item.id).startsWith("auto_mensalidade_")) return "Desfazer pagamento? Este pagamento será removido e a mensalidade será recalculada.";
          if (item.origem === "DESPESA") return "Desfazer pagamento da despesa? Ela voltará para Pendente/Atrasada.";
          if (item.origem === "PEDIDO" || item.pedidoProdutoId || String(item.id).startsWith("auto_pedido_")) return "Desfazer pagamento da venda? O pedido voltará para não pago.";
          return "Excluir lançamento? Este lançamento será removido do Caixa.";
        }}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <CrudModule
          endpoint="/api/categorias-financeiras?tipo=ENTRADA"
          title="Categorias de entrada"
          createLabel="Nova categoria de entrada"
          onDataChanged={() => loadChartData()}
          listFields={[
            { key: "nome", label: "Nome" },
            { key: "descricao", label: "Descrição" },
            { key: "ativa", label: "Ativa" }
          ]}
          fields={[
            { key: "nome", label: "Nome", required: true },
            { key: "descricao", label: "Descrição", type: "textarea" },
            {
              key: "ativa",
              label: "Ativa",
              type: "select",
              options: [
                { label: "Sim", value: "true" },
                { label: "Não", value: "false" }
              ]
            }
          ]}
          defaultValues={{ tipo: "ENTRADA", ativa: "true" }}
          createCapability="finance.cash.manage"
          updateCapability="finance.cash.manage"
          deleteCapability="finance.cash.manage"
        />

        <CrudModule
          endpoint="/api/categorias-financeiras?tipo=SAIDA"
          title="Categorias de saída"
          createLabel="Nova categoria de saída"
          onDataChanged={() => loadChartData()}
          listFields={[
            { key: "nome", label: "Nome" },
            { key: "descricao", label: "Descrição" },
            { key: "ativa", label: "Ativa" }
          ]}
          fields={[
            { key: "nome", label: "Nome", required: true },
            { key: "descricao", label: "Descrição", type: "textarea" },
            {
              key: "ativa",
              label: "Ativa",
              type: "select",
              options: [
                { label: "Sim", value: "true" },
                { label: "Não", value: "false" }
              ]
            }
          ]}
          defaultValues={{ tipo: "SAIDA", ativa: "true" }}
          createCapability="finance.cash.manage"
          updateCapability="finance.cash.manage"
          deleteCapability="finance.cash.manage"
        />
      </div>
    </div>
  );
}
