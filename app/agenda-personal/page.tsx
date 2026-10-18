"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { CrudModule } from "@/components/forms/crud-module";
import { ModuleHeader } from "@/components/ui/module-header";
import { useHasCapability } from "@/components/capability-provider";
import { academyToday, compareCivilDates, parseCivilDate } from "@/lib/attendance-date";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

function currentWeekRef() {
  const date = new Date();
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = (utcDate.getUTCDay() + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - weekday + 3);

  const firstThursday = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 4));
  const firstWeekday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstWeekday + 3);

  const week = 1 + Math.round((utcDate.getTime() - firstThursday.getTime()) / 604800000);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

type ProfessorOption = {
  id: string;
  nome: string;
};

type AgendaItem = {
  id: string;
  professor: string;
  diaSemana: number;
  horario: string;
  horarioFim?: string | null;
  data?: string | null;
  duracaoMinutos?: number;
  legado?: boolean;
  compatibilidadeSegura?: boolean;
  alunoId?: string | null;
  alunoNome?: string | null;
  aluno?: {
    nomeCompleto?: string | null;
  } | null;
  observacao?: string | null;
  semanaRef?: string | null;
  tipoAula?: string | null;
};

const WEEK_DAYS = [
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" }
];

function normalizeHorario(raw: string) {
  const value = String(raw ?? "").trim();
  if (!value) return "";

  const match = /(\d{1,2})\D?(\d{2})?/.exec(value);
  if (!match) return value;

  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return value;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function toMinutes(value: string) {
  const normalized = normalizeHorario(value);
  const match = /^(\d{2}):(\d{2})$/.exec(normalized);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isoWeekMonday(weekRef: string) {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekRef);
  if (!match) return null;

  const year = Number(match[1]);
  const week = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) {
    return null;
  }

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Weekday = (jan4.getUTCDay() + 6) % 7; // Monday=0
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Weekday);

  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return monday;
}

function isoDateFromUtc(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

function normalizeHorarioValue(raw: string) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  const match = /^(\d{1,2})(?:[:hH]?(\d{2}))?$/.exec(value.replace(/\s+/g, ""));
  if (!match) return "";

  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "00");
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return "";
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatDayMonth(dateIso?: string) {
  if (!dateIso) return "";
  const [year, month, day] = dateIso.split("-");
  if (!year || !month || !day) return "";
  return `${day}/${month}`;
}

function presenceKey(alunoId: string, dateIso: string) {
  return `${alunoId}|${dateIso}`;
}

type AgendaPresencaItem = {
  id: string;
  alunoId: string;
  data: string;
  horario?: string | null;
  presente: boolean;
};

