"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock3, CreditCard, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MonthYearPicker } from "@/components/ui/month-year-picker";
import { ModuleHeader } from "@/components/ui/module-header";
import { Select } from "@/components/ui/select";

type MensalidadeStatus = "PENDENTE" | "PAGO" | "ATRASADO" | "ISENTO";
type MensalidadeSection = "PAGAS" | "PENDENTES" | "ATRASADAS";

type MensalidadeItem = {
  id: string;
  alunoId: string;
  alunoNome: string;
  telefone: string;
  modalidade: string;
  competencia: string;
  mesPendente: string;
  valor: number;
  vencimento: string;
  vencimentoDia: number;
  dataPagamento: string;
  formaPagamento: string;
  observacao: string;
  status: MensalidadeStatus;
};

type BoardPayload = {
  referencia: string;
  referenciaLabel: string;
  colunas: {
    pagas: MensalidadeItem[];
    pendentes: MensalidadeItem[];
    atrasadas: MensalidadeItem[];
  };
  resumo: {
    pagas: number;
    pendentes: number;
    atrasadas: number;
    totalPagoMes: number;
    totalPendenteMes: number;
    totalAtrasado: number;
  };
};

const EMPTY_PAYLOAD: BoardPayload = {
  referencia: "",
  referenciaLabel: "",
  colunas: {
    pagas: [],
    pendentes: [],
    atrasadas: []
  },
  resumo: {
    pagas: 0,
    pendentes: 0,
    atrasadas: 0,
    totalPagoMes: 0,
    totalPendenteMes: 0,
    totalAtrasado: 0
  }
};

const statusOptions: Array<{ label: string; value: MensalidadeStatus }> = [
  { label: "Pendente", value: "PENDENTE" },
  { label: "Pago", value: "PAGO" },
  { label: "Atrasado", value: "ATRASADO" },
  { label: "Isento", value: "ISENTO" }
];

const MONTH_SHORT_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

