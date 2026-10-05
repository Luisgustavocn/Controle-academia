"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CrudModule } from "@/components/forms/crud-module";
import { ModuleHeader } from "@/components/ui/module-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MonthYearPicker } from "@/components/ui/month-year-picker";

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
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [loadingCharts, setLoadingCharts] = useState(false);
  const [entradas, setEntradas] = useState<CaixaItem[]>([]);
  const [saidas, setSaidas] = useState<CaixaItem[]>([]);

  async function loadChartData() {
    setLoadingCharts(true);
    try {
      const query = `competencia=${encodeURIComponent(competencia)}`;
      const [entradasRes, saidasRes] = await Promise.all([
        fetch(`/api/caixa?${query}&tipo=ENTRADA`, { cache: "no-store" }),
        fetch(`/api/caixa?${query}&tipo=SAIDA`, { cache: "no-store" })
      ]);

      const [entradasPayload, saidasPayload] = await Promise.all([
        entradasRes.json().catch(() => ({})),
        saidasRes.json().catch(() => ({}))
      ]);

      if (!entradasRes.ok || !saidasRes.ok) {
        throw new Error(
          (entradasPayload as { error?: string }).error ||
            (saidasPayload as { error?: string }).error ||
            "Falha ao carregar gráficos de caixa"
        );
      }

      setEntradas(
        Array.isArray((entradasPayload as { items?: unknown[] }).items)
          ? ((entradasPayload as { items: CaixaItem[] }).items ?? [])
          : []
      );
      setSaidas(
        Array.isArray((saidasPayload as { items?: unknown[] }).items)
          ? ((saidasPayload as { items: CaixaItem[] }).items ?? [])
          : []
      );
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
  }, [competencia]);

  const chartEntradas = useMemo(() => aggregateByCategory(entradas), [entradas]);
  const chartSaidas = useMemo(() => aggregateByCategory(saidas), [saidas]);
  const totalEntradas = useMemo(() => entradas.reduce((acc, item) => acc + Number(item.valor), 0), [entradas]);
  const totalSaidas = useMemo(() => saidas.reduce((acc, item) => acc + Number(item.valor), 0), [saidas]);

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
        <div className="flex flex-wrap items-end gap-2">
          <label className="w-full max-w-[220px] text-sm font-medium text-ink">
            Mês dos gráficos
            <MonthYearPicker value={competencia} onChange={setCompetencia} />
          </label>
          <Button variant="secondary" onClick={() => void loadChartData()} disabled={loadingCharts}>
            {loadingCharts ? "Carregando..." : "Atualizar gráficos"}
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-[rgba(34,136,83,0.22)] bg-[rgba(230,249,239,0.85)] p-3 text-sm font-semibold text-[#1f6d44]">
            Entradas no mês: {currency(totalEntradas)}
          </div>
          <div className="rounded-xl border border-[rgba(159,16,24,0.22)] bg-[rgba(253,236,239,0.88)] p-3 text-sm font-semibold text-accentDark">
            Saídas no mês: {currency(totalSaidas)}
          </div>
        </div>
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
