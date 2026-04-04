"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarCheck2, X } from "lucide-react";
import { ModuleHeader } from "@/components/ui/module-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MonthYearPicker } from "@/components/ui/month-year-picker";

type MatrizAluno = {
  id: string;
  nomeCompleto: string;
  status: string;
};

type MatrizPresenca = {
  id: string;
  alunoId: string;
  data: string;
  presente: boolean;
};

const WEEKDAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

function daysInCompetencia(competencia: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(competencia);
  if (!match) {
    return 30;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return 30;
  }
  return new Date(year, month, 0).getDate();
}

function dayIso(competencia: string, day: number) {
  return `${competencia}-${String(day).padStart(2, "0")}`;
}

function isoDateKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function weekdayLabel(competencia: string, day: number) {
  const date = new Date(`${dayIso(competencia, day)}T00:00:00`);
  return WEEKDAY_LABELS[date.getDay()] ?? "";
}

export default function FrequenciaPage() {
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [buscaAluno, setBuscaAluno] = useState("");
  const [relatorio, setRelatorio] = useState<string>("");
  const [matrizLoading, setMatrizLoading] = useState(false);
  const [matrizError, setMatrizError] = useState("");
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [alunos, setAlunos] = useState<MatrizAluno[]>([]);
  const [presencas, setPresencas] = useState<Record<string, { id: string; presente: boolean }>>({});
  const [alunoCalendario, setAlunoCalendario] = useState<MatrizAluno | null>(null);
  const [weekIndex, setWeekIndex] = useState(0);

  const totalDiasMes = useMemo(() => daysInCompetencia(competencia), [competencia]);
  const diasMes = useMemo(() => Array.from({ length: totalDiasMes }, (_, index) => index + 1), [totalDiasMes]);

  const alunosFiltrados = useMemo(() => {
    const query = buscaAluno.trim().toLowerCase();
    if (!query) {
      return alunos;
    }
    return alunos.filter((aluno) => aluno.nomeCompleto.toLowerCase().includes(query));
  }, [alunos, buscaAluno]);

  const totalMarcacoesMes = useMemo(
    () => Object.values(presencas).filter((presenca) => presenca.presente).length,
    [presencas]
  );
  const todayCompetencia = new Date().toISOString().slice(0, 7);
  const todayDay = competencia === todayCompetencia ? new Date().getDate() : null;

  const weekRanges = useMemo(() => {
    const ranges: Array<{ start: number; end: number; days: number[] }> = [];
    for (let start = 1; start <= totalDiasMes; start += 7) {
      const end = Math.min(start + 6, totalDiasMes);
      ranges.push({
        start,
        end,
        days: Array.from({ length: end - start + 1 }, (_, index) => start + index)
      });
    }
    return ranges;
  }, [totalDiasMes]);

  const selectedWeek = weekRanges[Math.min(weekIndex, Math.max(weekRanges.length - 1, 0))] ?? {
    start: 1,
    end: Math.min(7, totalDiasMes),
    days: Array.from({ length: Math.min(7, totalDiasMes) }, (_, index) => index + 1)
  };
  const diasSemanaSelecionada = selectedWeek.days;

  useEffect(() => {
    const today = new Date();
    const isSameMonth =
      today.getFullYear() === Number(competencia.slice(0, 4)) &&
      today.getMonth() + 1 === Number(competencia.slice(5, 7));

    if (isSameMonth) {
      setWeekIndex(Math.floor((today.getDate() - 1) / 7));
      return;
    }

    setWeekIndex(0);
  }, [competencia]);

  const totalPresencasAlunoSelecionado = useMemo(() => {
    if (!alunoCalendario) return 0;
    return diasMes.reduce((acc, day) => {
      const key = `${alunoCalendario.id}|${dayIso(competencia, day)}`;
      return acc + (presencas[key]?.presente ? 1 : 0);
    }, 0);
  }, [alunoCalendario, competencia, diasMes, presencas]);

  async function loadMatriz() {
    setMatrizLoading(true);
    setMatrizError("");

    try {
      const res = await fetch(`/api/frequencia/matriz?competencia=${competencia}`);
      const payload = await res.json();

      if (!res.ok) {
        setMatrizError(payload.error ?? "Falha ao carregar matriz de frequência.");
        setAlunos([]);
        setPresencas({});
        return;
      }

      const nextAlunos: MatrizAluno[] = Array.isArray(payload.items?.alunos) ? payload.items.alunos : [];
      const nextPresencasRaw: MatrizPresenca[] = Array.isArray(payload.items?.presencas) ? payload.items.presencas : [];

      const index: Record<string, { id: string; presente: boolean }> = {};
      for (const presenca of nextPresencasRaw) {
        const key = `${presenca.alunoId}|${isoDateKey(presenca.data)}`;
        index[key] = { id: presenca.id, presente: Boolean(presenca.presente) };
      }

      setAlunos(nextAlunos);
      setPresencas(index);
    } catch {
      setMatrizError("Falha ao carregar matriz de frequência.");
      setAlunos([]);
      setPresencas({});
    } finally {
      setMatrizLoading(false);
    }
  }

  useEffect(() => {
    void loadMatriz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competencia]);

  async function togglePresenca(alunoId: string, day: number) {
    const dateKey = dayIso(competencia, day);
    const cellKey = `${alunoId}|${dateKey}`;
    const existing = presencas[cellKey];

    setSavingCell(cellKey);
    try {
      if (existing?.presente) {
        const res = await fetch(`/api/presencas/${existing.id}`, { method: "DELETE" });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          alert(payload.error ?? "Não foi possível remover a presença.");
          return;
        }

        setPresencas((prev) => {
          const next = { ...prev };
          delete next[cellKey];
          return next;
        });
        return;
      }

      if (existing && !existing.presente) {
        const res = await fetch(`/api/presencas/${existing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ presente: true })
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          alert(payload.error ?? "Não foi possível atualizar a presença.");
          return;
        }

        const payload = await res.json();
        setPresencas((prev) => ({
          ...prev,
          [cellKey]: { id: String(payload.item?.id ?? existing.id), presente: true }
        }));
        return;
      }

      const createPayload: Record<string, string | boolean> = {
        alunoId,
        data: dateKey,
        tipoAula: "musculacao",
        presente: true
      };

      const res = await fetch("/api/presencas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createPayload)
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(payload.error ?? "Não foi possível salvar a presença.");
        return;
      }

      const id = String(payload.item?.id ?? "");
      if (!id) {
        await loadMatriz();
        return;
      }

      setPresencas((prev) => ({
        ...prev,
        [cellKey]: { id, presente: true }
      }));
    } finally {
      setSavingCell(null);
    }
  }

  return (
    <div className="space-y-4">
      <ModuleHeader
        title="Frequência"
        description="Marcação mensal de presença, ranking e alerta de baixa frequência."
        icon={CalendarCheck2}
        badges={["Presença diária", "Ranking mensal", "Análise de engajamento"]}
        stats={[
          { label: "Visão", value: "Aluno e turma" },
          { label: "Lançamento", value: "Rápido" }
        ]}
      />

      <Card className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Gere o ranking para visualizar os alunos mais e menos frequentes na competência.</p>
        <Button
          onClick={async () => {
            const res = await fetch(`/api/relatorios/frequencia?competencia=${competencia}`);
            const data = await res.json();
            setRelatorio(JSON.stringify(data, null, 2));
          }}
        >
          Gerar ranking de frequência
        </Button>
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[160px] text-sm font-semibold text-ink">
            Competência
            <MonthYearPicker value={competencia} onChange={setCompetencia} />
          </label>
          <label className="min-w-[220px] flex-1 text-sm font-semibold text-ink">
            Buscar aluno
            <Input value={buscaAluno} onChange={(event) => setBuscaAluno(event.target.value)} placeholder="Digite o nome do aluno" />
          </label>
          <Button variant="secondary" onClick={() => void loadMatriz()}>
            Atualizar grade
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-muted">
          <span className="rounded-full border border-line bg-white/80 px-2.5 py-1">Alunos listados: {alunosFiltrados.length}</span>
          <span className="rounded-full border border-line bg-white/80 px-2.5 py-1">Presenças no mês: {totalMarcacoesMes}</span>
          <span className="rounded-full border border-line bg-white/80 px-2.5 py-1">Clique no dia para marcar/desmarcar presença</span>
        </div>

        {matrizError ? <p className="rounded-lg border border-[#f1c5ca] bg-[#fff0f2] px-3 py-2 text-sm text-[#a21b25]">{matrizError}</p> : null}

        <div className="rounded-xl border border-line/80 bg-white/80">
          {matrizLoading ? (
            <div className="p-4 text-sm text-muted">Carregando grade de frequência...</div>
          ) : alunosFiltrados.length === 0 ? (
            <div className="p-4 text-sm text-muted">Nenhum aluno encontrado.</div>
          ) : (
            <div className="flex min-w-0">
              <div className="w-[240px] shrink-0 border-r border-line/80 bg-white/95">
                <table className="w-full !border-0 !rounded-none bg-transparent">
                  <thead>
                    <tr>
                      <th className="h-[56px] min-w-[220px]">Aluno</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alunosFiltrados.map((aluno) => (
                      <tr key={`left-${aluno.id}`}>
                        <td className="h-[46px] max-w-[220px]">
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setAlunoCalendario(aluno)}
                              className="max-w-[150px] truncate whitespace-nowrap text-left font-semibold text-ink underline-offset-2 transition hover:underline"
                              title="Abrir calendário do aluno"
                            >
                              {aluno.nomeCompleto}
                            </button>
                            {todayDay ? (
                              (() => {
                                const todayKey = `${aluno.id}|${dayIso(competencia, todayDay)}`;
                                const checked = Boolean(presencas[todayKey]?.presente);
                                const saving = savingCell === todayKey;
                                return (
                                  <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => void togglePresenca(aluno.id, todayDay)}
                                    className={
                                      checked
                                        ? "rounded-md border border-[rgba(138,12,20,0.28)] bg-accent px-2 py-1 text-[11px] font-bold text-white transition hover:brightness-105 disabled:opacity-50"
                                        : "rounded-md border border-line bg-white px-2 py-1 text-[11px] font-semibold text-muted transition hover:bg-accentSoft disabled:opacity-50"
                                    }
                                    title="Marcar/desmarcar presença de hoje"
                                  >
                                    {saving ? "..." : checked ? "Hoje 1" : "Hoje"}
                                  </button>
                                );
                              })()
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
                <table className="w-max min-w-full !border-0 !rounded-none bg-transparent">
                  <thead>
                    <tr>
                      {diasSemanaSelecionada.map((day) => (
                        <th key={`head-${day}`} className="h-[56px] min-w-[42px] text-center">
                          <div className="text-[11px] font-bold leading-none">{day}</div>
                          <div className="mt-1 text-[10px] uppercase text-muted">{weekdayLabel(competencia, day)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {alunosFiltrados.map((aluno) => (
                      <tr key={aluno.id}>
                        {diasSemanaSelecionada.map((day) => {
                          const dateKey = dayIso(competencia, day);
                          const cellKey = `${aluno.id}|${dateKey}`;
                          const checked = Boolean(presencas[cellKey]?.presente);
                          const isSaving = savingCell === cellKey;

                          return (
                            <td key={`${aluno.id}-${day}`} className="h-[46px] text-center">
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => void togglePresenca(aluno.id, day)}
                                className={
                                  checked
                                    ? "h-7 w-7 rounded-md border border-[rgba(138,12,20,0.25)] bg-accent text-sm font-bold text-white transition hover:brightness-105 disabled:opacity-50"
                                    : "h-7 w-7 rounded-md border border-line bg-white text-sm font-bold text-muted transition hover:bg-accentSoft disabled:opacity-50"
                                }
                              >
                                {checked ? "1" : ""}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted">
            Semana {Math.min(weekIndex + 1, weekRanges.length)}/{weekRanges.length} • Dias {selectedWeek.start}-{selectedWeek.end}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              disabled={weekIndex <= 0}
              onClick={() => setWeekIndex((prev) => Math.max(0, prev - 1))}
            >
              Semana anterior
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              disabled={weekIndex >= weekRanges.length - 1}
              onClick={() => setWeekIndex((prev) => Math.min(weekRanges.length - 1, prev + 1))}
            >
              Próxima semana
            </Button>
          </div>
        </div>
      </Card>

      {relatorio ? (
        <Card>
          <h3 className="mb-2 text-base font-bold text-ink">Relatório mensal de frequência</h3>
          <pre className="max-h-[420px] overflow-auto rounded-xl border border-line bg-white/70 p-3 text-xs">{relatorio}</pre>
        </Card>
      ) : null}

      {alunoCalendario ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,14,17,0.62)] p-4 backdrop-blur-[2px]">
          <Card className="max-h-[92vh] w-full max-w-4xl overflow-hidden p-0">
            <div className="flex items-start justify-between border-b border-line/80 px-5 py-4 md:px-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">Frequência</p>
                <h3 className="text-xl font-black text-ink">Calendário do aluno</h3>
                <p className="mt-1 text-sm text-muted">
                  {alunoCalendario.nomeCompleto} • {competencia} • Presenças: {totalPresencasAlunoSelecionado}
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar calendário"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-ink transition hover:bg-accentSoft"
                onClick={() => setAlunoCalendario(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[calc(92vh-88px)] overflow-y-auto px-5 py-4 md:px-6 md:py-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2 text-xs text-muted">
                  <span className="rounded-full border border-line bg-white/80 px-2.5 py-1">Clique para marcar/desmarcar</span>
                  {todayDay ? (
                    <button
                      type="button"
                      onClick={() => void togglePresenca(alunoCalendario.id, todayDay)}
                      className="rounded-full border border-line bg-white/80 px-2.5 py-1 text-xs font-semibold text-ink transition hover:bg-accentSoft"
                    >
                      Marcar hoje
                    </button>
                  ) : null}
                </div>
                <span className="text-xs font-semibold text-muted">
                  Semana {Math.min(weekIndex + 1, weekRanges.length)}/{weekRanges.length} • Dias {selectedWeek.start}-{selectedWeek.end}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {diasSemanaSelecionada.map((day) => {
                  const cellKey = `${alunoCalendario.id}|${dayIso(competencia, day)}`;
                  const checked = Boolean(presencas[cellKey]?.presente);
                  const isSaving = savingCell === cellKey;

                  return (
                    <button
                      key={`day-${day}`}
                      type="button"
                      disabled={isSaving}
                      onClick={() => void togglePresenca(alunoCalendario.id, day)}
                      className={
                        checked
                          ? "flex h-[68px] flex-col items-start justify-between rounded-lg border border-[rgba(138,12,20,0.28)] bg-accent px-2 py-2 text-white transition hover:brightness-105 disabled:opacity-50"
                          : "flex h-[68px] flex-col items-start justify-between rounded-lg border border-line bg-white px-2 py-2 text-ink transition hover:bg-accentSoft disabled:opacity-50"
                      }
                    >
                      <span className="text-sm font-black">
                        {day} <span className="ml-1 text-[10px] font-bold uppercase opacity-80">{weekdayLabel(competencia, day)}</span>
                      </span>
                      <span className="text-[11px] font-semibold">{isSaving ? "..." : checked ? "Presente" : "Marcar"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
