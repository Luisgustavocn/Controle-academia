"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck2, CalendarDays, Check, CheckCircle2, History, RotateCcw, UserRoundCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { ModuleHeader } from "@/components/ui/module-header";
import { MonthYearPicker } from "@/components/ui/month-year-picker";
import { Pagination } from "@/components/ui/pagination";
import { SearchField } from "@/components/ui/search-field";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHasCapability } from "@/components/capability-provider";
import { academyToday, addCivilDays, civilDateLabel, civilDateToPrisma, compareCivilDates, parseCivilDate } from "@/lib/attendance-date";

type AttendanceMode = "today" | "history" | "monthly";
type AttendanceStudent = { id: string; name: string; phone: string; modality: string; attendance: { id: string; time: string | null; classType: string } | null };
type RosterPayload = {
  date: string;
  summary: { activeStudents: number; presentStudents: number; attendanceRate: number };
  items: AttendanceStudent[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
};
type HistoryPayload = {
  period: { from: string; to: string };
  items: Array<{ id: string; date: string; time: string | null; classType: string; student: { id: string; name: string; phone: string; modality: string } }>;
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
};
type MatrixStudent = { id: string; nomeCompleto: string; status: string; modalidade: { nome: string } | null };
type MatrixPresence = { id: string; alunoId: string; data: string; presente: boolean };
type MonthlyReport = { totalPresencasMes: number; ranking: Array<{ nome: string; total: number }>; baixaFrequencia: Array<{ nome: string; total: number }> };

const WEEKDAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function useDebouncedValue(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

function longDateLabel(dateKey: string) {
  const [year, month, day] = parseCivilDate(dateKey).split("-").map(Number);
  const formatted = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
    .format(new Date(Date.UTC(year, month - 1, day)));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function daysInMonth(competition: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(competition);
  return match ? new Date(Number(match[1]), Number(match[2]), 0).getDate() : 30;
}

function dayKey(competition: string, day: number) {
  return `${competition}-${String(day).padStart(2, "0")}`;
}

function weekdayLabel(competition: string, day: number) {
  return WEEKDAY_LABELS[civilDateToPrisma(dayKey(competition, day)).getUTCDay()] ?? "";
}

function LoadingRows({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2" aria-label="Carregando presenças">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-ds-lg border border-line/70 p-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2"><Skeleton className="h-3 w-40" /><Skeleton className="h-3 w-24" /></div>
          <Skeleton className="h-9 w-32" />
        </div>
      ))}
    </div>
  );
}