export default function AgendaPersonalPage() {
  const canRetroactive = useHasCapability("attendance.retroactive");
  const todayDate = academyToday();
  const [professores, setProfessores] = useState<ProfessorOption[]>([]);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [selectedProfessor, setSelectedProfessor] = useState("");
  const [loadingPainel, setLoadingPainel] = useState(false);
  const [savingPresencaKey, setSavingPresencaKey] = useState<string | null>(null);
  const [presencasAgenda, setPresencasAgenda] = useState<Record<string, { id: string; presente: boolean }>>({});
  const [weekRef] = useState(currentWeekRef());

  const weekDatesByDay = useMemo(() => {
    const monday = isoWeekMonday(weekRef);
    const map: Record<number, string> = {};
    if (!monday) return map;

    for (const day of WEEK_DAYS) {
      const date = new Date(monday);
      date.setUTCDate(monday.getUTCDate() + (day.value - 1));
      map[day.value] = isoDateFromUtc(date);
    }
    return map;
  }, [weekRef]);

  const weekMonths = useMemo(() => {
    const months = new Set<string>();
    for (const dateIso of Object.values(weekDatesByDay)) {
      if (dateIso) {
        months.add(dateIso.slice(0, 7));
      }
    }
    return Array.from(months);
  }, [weekDatesByDay]);

  async function loadWeekPresencas() {
    if (weekMonths.length === 0) {
      setPresencasAgenda({});
      return;
    }

    try {
      const responses = await Promise.all(
        weekMonths.map((month) => fetch(`/api/presencas?competencia=${month}`, { cache: "no-store" }))
      );
      const payloads = await Promise.all(
        responses.map(async (res) => {
          if (!res.ok) return { items: [] as AgendaPresencaItem[] };
          const data = (await res.json().catch(() => ({}))) as { items?: AgendaPresencaItem[] };
          return { items: Array.isArray(data.items) ? data.items : [] };
        })
      );

      const validDates = new Set(Object.values(weekDatesByDay));
      const next: Record<string, { id: string; presente: boolean }> = {};
      for (const payload of payloads) {
        for (const item of payload.items) {
          const dateIso = parseCivilDate(String(item.data ?? ""));
          if (!item.alunoId || !validDates.has(dateIso)) {
            continue;
          }
          next[presenceKey(item.alunoId, dateIso)] = { id: String(item.id), presente: Boolean(item.presente) };
        }
      }

      setPresencasAgenda(next);
    } catch {
      setPresencasAgenda({});
    }
  }

  async function refreshPainel() {
    setLoadingPainel(true);
    try {
      const [professoresRes, agendaRes] = await Promise.all([
        fetch("/api/professores-options", { cache: "no-store" }),
        fetch("/api/agenda-personal", { cache: "no-store" })
      ]);

      const professoresPayload = (await professoresRes.json().catch(() => ({}))) as { items?: ProfessorOption[] };
      const agendaPayload = (await agendaRes.json().catch(() => ({}))) as { items?: AgendaItem[] };

      const professoresList = Array.isArray(professoresPayload.items) ? professoresPayload.items : [];
      const agendaList = Array.isArray(agendaPayload.items) ? agendaPayload.items : [];
      const normalizedAgendaList = agendaList.map((item) => ({
        ...item,
        alunoNome: item.alunoNome?.trim() || item.aluno?.nomeCompleto?.trim() || ""
      }));

      setProfessores(professoresList);
      setAgendaItems(normalizedAgendaList);
      await loadWeekPresencas();

      if (!selectedProfessor && professoresList.length > 0) {
        setSelectedProfessor(professoresList[0].id);
      }
    } finally {
      setLoadingPainel(false);
    }
  }

  useEffect(() => {
    void refreshPainel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadWeekPresencas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekRef]);

  const agendaProfessor = useMemo(
    () =>
      agendaItems.filter(
        (item) => item.professor === selectedProfessor && item.data && Object.values(weekDatesByDay).includes(item.data)
      ),
    [agendaItems, selectedProfessor, weekDatesByDay]
  );

  const agendaByDay = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    for (const item of agendaProfessor) {
      const key = String(item.data ?? "");
      const current = map.get(key) ?? [];
      current.push(item);
      map.set(key, current);
    }
    for (const items of map.values()) items.sort((left, right) => toMinutes(left.horario) - toMinutes(right.horario));
    return map;
  }, [agendaProfessor]);

  async function marcarPresencaAgenda(item: AgendaItem) {
    const alunoId = String(item.alunoId ?? "").trim();
    if (!alunoId) {
      alert("Selecione um aluno cadastrado para registrar presença nesse horário.");
      return;
    }

    const dateIso = weekDatesByDay[item.diaSemana];
    const horario = normalizeHorarioValue(item.horario);
    if (!dateIso || !horario) {
      alert("Não foi possível identificar data/horário desta aula.");
      return;
    }
    const comparison = compareCivilDates(dateIso, todayDate);
    if (comparison > 0) {
      alert("Não é permitido registrar presença futura.");
      return;
    }
    if (comparison < 0 && !canRetroactive) {
      alert("Sem permissão para presença retroativa.");
      return;
    }

    const key = presenceKey(alunoId, dateIso);
    const existing = presencasAgenda[key];
    setSavingPresencaKey(key);
    try {
      if (existing?.presente) return;
      const res = await fetch("/api/presencas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alunoId,
          data: dateIso,
          horario,
          tipoAula: item.tipoAula ?? "personal",
          presente: true
        })
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; item?: { id?: string } };
      if (!res.ok) {
        alert(payload.error ?? "Não foi possível salvar presença.");
        return;
      }

      const id = String(payload.item?.id ?? "");
      if (!id) {
        await loadWeekPresencas();
        return;
      }

      setPresencasAgenda((prev) => ({
        ...prev,
        [key]: { id, presente: true }
      }));
    } finally {
      setSavingPresencaKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <ModuleHeader
        title="Agenda de Personal"
        description="Grade semanal por professor, com edição rápida e impressão."
        icon={CalendarClock}
        badges={["Visão semanal", "Professor por horário", "Aulas personal"]}
        stats={[
          { label: "Formato", value: "Segunda a sábado" },
          { label: "Uso", value: "Operação diária" }
        ]}
      />

      <Card className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] text-sm font-semibold text-ink">
            Professor
            <Select value={selectedProfessor} onChange={(event) => setSelectedProfessor(event.target.value)}>
              <option value="">Selecione</option>
              {professores.map((professor) => (
                <option key={professor.id} value={professor.id}>
                  {professor.nome}
                </option>
              ))}
            </Select>
          </label>

          <Button variant="secondary" onClick={() => void refreshPainel()}>
            Atualizar painel
          </Button>

          <span className="rounded-full border border-line bg-white/80 px-2.5 py-1 text-xs font-semibold text-muted">
            Semana atual: {weekRef}
          </span>
        </div>

        {!selectedProfessor ? (
          <p className="text-sm text-muted">Cadastre e selecione um professor para visualizar a agenda semanal.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {WEEK_DAYS.map((day) => {
              const dateIso = weekDatesByDay[day.value];
              const items = agendaByDay.get(dateIso) ?? [];
              return <section key={day.value} className="rounded-xl border border-line/80 bg-white/80 p-3">
                <h3 className="font-bold text-ink">{day.label} <span className="text-xs font-medium text-muted">{formatDayMonth(dateIso)}</span></h3>
                {loadingPainel ? <p className="mt-3 text-sm text-muted">Carregando...</p> : items.length === 0 ? <p className="mt-3 text-sm text-muted">Sem agendamentos.</p> : <div className="mt-3 space-y-2">{items.map((item) => {
                  const alunoId = String(item.alunoId ?? "").trim();
                  const key = alunoId && dateIso ? presenceKey(alunoId, dateIso) : "";
                  const present = key ? presencasAgenda[key]?.presente : false;
                  const saving = key ? savingPresencaKey === key : false;
                  return <article key={item.id} className="rounded-ds-lg border border-line bg-card p-3 text-sm shadow-surface-sm">
                    <div className="flex items-start justify-between gap-2"><div><p className="font-black text-ink">{item.horario}–{item.horarioFim}</p><p className="font-semibold text-ink">{item.alunoNome?.trim() || item.aluno?.nomeCompleto || "Cliente"}</p></div><span className="text-xs font-semibold text-muted">{item.duracaoMinutos} min</span></div>
                    <p className="mt-1 text-xs text-muted">Personal: {item.professor}{item.legado ? " · registro legado" : ""}</p>
                    {item.compatibilidadeSegura === false ? <p className="mt-1 text-xs font-semibold text-danger">Horário legado preservado; revise antes de editar.</p> : null}
                    {item.observacao ? <p className="mt-1 text-xs text-muted">{item.observacao}</p> : null}
                    <button type="button" disabled={!alunoId || saving || present} onClick={() => void marcarPresencaAgenda(item)} className="mt-2 rounded-md border border-line bg-white px-2 py-1 text-xs font-semibold text-ink disabled:opacity-50">{present ? "Presença confirmada" : saving ? "Salvando..." : "Confirmar presença"}</button>
                  </article>;
                })}</div>}
              </section>;
            })}
          </div>
        )}
      </Card>

      <CrudModule
        endpoint="/api/agenda-personal"
        title="Agenda semanal"
        createLabel="Novo horário"
        onDataChanged={() => refreshPainel()}
        listFields={[
          { key: "professor", label: "Professor" },
          { key: "data", label: "Data" },
          { key: "horario", label: "Início" },
          { key: "horarioFim", label: "Fim" },
          { key: "duracaoMinutos", label: "Duração (min)" },
          { key: "alunoNome", label: "Aluno" },
          { key: "observacao", label: "Observação" }
        ]}
        fields={[
          { key: "professor", label: "Personal", required: true },
          { key: "data", label: "Data", type: "date", required: true },
          { key: "horario", label: "Início", type: "time", required: true },
          { key: "horarioFim", label: "Fim", type: "time", required: true },
          { key: "duracaoCalculada", label: "Duração calculada", derivedTimeDuration: { startKey: "horario", endKey: "horarioFim" } },
          { key: "alunoId", label: "Aluno", lookupEndpoint: "/api/alunos?matriculaAtiva=true" },
          { key: "alunoNome", label: "Aluno (texto livre)" },
          { key: "observacao", label: "Observação", type: "textarea" }
        ]}
        defaultValues={{ data: todayDate, tipoAula: "personal", ativo: "true" }}
        createCapability="schedule.write"
        updateCapability="schedule.write"
        deleteCapability="schedule.write"
      />

      <CrudModule
        endpoint="/api/professores"
        title="Cadastro de professores"
        createLabel="Novo professor"
        onDataChanged={() => refreshPainel()}
        searchPlaceholder="Buscar professor"
        listFields={[
          { key: "nome", label: "Professor" },
          { key: "updatedAt", label: "Atualizado em" }
        ]}
        fields={[
          { key: "nome", label: "Nome do professor", required: true }
        ]}
        createCapability="schedule.write"
        updateCapability="schedule.write"
        deleteCapability="schedule.write"
      />
    </div>
  );
}