function todayDayMonth() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = MONTH_SHORT_PT[now.getMonth()] ?? String(now.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

function toCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

export default function MensalidadesPage() {
  const [payload, setPayload] = useState<BoardPayload>(EMPTY_PAYLOAD);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [activeSection, setActiveSection] = useState<MensalidadeSection | null>("PAGAS");
  const [editing, setEditing] = useState<MensalidadeItem | null>(null);
  const [editForm, setEditForm] = useState({
    dataPagamento: "",
    formaPagamento: "",
    status: "PENDENTE" as MensalidadeStatus,
    observacao: ""
  });

  async function fetchBoard() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (competencia) params.set("competencia", competencia);
      if (search.trim()) params.set("q", search.trim());

      const res = await fetch(`/api/mensalidades/colunas?${params.toString()}`, {
        cache: "no-store"
      });
      const data = (await res.json().catch(() => ({}))) as Partial<BoardPayload> & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Não foi possível carregar as mensalidades");
      }

      setPayload({
        ...EMPTY_PAYLOAD,
        ...data,
        colunas: {
          pagas: data.colunas?.pagas ?? [],
          pendentes: data.colunas?.pendentes ?? [],
          atrasadas: data.colunas?.atrasadas ?? []
        },
        resumo: {
          ...EMPTY_PAYLOAD.resumo,
          ...(data.resumo ?? {})
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao carregar";
      alert(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchBoard();
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competencia, search]);

  function openEdit(item: MensalidadeItem) {
    setEditing(item);
    setEditForm({
      dataPagamento: item.dataPagamento,
      formaPagamento: item.formaPagamento,
      status: item.status,
      observacao: item.observacao
    });
  }

  function closeEdit() {
    setEditing(null);
  }

  function toggleSection(section: MensalidadeSection) {
    setActiveSection((prev) => (prev === section ? null : section));
  }

  async function salvarEdicao() {
    if (!editing) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/mensalidades/${editing.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          dataPagamento: editForm.dataPagamento,
          formaPagamento: editForm.formaPagamento,
          status: editForm.status,
          observacao: editForm.observacao
        })
      });

      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        const fallback = `Não foi possível salvar (${res.status})`;
        throw new Error(data?.error ?? fallback);
      }

      closeEdit();
      await fetchBoard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao salvar";
      alert(message);
    } finally {
      setSaving(false);
    }
  }

  async function marcarComoPago(item: MensalidadeItem) {
    try {
      const res = await fetch(`/api/mensalidades/${item.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          status: "PAGO",
          dataPagamento: todayDayMonth()
        })
      });

      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        const fallback = `Não foi possível marcar como pago (${res.status})`;
        throw new Error(data?.error ?? fallback);
      }

      await fetchBoard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao atualizar pagamento";
      alert(message);
    }
  }

  const stats = useMemo(
    () => [
      { label: "Pagas", value: String(payload.resumo.pagas) },
      { label: "Pendentes", value: String(payload.resumo.pendentes) },
      { label: "Atrasadas", value: String(payload.resumo.atrasadas) }
    ],
    [payload.resumo]
  );

  return (
    <div className="space-y-4">
      <ModuleHeader
        title="Mensalidades"
        description="Cobrança mensal por mês de referência, com atraso acumulado por aluno/mês."
        icon={CreditCard}
        badges={["Cobrança mensal", "Pagas", "Atrasadas"]}
        stats={stats}
      />

      <Card className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="w-full max-w-[220px] text-sm font-medium text-ink">
            Mês de referência
            <MonthYearPicker value={competencia} onChange={setCompetencia} />
          </label>

          <label className="min-w-[260px] flex-1 text-sm font-medium text-ink">
            Buscar aluno (nome, telefone ou ID)
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Digite para filtrar"
                className="pl-9"
              />
            </div>
          </label>

          <Button type="button" variant="secondary" className="inline-flex items-center gap-2" onClick={() => void fetchBoard()}>
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <div className="rounded-xl border border-[rgba(34,136,83,0.22)] bg-[rgba(230,249,239,0.85)] p-3 text-sm">
            <div className="font-semibold text-[#1f6d44]">Recebido no mês: {toCurrency(payload.resumo.totalPagoMes)}</div>
          </div>
          <div className="rounded-xl border border-[rgba(190,104,18,0.22)] bg-[rgba(255,242,228,0.84)] p-3 text-sm">
            <div className="font-semibold text-[#95510f]">Pendente no mês: {toCurrency(payload.resumo.totalPendenteMes)}</div>
          </div>
          <div className="rounded-xl border border-[rgba(159,16,24,0.22)] bg-[rgba(253,236,239,0.88)] p-3 text-sm">
            <div className="font-semibold text-accentDark">Atrasado acumulado: {toCurrency(payload.resumo.totalAtrasado)}</div>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <Card className="overflow-hidden p-0">
          <button
            type="button"
            onClick={() => toggleSection("PAGAS")}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-accentSoft/60"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#1f6d44]" />
              <h2 className="text-lg font-black text-ink">Pagas</h2>
              <span className="rounded-full border border-line bg-white px-2 py-0.5 text-xs font-semibold text-muted">
                {payload.colunas.pagas.length}
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted transition-transform duration-300 ${activeSection === "PAGAS" ? "rotate-180" : ""}`}
            />
          </button>
          <div
            className={`grid transition-all duration-300 ease-out ${
              activeSection === "PAGAS" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className={`overflow-hidden px-4 pb-4 ${activeSection !== "PAGAS" ? "pointer-events-none" : ""}`}>
              <div className="rounded-xl border border-line/80 bg-white/85">
                <table>
                  <thead>
                    <tr>
                      <th>Aluno</th>
                      <th>Valor</th>
                      <th>Pago em</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.colunas.pagas.length === 0 ? (
                      <tr>
                        <td colSpan={4}>{loading ? "Carregando..." : "Sem mensalidades pagas."}</td>
                      </tr>
                    ) : (
                      payload.colunas.pagas.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div className="font-semibold text-ink">{item.alunoNome}</div>
                            <div className="text-xs text-muted">{item.modalidade || "Sem modalidade"}</div>
                          </td>
                          <td>{toCurrency(item.valor)}</td>
                          <td>{item.dataPagamento || "-"}</td>
                          <td>
                            <Button variant="secondary" className="px-2.5 py-1.5 text-xs" onClick={() => openEdit(item)}>
                              Editar
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

        <Card className="overflow-hidden p-0">
          <button
            type="button"
            onClick={() => toggleSection("PENDENTES")}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-accentSoft/60"
          >
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-[#95510f]" />
              <h2 className="text-lg font-black text-ink">Pendentes</h2>
              <span className="rounded-full border border-line bg-white px-2 py-0.5 text-xs font-semibold text-muted">
                {payload.colunas.pendentes.length}
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted transition-transform duration-300 ${activeSection === "PENDENTES" ? "rotate-180" : ""}`}
            />
          </button>
          <div
            className={`grid transition-all duration-300 ease-out ${
              activeSection === "PENDENTES" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className={`overflow-hidden px-4 pb-4 ${activeSection !== "PENDENTES" ? "pointer-events-none" : ""}`}>
              <div className="rounded-xl border border-line/80 bg-white/85">
                <table>
                  <thead>
                    <tr>
                      <th>Aluno</th>
                      <th>Vence</th>
                      <th>Valor</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.colunas.pendentes.length === 0 ? (
                      <tr>
                        <td colSpan={4}>{loading ? "Carregando..." : "Sem mensalidades pendentes."}</td>
                      </tr>
                    ) : (
                      payload.colunas.pendentes.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div className="font-semibold text-ink">{item.alunoNome}</div>
                            <div className="text-xs text-muted">{item.modalidade || "Sem modalidade"}</div>
                          </td>
                          <td>{item.vencimento}</td>
                          <td>{toCurrency(item.valor)}</td>
                          <td>
                            <div className="flex flex-wrap gap-1.5">
                              <Button variant="secondary" className="px-2.5 py-1.5 text-xs" onClick={() => void marcarComoPago(item)}>
                                Marcar pago
                              </Button>
                              <Button variant="ghost" className="px-2.5 py-1.5 text-xs" onClick={() => openEdit(item)}>
                                Editar
                              </Button>
                            </div>
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

        <Card className="overflow-hidden p-0">
          <button
            type="button"
            onClick={() => toggleSection("ATRASADAS")}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-accentSoft/60"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-accentDark" />
              <h2 className="text-lg font-black text-ink">Atrasadas</h2>
              <span className="rounded-full border border-line bg-white px-2 py-0.5 text-xs font-semibold text-muted">
                {payload.colunas.atrasadas.length}
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted transition-transform duration-300 ${activeSection === "ATRASADAS" ? "rotate-180" : ""}`}
            />
          </button>
          <div
            className={`grid transition-all duration-300 ease-out ${
              activeSection === "ATRASADAS" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className={`overflow-hidden px-4 pb-4 ${activeSection !== "ATRASADAS" ? "pointer-events-none" : ""}`}>
              <div className="rounded-xl border border-line/80 bg-white/85">
                <table>
                  <thead>
                    <tr>
                      <th>Aluno</th>
                      <th>Mês pendente</th>
                      <th>Vence</th>
                      <th>Valor</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.colunas.atrasadas.length === 0 ? (
                      <tr>
                        <td colSpan={5}>{loading ? "Carregando..." : "Sem mensalidades atrasadas."}</td>
                      </tr>
                    ) : (
                      payload.colunas.atrasadas.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div className="font-semibold text-ink">{item.alunoNome}</div>
                            <div className="text-xs text-muted">{item.telefone}</div>
                          </td>
                          <td>{item.mesPendente}</td>
                          <td>{item.vencimento}</td>
                          <td>{toCurrency(item.valor)}</td>
                          <td>
                            <div className="flex flex-wrap gap-1.5">
                              <Button variant="secondary" className="px-2.5 py-1.5 text-xs" onClick={() => void marcarComoPago(item)}>
                                Marcar pago
                              </Button>
                              <Button variant="ghost" className="px-2.5 py-1.5 text-xs" onClick={() => openEdit(item)}>
                                Editar
                              </Button>
                            </div>
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
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,14,17,0.62)] p-4 backdrop-blur-[2px]">
          <Card className="max-h-[92vh] w-full max-w-3xl overflow-hidden p-0">
            <div className="flex items-start justify-between border-b border-line/80 px-5 py-4 md:px-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">Mensalidade</p>
                <h3 className="text-xl font-black text-ink">Editar cobrança</h3>
                <p className="mt-1 text-sm text-muted">
                  {editing.alunoNome} • {editing.mesPendente}
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar modal"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-ink transition hover:bg-accentSoft"
                onClick={closeEdit}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[calc(92vh-88px)] overflow-y-auto px-5 py-4 md:px-6 md:py-5">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm font-medium text-ink">
                  Valor
                  <Input value={toCurrency(editing.valor)} disabled />
                  <span className="mt-1 block text-xs text-muted">Valor fixo pela modalidade do aluno.</span>
                </label>

                <label className="text-sm font-medium text-ink">
                  Dia de vencimento
                  <Input value={String(editing.vencimentoDia)} disabled />
                  <span className="mt-1 block text-xs text-muted">Sincronizado automaticamente com o cadastro do aluno.</span>
                </label>

                <label className="text-sm font-medium text-ink">
                  Status
                  <Select
                    value={editForm.status}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        status: event.target.value as MensalidadeStatus,
                        dataPagamento:
                          event.target.value === "PAGO" && !prev.dataPagamento ? todayDayMonth() : prev.dataPagamento
                      }))
                    }
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="text-sm font-medium text-ink">
                  Data de pagamento (DD/mmm)
                  <Input
                    value={editForm.dataPagamento}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, dataPagamento: event.target.value }))}
                    placeholder="10/mar"
                  />
                </label>

                <label className="text-sm font-medium text-ink">
                  Forma de pagamento
                  <Input
                    value={editForm.formaPagamento}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, formaPagamento: event.target.value }))}
                    placeholder="Pix, dinheiro, cartão..."
                  />
                </label>

                <label className="text-sm font-medium text-ink md:col-span-2">
                  Observação
                  <textarea
                    value={editForm.observacao}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, observacao: event.target.value }))}
                    className="min-h-[96px] w-full rounded-xl border border-line/90 bg-white/95 px-3 py-2 text-sm text-ink outline-none ring-accent transition focus:border-accent/60 focus:ring-2"
                  />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap gap-2 border-t border-line/70 pt-4">
                <Button disabled={saving} onClick={() => void salvarEdicao()}>
                  {saving ? "Salvando..." : "Salvar alterações"}
                </Button>
                <Button variant="ghost" onClick={closeEdit}>
                  Cancelar
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
