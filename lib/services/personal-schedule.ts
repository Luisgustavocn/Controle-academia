import { Prisma } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { civilDateToPrisma, parseCivilDate, prismaDateToCivil } from "@/lib/attendance-date";
import { prisma } from "@/lib/prisma";
import { isStudentActiveOnDate } from "@/lib/services/enrollment-periods";

export class PersonalScheduleError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export type ScheduleInterval = { id: string; professor: string; date: string; start: string; end: string; active?: boolean };

export function normalizeScheduleTime(value: unknown, field: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) throw new PersonalScheduleError(`${field} inválido. Use HH:mm`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new PersonalScheduleError(`${field} inválido. Use HH:mm`);
  return `${match[1]}:${match[2]}`;
}

export function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function validateScheduleInterval(startInput: unknown, endInput: unknown) {
  const start = normalizeScheduleTime(startInput, "Horário inicial");
  const end = normalizeScheduleTime(endInput, "Horário final");
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (endMinutes <= startMinutes) {
    throw new PersonalScheduleError("O horário final deve ser posterior ao inicial; agendamentos não podem atravessar a meia-noite");
  }
  return { start, end, startMinutes, endMinutes, durationMinutes: endMinutes - startMinutes };
}

export function intervalsOverlap(left: Pick<ScheduleInterval, "start" | "end">, right: Pick<ScheduleInterval, "start" | "end">) {
  return timeToMinutes(left.start) < timeToMinutes(right.end) && timeToMinutes(left.end) > timeToMinutes(right.start);
}

export function findScheduleConflict(interval: ScheduleInterval, existing: ScheduleInterval[], ignoreId?: string) {
  return existing.find((item) => item.id !== ignoreId && item.active !== false && item.professor === interval.professor && item.date === interval.date && intervalsOverlap(interval, item));
}

