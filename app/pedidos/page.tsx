"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Search, ShoppingBag } from "lucide-react";
import { CrudModule } from "@/components/forms/crud-module";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModuleHeader } from "@/components/ui/module-header";

type AbertoItem = {
  id: string;
  alunoId: string;
  alunoNome: string;
  telefone: string;
  dataPedido: string;
  produto: string;
  quantidade: number;
  valorTotal: number;
  pago: number;
  valorAberto: number;
};

type AbertoAlunoResumo = {
  alunoId: string;
  alunoNome: string;
  telefone: string;
  totalAberto: number;
  pedidos: number;
};

type AbertosPayload = {
  items: AbertoItem[];
  resumoPorAluno: AbertoAlunoResumo[];
  totalAberto: number;
  totalItens: number;
};

const EMPTY_ABERTOS: AbertosPayload = {
  items: [],
  resumoPorAluno: [],
  totalAberto: 0,
  totalItens: 0
};

function currency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
}

export default function PedidosPage() {
  const [abertos, setAbertos] = useState<AbertosPayload>(EMPTY_ABERTOS);
  const [loadingAbertos, setLoadingAbertos] = useState(false);
  const [searchAbertos, setSearchAbertos] = useState("");
  const [abertoDrafts, setAbertoDrafts] = useState<Record<string, string>>({});
  const [savingAbertoId, setSavingAbertoId] = useState<string | null>(null);
  const [pedidosRefreshKey, setPedidosRefreshKey] = useState(0);

  function parseAmountInput(rawValue: string) {
    const raw = String(rawValue ?? "").trim();
    if (!raw) return Number.NaN;
    const normalized = raw.replace(/\s+/g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  async function loadAbertos(query = searchAbertos) {
    setLoadingAbertos(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      const suffix = params.toString();
      const res = await fetch(`/api/pedidos/abertos${suffix ? `?${suffix}` : ""}`, {
        cache: "no-store"
      });
      const payload = (await res.json().catch(() => ({}))) as Partial<AbertosPayload> & { error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? "Falha ao carregar valores em aberto");
      }

      setAbertos({
        items: payload.items ?? [],
        resumoPorAluno: payload.resumoPorAluno ?? [],
        totalAberto: Number(payload.totalAberto ?? 0),
        totalItens: Number(payload.totalItens ?? 0)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao carregar valores em aberto";
      alert(message);
      setAbertos(EMPTY_ABERTOS);
    } finally {
      setLoadingAbertos(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadAbertos(searchAbertos);
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchAbertos]);

  useEffect(() => {
    setAbertoDrafts(
      abertos.items.reduce<Record<string, string>>((acc, item) => {
        acc[item.id] = item.valorAberto.toFixed(2);
        return acc;
      }, {})
    );
  }, [abertos.items]);

  async function salvarPendente(item: AbertoItem) {
    const raw = abertoDrafts[item.id] ?? item.valorAberto.toFixed(2);
    const pendente = parseAmountInput(raw);
    if (!Number.isFinite(pendente)) {
      alert("Valor pendente inválido.");
      return;
    }

    if (pendente < 0) {
      alert("Valor pendente não pode ser negativo.");
      return;
    }

    if (pendente > item.valorTotal) {
      alert("Valor pendente não pode ser maior que o valor total do pedido.");
      return;
    }

    const pago = Math.max(0, Number((item.valorTotal - pendente).toFixed(2)));
    setSavingAbertoId(item.id);
    try {
      const res = await fetch(`/api/pedidos/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pago })
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? "Falha ao atualizar valor pendente");
      }

      await loadAbertos(searchAbertos);
      setPedidosRefreshKey((prev) => prev + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao atualizar valor pendente";
      alert(message);
    } finally {
      setSavingAbertoId(null);
    }
  }

  return (
    <div className="space-y-4">
      <ModuleHeader
        title="Pedidos"
        description="Pedidos internos de roupas/produtos com status de pagamento e produção."
        icon={ShoppingBag}
        badges={["Pedido manual", "Pagamento parcial", "Lista de produção"]}
        stats={[
          { label: "Visão", value: "Modelo/Cor/Tamanho" },
          { label: "Fluxo", value: "Pedido até entrega" }
        ]}
      />

      <Card className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[250px] flex-1 text-sm font-medium text-ink">
            Buscar aberto por aluno, telefone ou produto
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                value={searchAbertos}
                onChange={(event) => setSearchAbertos(event.target.value)}
                className="pl-9"
                placeholder="Digite para filtrar valores em aberto"
              />
            </div>
          </label>
          <Button
            type="button"
            variant="secondary"
            className="inline-flex items-center gap-2"
            onClick={() => void loadAbertos()}
            disabled={loadingAbertos}
          >
            <RefreshCw className="h-4 w-4" />
            {loadingAbertos ? "Atualizando..." : "Atualizar abertos"}
          </Button>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <div className="rounded-xl border border-[rgba(190,104,18,0.22)] bg-[rgba(255,242,228,0.84)] p-3 text-sm">
            <div className="font-semibold text-[#95510f]">Itens em aberto: {abertos.totalItens}</div>
          </div>
          <div className="rounded-xl border border-[rgba(159,16,24,0.22)] bg-[rgba(253,236,239,0.88)] p-3 text-sm">
            <div className="font-semibold text-accentDark">Total em aberto: {currency(abertos.totalAberto)}</div>
          </div>
          <div className="rounded-xl border border-line/80 bg-white/85 p-3 text-sm">
            <div className="font-semibold text-ink">Alunos com pendência: {abertos.resumoPorAluno.length}</div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-accentDark" />
              <h3 className="text-base font-black text-ink">Resumo por aluno</h3>
            </div>

            <div className="max-h-[280px] overflow-auto rounded-xl border border-line/80 bg-white/85">
              <table>
                <thead>
                  <tr>
                    <th>Aluno</th>
                    <th>Pedidos</th>
                    <th>Aberto</th>
                  </tr>
                </thead>
                <tbody>
                  {abertos.resumoPorAluno.length === 0 ? (
                    <tr>
                      <td colSpan={3}>{loadingAbertos ? "Carregando..." : "Sem pendências em aberto."}</td>
                    </tr>
                  ) : (
                    abertos.resumoPorAluno.map((item) => (
                      <tr key={`resumo-${item.alunoId}`}>
                        <td>
                          <div className="font-semibold text-ink">{item.alunoNome}</div>
                          <div className="text-xs text-muted">{item.telefone || "-"}</div>
                        </td>
                        <td>{item.pedidos}</td>
                        <td className="font-semibold text-accentDark">{currency(item.totalAberto)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-base font-black text-ink">Pedidos com valor em aberto</h3>

            <div className="max-h-[280px] overflow-auto rounded-xl border border-line/80 bg-white/85">
              <table>
                <thead>
                  <tr>
                    <th>Aluno</th>
                    <th>Produto</th>
                    <th>Data</th>
                    <th>Total</th>
                    <th>Pago</th>
                    <th>Pendente</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {abertos.items.length === 0 ? (
                    <tr>
                      <td colSpan={7}>{loadingAbertos ? "Carregando..." : "Nenhum pedido em aberto."}</td>
                    </tr>
                  ) : (
                    abertos.items.map((item) => (
                      <tr key={`pedido-aberto-${item.id}`}>
                        <td>{item.alunoNome}</td>
                        <td>{item.produto || "-"}</td>
                        <td>{formatDate(item.dataPedido)}</td>
                        <td>{currency(item.valorTotal)}</td>
                        <td>{currency(item.pago)}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max={String(item.valorTotal)}
                              value={abertoDrafts[item.id] ?? item.valorAberto.toFixed(2)}
                              onChange={(event) =>
                                setAbertoDrafts((prev) => ({ ...prev, [item.id]: event.target.value }))
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void salvarPendente(item);
                                }
                              }}
                              className="w-28"
                            />
                          </div>
                        </td>
                        <td>
                          <Button
                            type="button"
                            variant="secondary"
                            className="px-2.5 py-1.5 text-xs"
                            disabled={savingAbertoId === item.id}
                            onClick={() => void salvarPendente(item)}
                          >
                            {savingAbertoId === item.id ? "Salvando..." : "Salvar"}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Card>

      <CrudModule
        endpoint="/api/pedidos"
        title="Pedidos de produtos"
        createLabel="Novo pedido"
        onDataChanged={() => loadAbertos()}
        refreshKey={pedidosRefreshKey}
        listFields={[
          { key: "clienteNome", label: "Cliente" },
          { key: "produtoNome", label: "Produto" },
          { key: "cor", label: "Cor" },
          { key: "tamanho", label: "Tamanho" },
          { key: "quantidade", label: "Qtd." },
          { key: "valorUnitario", label: "Valor un." },
          { key: "valorTotal", label: "Valor total" },
          { key: "pago", label: "Pago" },
          { key: "dataPedido", label: "Data" }
        ]}
        fields={[
          { key: "alunoId", label: "Cliente (aluno)", required: true },
          { key: "produtoId", label: "Produto", required: true },
          { key: "quantidade", label: "Quantidade", type: "number", required: true },
          { key: "pago", label: "Valor pago", type: "number" },
          { key: "dataPedido", label: "Data pedido", type: "date" },
          { key: "observacao", label: "Observação", type: "textarea" }
        ]}
        defaultValues={{ quantidade: "1", pago: "0" }}
        createCapability="sales.create"
        updateCapability="sales.manage"
        deleteCapability="sales.manage"
      />
    </div>
  );
}