export default function FrequenciaPage() {
  const today = academyToday();
  const canWrite = useHasCapability("attendance.write");
  const canRetroactive = useHasCapability("attendance.retroactive");
  const [mode, setMode] = useState<AttendanceMode>("today");
  const [feedback, setFeedback] = useState("");

  const [retroactiveOpen, setRetroactiveOpen] = useState(false);
  const [operationalDate, setOperationalDate] = useState(today);
  const [rosterSearch, setRosterSearch] = useState("");
  const debouncedRosterSearch = useDebouncedValue(rosterSearch);
  const [rosterPage, setRosterPage] = useState(1);
  const [roster, setRoster] = useState<RosterPayload | null>(null);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState("");
  const [savingStudent, setSavingStudent] = useState<string | null>(null);

  const [historyCompetition, setHistoryCompetition] = useState(today.slice(0, 7));
  const [historySearch, setHistorySearch] = useState("");
  const debouncedHistorySearch = useDebouncedValue(historySearch);
  const [historyPage, setHistoryPage] = useState(1);
  const [history, setHistory] = useState<HistoryPayload | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const [monthlyCompetition, setMonthlyCompetition] = useState(today.slice(0, 7));
  const [monthlySearch, setMonthlySearch] = useState("");
  const [matrixStudents, setMatrixStudents] = useState<MatrixStudent[]>([]);
  const [matrixPresences, setMatrixPresences] = useState<Record<string, { id: string; present: boolean }>>({});
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState("");
  const [weekIndex, setWeekIndex] = useState(0);
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const loadRoster = useCallback(async () => {
    setRosterLoading(true);
    setRosterError("");
    const query = new URLSearchParams({ data: operationalDate, page: String(rosterPage), pageSize: "12" });
    if (debouncedRosterSearch.trim()) query.set("q", debouncedRosterSearch.trim());
    try {
      const response = await fetch(`/api/frequencia/hoje?${query}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar os alunos.");
      setRoster(payload as RosterPayload);
    } catch (error) {
      setRosterError(error instanceof Error ? error.message : "Não foi possível carregar os alunos.");
    } finally {
      setRosterLoading(false);
    }
  }, [debouncedRosterSearch, operationalDate, rosterPage]);

  useEffect(() => { if (mode === "today") void loadRoster(); }, [loadRoster, mode]);
  useEffect(() => setRosterPage(1), [debouncedRosterSearch, operationalDate]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    const query = new URLSearchParams({ competencia: historyCompetition, page: String(historyPage), pageSize: "20" });
    if (debouncedHistorySearch.trim()) query.set("q", debouncedHistorySearch.trim());
    try {
      const response = await fetch(`/api/frequencia/historico?${query}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar o histórico.");
      setHistory(payload as HistoryPayload);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Não foi possível carregar o histórico.");
    } finally {
      setHistoryLoading(false);
    }
  }, [debouncedHistorySearch, historyCompetition, historyPage]);

  useEffect(() => { if (mode === "history") void loadHistory(); }, [loadHistory, mode]);
  useEffect(() => setHistoryPage(1), [debouncedHistorySearch, historyCompetition]);

  const loadMatrix = useCallback(async () => {
    setMatrixLoading(true);
    setMatrixError("");
    try {
      const response = await fetch(`/api/frequencia/matriz?competencia=${monthlyCompetition}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar a visão mensal.");
      const students = Array.isArray(payload.items?.alunos) ? payload.items.alunos as MatrixStudent[] : [];
      const presences = Array.isArray(payload.items?.presencas) ? payload.items.presencas as MatrixPresence[] : [];
      const index: Record<string, { id: string; present: boolean }> = {};
      for (const presence of presences) index[`${presence.alunoId}|${parseCivilDate(presence.data)}`] = { id: presence.id, present: presence.presente };
      setMatrixStudents(students);
      setMatrixPresences(index);
    } catch (error) {
      setMatrixError(error instanceof Error ? error.message : "Não foi possível carregar a visão mensal.");
    } finally {
      setMatrixLoading(false);
    }
  }, [monthlyCompetition]);

  useEffect(() => { if (mode === "monthly") void loadMatrix(); }, [loadMatrix, mode]);

  const totalMonthDays = useMemo(() => daysInMonth(monthlyCompetition), [monthlyCompetition]);
  const weeks = useMemo(() => {
    const result: number[][] = [];
    for (let start = 1; start <= totalMonthDays; start += 7) result.push(Array.from({ length: Math.min(7, totalMonthDays - start + 1) }, (_, index) => start + index));
    return result;
  }, [totalMonthDays]);
  const selectedWeek = weeks[Math.min(weekIndex, Math.max(weeks.length - 1, 0))] ?? [];

  useEffect(() => {
    setMonthlyReport(null);
    setWeekIndex(monthlyCompetition === today.slice(0, 7) ? Math.floor((Number(today.slice(8, 10)) - 1) / 7) : 0);
  }, [monthlyCompetition, today]);

  const filteredMatrixStudents = useMemo(() => {
    const query = monthlySearch.trim().toLocaleLowerCase("pt-BR");
    return query ? matrixStudents.filter((student) => student.nomeCompleto.toLocaleLowerCase("pt-BR").includes(query)) : matrixStudents;
  }, [matrixStudents, monthlySearch]);

  async function mutateAttendance(student: { id: string; modality: string }, date: string, attendanceId?: string) {
    setSavingStudent(`${student.id}|${date}`);
    setFeedback("");
    try {
      const response = attendanceId
        ? await fetch(`/api/presencas/${attendanceId}`, { method: "DELETE" })
        : await fetch("/api/presencas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alunoId: student.id, data: date, tipoAula: student.modality || "musculacao" }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível atualizar a presença.");
      setFeedback(attendanceId ? "Presença desfeita." : payload.created ? "Presença marcada." : "Presença já estava confirmada.");
      return attendanceId ? null : String(payload.item?.id ?? "");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível atualizar a presença.");
      throw error;
    } finally {
      setSavingStudent(null);
    }
  }

  async function toggleRosterAttendance(student: AttendanceStudent) {
    try { await mutateAttendance(student, operationalDate, student.attendance?.id); await loadRoster(); } catch { /* Live feedback already set. */ }
  }

  async function toggleMatrixAttendance(student: MatrixStudent, date: string) {
    const key = `${student.id}|${date}`;
    const existing = matrixPresences[key];
    try {
      const id = await mutateAttendance({ id: student.id, modality: student.modalidade?.nome ?? "musculacao" }, date, existing?.id);
      setMatrixPresences((current) => {
        const next = { ...current };
        if (existing?.id) delete next[key]; else if (id) next[key] = { id, present: true };
        return next;
      });
    } catch { /* Live feedback already set. */ }
  }

  function openRetroactive() { setRetroactiveOpen(true); setOperationalDate(addCivilDays(today, -1)); setRosterSearch(""); }
  function closeRetroactive() { setRetroactiveOpen(false); setOperationalDate(today); setRosterSearch(""); }

  return (
    <div className="min-w-0 space-y-4">
      <ModuleHeader title="Presença" description="Marque presenças em um clique, consulte o histórico e use a grade mensal apenas quando precisar." icon={CalendarCheck2} badges={["Hoje primeiro", "Registro diário", "Sem duplicidade"]} />

      <Card className="overflow-hidden p-0">
        <Tabs value={mode} onValueChange={(value) => setMode(value as AttendanceMode)}>
          <TabsList className="bg-bg/50 px-3 pt-2 sm:px-4">
            <TabsTrigger value="today"><UserRoundCheck className="mr-2 inline h-4 w-4" aria-hidden="true" />Hoje</TabsTrigger>
            <TabsTrigger value="history"><History className="mr-2 inline h-4 w-4" aria-hidden="true" />Histórico</TabsTrigger>
            <TabsTrigger value="monthly"><CalendarDays className="mr-2 inline h-4 w-4" aria-hidden="true" />Visão mensal</TabsTrigger>
          </TabsList>
          <div aria-live="polite" className="sr-only">{feedback}</div>

          <TabsContent value="today" className="space-y-4 p-4 md:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">{retroactiveOpen ? "Registrar presença retroativa" : "Hoje"}</p><h2 className="mt-1 text-xl font-black text-ink">{longDateLabel(operationalDate)}</h2><p className="mt-1 text-sm text-muted">Encontre o aluno e conclua o registro sem abrir formulários.</p></div>
              {canWrite && canRetroactive ? <Button variant={retroactiveOpen ? "ghost" : "outline"} leadingIcon={retroactiveOpen ? <RotateCcw className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />} onClick={retroactiveOpen ? closeRetroactive : openRetroactive}>{retroactiveOpen ? "Voltar para hoje" : "Outra data"}</Button> : null}
            </div>

            {retroactiveOpen ? (
              <div className="rounded-ds-lg border border-info/25 bg-infoSoft p-3">
                <label className="block max-w-xs text-label text-ink">Data retroativa<Input className="mt-1" type="date" max={addCivilDays(today, -1)} value={operationalDate} onChange={(event) => setOperationalDate(event.target.value)} /></label>
                <p className="mt-2 text-helper text-muted">Esse controle é exibido somente para quem possui permissão de lançamento retroativo.</p>
              </div>
            ) : null}

            {!retroactiveOpen && roster?.summary ? (
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-ds-lg border border-line bg-bg/55 p-3"><p className="text-helper font-semibold text-muted">Presentes hoje</p><p className="mt-1 text-2xl font-black text-ink">{roster.summary.presentStudents}</p></div>
                <div className="rounded-ds-lg border border-line bg-bg/55 p-3"><p className="text-helper font-semibold text-muted">Alunos ativos</p><p className="mt-1 text-2xl font-black text-ink">{roster.summary.activeStudents}</p></div>
                <div className="rounded-ds-lg border border-line bg-bg/55 p-3"><p className="text-helper font-semibold text-muted">Presença hoje</p><p className="mt-1 text-2xl font-black text-ink">{roster.summary.attendanceRate}%</p></div>
              </div>
            ) : null}

            <SearchField value={rosterSearch} onChange={(event) => setRosterSearch(event.target.value)} onClear={() => setRosterSearch("")} placeholder="Buscar por nome ou telefone" aria-label="Buscar aluno por nome ou telefone" />
            {feedback ? <p className="rounded-ds-md border border-line bg-bg px-3 py-2 text-sm font-semibold text-ink">{feedback}</p> : null}
            {rosterLoading ? <LoadingRows /> : rosterError ? <ErrorState message={rosterError} onRetry={() => void loadRoster()} /> : !roster?.items.length ? (
              <EmptyState kind={rosterSearch ? "search" : "empty"} title={rosterSearch ? "Nenhum aluno encontrado" : "Nenhum aluno ativo"} description={rosterSearch ? "Revise o nome ou telefone pesquisado." : "Os alunos ativos aparecerão aqui."} />
            ) : (
              <div className="space-y-2">
                {roster.items.map((student) => {
                  const saving = savingStudent === `${student.id}|${operationalDate}`;
                  return (
                    <article key={student.id} className="flex flex-col gap-3 rounded-ds-lg border border-line bg-card p-3 transition-colors hover:border-accent/30 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0"><h3 className="truncate text-base font-bold text-ink">{student.name}</h3><div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted"><span>{student.modality}</span><span aria-hidden="true">•</span><span>{student.phone}</span></div></div>
                      <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                        {student.attendance ? <Badge tone="success" className="py-1"><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />{retroactiveOpen ? "Presente" : "Presente hoje"}</Badge> : <span className="text-xs font-medium text-muted">Ainda não marcado</span>}
                        {canWrite ? <Button size="sm" variant={student.attendance ? "ghost" : "primary"} loading={saving} leadingIcon={student.attendance ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />} onClick={() => void toggleRosterAttendance(student)}>{student.attendance ? "Desfazer" : "Marcar presença"}</Button> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            {roster?.pagination ? <Pagination {...roster.pagination} disabled={rosterLoading} onPageChange={setRosterPage} /> : null}
          </TabsContent>

          <TabsContent value="history" className="space-y-4 p-4 md:p-5">
            <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">Consulta</p><h2 className="mt-1 text-xl font-black text-ink">Histórico de presenças</h2><p className="mt-1 text-sm text-muted">Consulte um período sem carregar todo o histórico de uma vez.</p></div>
            <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
              <label className="text-label text-ink">Período<MonthYearPicker value={historyCompetition} onChange={setHistoryCompetition} /></label>
              <label className="text-label text-ink">Aluno<SearchField className="mt-1" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} onClear={() => setHistorySearch("")} placeholder="Nome ou telefone" /></label>
            </div>
            {historyLoading ? <LoadingRows /> : historyError ? <ErrorState message={historyError} onRetry={() => void loadHistory()} /> : !history?.items.length ? <EmptyState kind={historySearch ? "search" : "empty"} title="Nenhuma presença no período" description="Altere o período ou revise a busca pelo aluno." /> : (
              <div className="overflow-hidden rounded-ds-lg border border-line">
                {history.items.map((item) => (
                  <article key={item.id} className="grid gap-2 border-b border-line/70 p-3 last:border-b-0 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-center">
                    <div><p className="font-bold text-ink">{civilDateLabel(item.date)}</p>{item.time ? <p className="text-helper text-muted">{item.time}</p> : null}</div>
                    <div className="min-w-0"><p className="truncate font-semibold text-ink">{item.student.name}</p><p className="truncate text-sm text-muted">{item.student.modality}</p></div>
                    <Badge tone="success" className="w-fit"><Check className="mr-1 h-3.5 w-3.5" />Presente</Badge>
                  </article>
                ))}
              </div>
            )}
            {history?.pagination ? <Pagination {...history.pagination} disabled={historyLoading} onPageChange={setHistoryPage} /> : null}
          </TabsContent>

          <TabsContent value="monthly" className="space-y-4 p-4 md:p-5">
            <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">Visualização secundária</p><h2 className="mt-1 text-xl font-black text-ink">Visão mensal</h2><p className="mt-1 text-sm text-muted">Navegue uma semana por vez. A rolagem horizontal fica contida apenas na grade.</p></div>
            <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-end">
              <label className="text-label text-ink">Competência<MonthYearPicker value={monthlyCompetition} onChange={setMonthlyCompetition} /></label>
              <label className="text-label text-ink">Aluno<SearchField className="mt-1" value={monthlySearch} onChange={(event) => setMonthlySearch(event.target.value)} onClear={() => setMonthlySearch("")} placeholder="Buscar aluno" /></label>
              <Button variant="outline" loading={reportLoading} onClick={async () => {
                setReportLoading(true);
                try { const response = await fetch(`/api/relatorios/frequencia?competencia=${monthlyCompetition}`, { cache: "no-store" }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error ?? "Não foi possível gerar o resumo."); setMonthlyReport(payload as MonthlyReport); }
                catch (error) { setFeedback(error instanceof Error ? error.message : "Não foi possível gerar o resumo."); }
                finally { setReportLoading(false); }
              }}>Resumo mensal</Button>
            </div>

            {matrixLoading ? <LoadingRows count={4} /> : matrixError ? <ErrorState message={matrixError} onRetry={() => void loadMatrix()} /> : !filteredMatrixStudents.length ? <EmptyState kind={monthlySearch ? "search" : "empty"} title="Nenhum aluno encontrado" /> : (
              <div className="max-w-full overflow-x-auto rounded-ds-lg border border-line" tabIndex={0} aria-label="Grade mensal de presença por semana">
                <table className="w-max min-w-full table-fixed border-0 bg-card">
                  <thead><tr><th className="sticky left-0 z-10 w-[160px] max-w-[160px] bg-bg px-3 py-2 text-left sm:w-[176px] sm:max-w-[176px]">Aluno</th>{selectedWeek.map((day) => <th key={day} className="w-11 bg-bg px-1 py-2 text-center"><span className="block text-xs font-bold">{day}</span><span className="block text-[10px] uppercase text-muted">{weekdayLabel(monthlyCompetition, day)}</span></th>)}</tr></thead>
                  <tbody>{filteredMatrixStudents.map((student) => (
                    <tr key={student.id} className="border-t border-line/70">
                      <td className="sticky left-0 z-[5] w-[160px] max-w-[160px] bg-card px-3 py-2 sm:w-[176px] sm:max-w-[176px]"><p className="truncate text-sm font-semibold text-ink" title={student.nomeCompleto}>{student.nomeCompleto}</p><p className="truncate text-[11px] text-muted">{student.modalidade?.nome ?? "Sem modalidade"}</p></td>
                      {selectedWeek.map((day) => {
                        const date = dayKey(monthlyCompetition, day); const key = `${student.id}|${date}`; const presence = matrixPresences[key];
                        const editable = canWrite && (compareCivilDates(date, today) === 0 || (compareCivilDates(date, today) < 0 && canRetroactive));
                        return <td key={date} className="w-11 px-1 py-2 text-center"><button type="button" aria-label={`${presence?.present ? "Desfazer" : "Marcar"} presença de ${student.nomeCompleto} em ${civilDateLabel(date)}`} disabled={!editable || savingStudent === key} onClick={() => void toggleMatrixAttendance(student, date)} className={presence?.present ? "inline-flex h-8 w-8 items-center justify-center rounded-ds-md bg-accent text-white transition hover:bg-accentDark disabled:opacity-50" : "inline-flex h-8 w-8 items-center justify-center rounded-ds-md border border-line bg-card text-muted transition hover:bg-accentSoft disabled:opacity-40"}>{presence?.present ? <Check className="h-4 w-4" /> : null}</button></td>;
                      })}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-helper font-semibold text-muted">Semana {Math.min(weekIndex + 1, weeks.length)} de {weeks.length} · dias {selectedWeek[0]}–{selectedWeek[selectedWeek.length - 1]}</p>
              <div className="flex gap-2"><Button size="sm" variant="outline" disabled={weekIndex <= 0} onClick={() => setWeekIndex((current) => Math.max(0, current - 1))}>Anterior</Button><Button size="sm" variant="outline" disabled={weekIndex >= weeks.length - 1} onClick={() => setWeekIndex((current) => Math.min(weeks.length - 1, current + 1))}>Próxima</Button></div>
            </div>

            {monthlyReport ? <div className="grid gap-3 rounded-ds-lg border border-line bg-bg/45 p-3 md:grid-cols-[180px_minmax(0,1fr)]"><div><p className="text-helper font-semibold text-muted">Presenças no mês</p><p className="mt-1 text-2xl font-black text-ink">{monthlyReport.totalPresencasMes}</p><p className="mt-2 text-helper text-muted">Baixa frequência: {monthlyReport.baixaFrequencia.length}</p></div><div><p className="mb-2 text-sm font-bold text-ink">Mais frequentes</p><div className="flex flex-wrap gap-2">{monthlyReport.ranking.slice(0, 5).map((item) => <Badge key={item.nome}>{item.nome} · {item.total}</Badge>)}</div></div></div> : null}
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
