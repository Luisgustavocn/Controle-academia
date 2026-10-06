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

function defaultSlots() {
  const slots: string[] = [];
  const pushRange = (startHour: number, endHour: number) => {
    for (let minutes = startHour * 60; minutes <= endHour * 60; minutes += 60) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;
      slots.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  };

  pushRange(6, 10);
  pushRange(15, 21);
  return slots;
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

function isHorarioAtendimento(value: string) {
  const normalized = normalizeHorarioValue(value);
  if (!normalized) return false;
  const [hourRaw, minuteRaw] = normalized.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
  if (minute !== 0) return false;
  const total = hour * 60 + minute;

  const morning = total >= 6 * 60 && total <= 10 * 60;
  const afternoon = total >= 15 * 60 && total <= 21 * 60;
  return morning || afternoon;
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
  const [updatingHorarioId, setUpdatingHorarioId] = useState<string | null>(null);
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
        (item) => item.professor === selectedProfessor && (!item.semanaRef || item.semanaRef === weekRef)
      ),
    [agendaItems, selectedProfessor, weekRef]
  );

  const slots = useMemo(() => {
    const fromAgenda = agendaProfessor.map((item) => normalizeHorario(item.horario)).filter(Boolean);
    return Array.from(new Set([...defaultSlots(), ...fromAgenda])).sort((a, b) => toMinutes(a) - toMinutes(b));
  }, [agendaProfessor]);

  const occupancy = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    for (const item of agendaProfessor) {
      const key = `${item.diaSemana}-${normalizeHorario(item.horario)}`;
      const current = map.get(key) ?? [];
      current.push(item);
      map.set(key, current);
    }
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

  async function ajustarHorarioSemana(item: AgendaItem) {
    const atual = normalizeHorarioValue(item.horario);
    const novoRaw = window.prompt("Novo horário desta semana (HH:mm):", atual || "");
    if (novoRaw === null) return;

    const novo = normalizeHorarioValue(novoRaw);
    if (!novo) {
      alert("Horário inválido. Use HH:mm.");
      return;
    }
    if (!isHorarioAtendimento(novo)) {
      alert("Use somente horas cheias entre 06:00-10:00 ou 15:00-21:00.");
      return;
    }
    if (novo === atual) {
      return;
    }

    setUpdatingHorarioId(item.id);
    try {
      const res = await fetch(`/api/agenda-personal/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horario: novo, semanaRef: weekRef })
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(payload.error ?? "Não foi possível ajustar horário.");
        return;
      }

      await refreshPainel();
    } finally {
      setUpdatingHorarioId(null);
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
          <div className="overflow-x-auto rounded-xl border border-line/80 bg-white/80">
            <table className="min-w-[980px]">
              <thead>
                <tr>
                  <th className="min-w-[110px]">Horário</th>
                  {WEEK_DAYS.map((day) => (
                    <th key={day.value}>
                      <div>{day.label}</div>
                      <div className="text-[11px] font-medium text-muted">{formatDayMonth(weekDatesByDay[day.value])}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingPainel ? (
                  <tr>
                    <td colSpan={WEEK_DAYS.length + 1}>Carregando painel semanal...</td>
                  </tr>
                ) : (
                  slots.map((slot) => (
                    <tr key={slot}>
                      <td className="font-semibold text-ink">{slot}</td>
                      {WEEK_DAYS.map((day) => {
                        const key = `${day.value}-${slot}`;
                        const itens = occupancy.get(key) ?? [];
                        const ocupado = itens.length > 0;

                        return (
                          <td key={key} className={ocupado ? "bg-[#fff0f2]" : "bg-[#f7faf8]"}>
                            {ocupado ? (
                              <div className="space-y-1">
                                {itens.map((item) => (
                                  <div key={item.id} className="rounded-md border border-[rgba(207,22,33,0.2)] bg-white px-2 py-1 text-xs">
                                    <strong>{item.alunoNome?.trim() || "Ocupado"}</strong>
                                    {(() => {
                                      const alunoId = String(item.alunoId ?? "").trim();
                                      const dateIso = weekDatesByDay[item.diaSemana];
                                      const key = alunoId && dateIso ? presenceKey(alunoId, dateIso) : "";
                                      const status = key ? presencasAgenda[key] : undefined;
                                      const saving = key ? savingPresencaKey === key : false;
                                      const isFoi = Boolean(status?.presente);

                                      return (
                                        <div className="mt-1 space-y-1">
                                          <div className="text-[11px] text-muted">
                                            {isFoi ? "Presença diária confirmada" : "Presença: sem marcação"}
                                          </div>
                                          <div className="flex flex-wrap gap-1">
                                            <button
                                              type="button"
                                              disabled={!alunoId || saving}
                                              onClick={() => void marcarPresencaAgenda(item)}
                                              className={
                                                isFoi
                                                  ? "rounded-md border border-[rgba(34,136,83,0.28)] bg-[#1f6d44] px-2 py-0.5 text-[10px] font-semibold text-white disabled:opacity-50"
                                                  : "rounded-md border border-line bg-white px-2 py-0.5 text-[10px] font-semibold text-ink disabled:opacity-50"
                                              }
                                            >
                                              {saving && isFoi ? "..." : "Foi"}
                                            </button>
                                            <button
                                              type="button"
                                              disabled={updatingHorarioId === item.id}
                                              onClick={() => void ajustarHorarioSemana(item)}
                                              className="rounded-md border border-line bg-white px-2 py-0.5 text-[10px] font-semibold text-ink transition hover:bg-accentSoft disabled:opacity-50"
                                            >
                                              {updatingHorarioId === item.id ? "..." : "Horário semana"}
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                    {item.observacao ? <div className="text-muted">{item.observacao}</div> : null}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs font-medium text-[#5e6b61]">Vago</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
          { key: "diaSemana", label: "Dia" },
          { key: "horario", label: "Horário" },
          { key: "alunoNome", label: "Aluno" },
          { key: "observacao", label: "Observação" }
        ]}
        fields={[
          { key: "professor", label: "Professor", required: true },
          {
            key: "diaSemana",
            label: "Dia da semana",
            type: "multi-select",
            required: true,
            options: [
              { label: "Segunda-feira", value: "1" },
              { label: "Terça-feira", value: "2" },
              { label: "Quarta-feira", value: "3" },
              { label: "Quinta-feira", value: "4" },
              { label: "Sexta-feira", value: "5" },
              { label: "Sábado", value: "6" }
            ]
          },
          {
            key: "horario",
            label: "Horário",
            type: "select",
            required: true,
            options: defaultSlots().map((slot) => ({ label: slot, value: slot }))
          },
          { key: "alunoId", label: "Aluno", lookupEndpoint: "/api/alunos?matriculaAtiva=true" },
          { key: "alunoNome", label: "Aluno (texto livre)" },
          { key: "observacao", label: "Observação", type: "textarea" }
        ]}
        defaultValues={{ semanaRef: weekRef, tipoAula: "personal", ativo: "true" }}
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