export function isoWeekAndDay(dateKey: string) {
  const date = civilDateToPrisma(dateKey);
  const day = date.getUTCDay() || 7;
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((thursday.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return { diaSemana: day, semanaRef: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}` };
}

export function legacyScheduleDate(weekRef: string, day: number) {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekRef);
  if (!match || day < 1 || day > 7) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7 + day - 1);
  return prismaDateToCivil(monday);
}

export function serializeScheduleRecord(record: {
  id: string; professor: string; data: Date | null; semanaRef: string; diaSemana: number;
  horario: string; horarioFim: string | null; ativo: boolean; [key: string]: unknown;
}) {
  const date = record.data ? prismaDateToCivil(record.data) : legacyScheduleDate(record.semanaRef, record.diaSemana);
  let start: string;
  try {
    start = normalizeScheduleTime(record.horario, "Horário inicial");
  } catch {
    return {
      ...record,
      data: date,
      duracaoMinutos: 0,
      legado: true,
      compatibilidadeSegura: false
    };
  }
  const legacyEndMinutes = timeToMinutes(start) + 60;
  const end = record.horarioFim ?? `${String(Math.floor(legacyEndMinutes / 60)).padStart(2, "0")}:${String(legacyEndMinutes % 60).padStart(2, "0")}`;
  return {
    ...record,
    data: date,
    horario: start,
    horarioFim: end,
    duracaoMinutos: Math.max(0, timeToMinutes(end) - timeToMinutes(start)),
    legado: record.data === null || record.horarioFim === null,
    compatibilidadeSegura: Boolean(date) && legacyEndMinutes <= 24 * 60
  };
}

export type ScheduleInput = {
  professor: unknown; data: unknown; horario: unknown; horarioFim: unknown; alunoId?: unknown;
  alunoNome?: unknown; tipoAula?: unknown; observacao?: unknown; ativo?: unknown;
};

function booleanValue(value: unknown, fallback: boolean) {
  if (value === undefined) return fallback;
  return value === true || value === "true" || value === "1";
}

async function validateReferences(tx: Prisma.TransactionClient, professor: string, alunoId: string | null, date: string) {
  const configured = await tx.configuracao.findFirst({
    where: { chave: { startsWith: "professor:" }, valor: { equals: professor, mode: Prisma.QueryMode.insensitive } },
    select: { valor: true }
  });
  if (!configured) throw new PersonalScheduleError("Selecione um personal cadastrado");
  if (alunoId && !await isStudentActiveOnDate(tx, alunoId, date)) {
    throw new PersonalScheduleError("Aluno sem matrícula ativa na data não pode receber agendamento");
  }
  return configured.valor;
}

async function lockScheduleKeys(tx: Prisma.TransactionClient, keys: string[]) {
  for (const key of [...new Set(keys)].sort()) {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }
}

async function assertNoConflict(tx: Prisma.TransactionClient, interval: ScheduleInterval, week: { semanaRef: string; diaSemana: number }, ignoreId?: string) {
  const records = await tx.agendaPersonal.findMany({
    where: {
      professor: interval.professor,
      ativo: true,
      ...(ignoreId ? { id: { not: ignoreId } } : {}),
      OR: [{ data: civilDateToPrisma(interval.date) }, { data: null, semanaRef: week.semanaRef, diaSemana: week.diaSemana }]
    }
  });
  const existing = records.flatMap((record) => {
    const serialized = serializeScheduleRecord(record);
    return serialized.data && serialized.compatibilidadeSegura && typeof serialized.horarioFim === "string"
      ? [{ id: record.id, professor: record.professor, date: serialized.data, start: serialized.horario, end: serialized.horarioFim, active: record.ativo }]
      : [];
  });
  if (findScheduleConflict(interval, existing, ignoreId)) throw new PersonalScheduleError("Conflito de horário para este personal", 409);
}

function normalizedInput(input: ScheduleInput, previous?: { professor: string; data: Date | null; semanaRef: string; diaSemana: number; horario: string; horarioFim: string | null; alunoId: string | null; alunoNome: string | null; tipoAula: string; observacao: string | null; ativo: boolean }) {
  const professor = String(input.professor ?? previous?.professor ?? "").trim();
  if (!professor) throw new PersonalScheduleError("Personal é obrigatório");
  let date: string;
  try {
    date = parseCivilDate(input.data ?? (previous?.data ? prismaDateToCivil(previous.data) : legacyScheduleDate(previous?.semanaRef ?? "", previous?.diaSemana ?? 0)));
  } catch {
    throw new PersonalScheduleError("Data inválida. Use YYYY-MM-DD");
  }
  const interval = validateScheduleInterval(input.horario ?? previous?.horario, input.horarioFim ?? previous?.horarioFim);
  const alunoId = String(input.alunoId ?? previous?.alunoId ?? "").trim() || null;
  const alunoNome = String(input.alunoNome ?? previous?.alunoNome ?? "").trim() || null;
  if (!alunoId && !alunoNome) throw new PersonalScheduleError("Selecione um aluno ou informe o nome do cliente");
  return { professor, date, ...interval, alunoId, alunoNome, tipoAula: String(input.tipoAula ?? previous?.tipoAula ?? "personal").trim() || "personal", observacao: String(input.observacao ?? previous?.observacao ?? "").trim() || null, ativo: booleanValue(input.ativo, previous?.ativo ?? true) };
}

export async function createPersonalSchedule(input: ScheduleInput, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const parsed = normalizedInput(input);
    const professor = await validateReferences(tx, parsed.professor, parsed.alunoId, parsed.date);
    const week = isoWeekAndDay(parsed.date);
    await lockScheduleKeys(tx, [`${professor}\u0000${parsed.date}`]);
    if (parsed.ativo) await assertNoConflict(tx, { id: "new", professor, date: parsed.date, start: parsed.start, end: parsed.end }, week);
    const created = await tx.agendaPersonal.create({ data: { professor, data: civilDateToPrisma(parsed.date), horario: parsed.start, horarioFim: parsed.end, diaSemana: week.diaSemana, semanaRef: week.semanaRef, alunoId: parsed.alunoId, alunoNome: parsed.alunoNome, tipoAula: parsed.tipoAula, observacao: parsed.observacao, ativo: parsed.ativo } });
    await logAudit({ userId: actorId, modulo: "agenda-personal", entidade: "AgendaPersonal", entidadeId: created.id, acao: "CREATE", depois: created }, tx);
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updatePersonalSchedule(id: string, input: Partial<ScheduleInput>, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const previous = await tx.agendaPersonal.findUnique({ where: { id } });
    if (!previous) throw new PersonalScheduleError("Agendamento não encontrado", 404);
    const parsed = normalizedInput(input as ScheduleInput, previous);
    const professor = await validateReferences(tx, parsed.professor, parsed.alunoId, parsed.date);
    const oldDate = previous.data ? prismaDateToCivil(previous.data) : legacyScheduleDate(previous.semanaRef, previous.diaSemana);
    const week = isoWeekAndDay(parsed.date);
    await lockScheduleKeys(tx, [`${previous.professor}\u0000${oldDate ?? "legacy"}`, `${professor}\u0000${parsed.date}`]);
    if (parsed.ativo) await assertNoConflict(tx, { id, professor, date: parsed.date, start: parsed.start, end: parsed.end }, week, id);
    const updated = await tx.agendaPersonal.update({ where: { id }, data: { professor, data: civilDateToPrisma(parsed.date), horario: parsed.start, horarioFim: parsed.end, diaSemana: week.diaSemana, semanaRef: week.semanaRef, alunoId: parsed.alunoId, alunoNome: parsed.alunoNome, tipoAula: parsed.tipoAula, observacao: parsed.observacao, ativo: parsed.ativo } });
    await logAudit({ userId: actorId, modulo: "agenda-personal", entidade: "AgendaPersonal", entidadeId: id, acao: "UPDATE", antes: previous, depois: updated }, tx);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
