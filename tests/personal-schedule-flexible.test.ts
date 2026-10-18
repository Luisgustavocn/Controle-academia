import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  findScheduleConflict,
  intervalsOverlap,
  isoWeekAndDay,
  legacyScheduleDate,
  serializeScheduleRecord,
  validateScheduleInterval
} from "../lib/services/personal-schedule";

test("accepts flexible intervals and arbitrary minutes", () => {
  for (const [start, end, duration] of [["05:20", "06:10", 50], ["08:35", "09:25", 50], ["22:15", "23:00", 45]]) {
    assert.equal(validateScheduleInterval(start, end).durationMinutes, duration);
  }
});

test("rejects equal, reversed, invalid and overnight intervals", () => {
  assert.throws(() => validateScheduleInterval("08:00", "08:00"), /posterior/);
  assert.throws(() => validateScheduleInterval("09:00", "08:00"), /posterior/);
  assert.throws(() => validateScheduleInterval("23:30", "00:30"), /meia-noite/);
  assert.throws(() => validateScheduleInterval("8:00", "09:00"), /HH:mm/);
});

const existing = { id: "existing", professor: "Carlos", date: "2026-10-18", start: "08:00", end: "09:00", active: true };

test("detects every overlap shape for the same personal and date", () => {
  for (const [start, end] of [["07:50", "08:10"], ["08:30", "09:30"], ["07:30", "09:30"], ["08:15", "08:45"]]) {
    assert.equal(Boolean(findScheduleConflict({ id: "new", professor: "Carlos", date: "2026-10-18", start, end }, [existing])), true);
  }
});

test("allows consecutive appointments and equal intervals for different personals", () => {
  assert.equal(intervalsOverlap({ start: "07:00", end: "08:00" }, existing), false);
  assert.equal(intervalsOverlap({ start: "09:00", end: "10:00" }, existing), false);
  assert.equal(findScheduleConflict({ id: "new", professor: "Maria", date: "2026-10-18", start: "08:00", end: "09:00" }, [existing]), undefined);
  assert.equal(findScheduleConflict({ id: "new", professor: "Carlos", date: "2026-10-18", start: "08:00", end: "09:00" }, [{ ...existing, active: false }]), undefined);
});

test("editing ignores itself but still detects another record", () => {
  const other = { ...existing, id: "other", start: "09:00", end: "10:00" };
  assert.equal(findScheduleConflict(existing, [existing], "existing"), undefined);
  assert.equal(findScheduleConflict({ ...existing, start: "09:15", end: "09:45" }, [existing, other], "existing")?.id, "other");
});

test("legacy records remain readable as one hour without persistence", () => {
  const record = {
    id: "legacy", professor: "Carlos", data: null, semanaRef: "2026-W42", diaSemana: 7,
    horario: "08:35", horarioFim: null, ativo: true, alunoId: null
  };
  const serialized = serializeScheduleRecord(record);
  assert.equal(serialized.data, legacyScheduleDate("2026-W42", 7));
  assert.equal(serialized.horarioFim, "09:35");
  assert.equal(serialized.duracaoMinutos, 60);
  assert.equal(serialized.legado, true);
  assert.equal(record.horarioFim, null);
  assert.equal(record.data, null);

  const unsafe = serializeScheduleRecord({ ...record, id: "unsafe", horario: "23:30" });
  assert.equal(unsafe.compatibilidadeSegura, false);
  assert.equal(unsafe.horarioFim, "24:30");

  const invalid = serializeScheduleRecord({ ...record, id: "invalid", horario: "legado" });
  assert.equal(invalid.compatibilidadeSegura, false);
  assert.equal(invalid.horario, "legado");
});

test("civil date derives compatibility week and weekday without timezone shift", () => {
  assert.deepEqual(isoWeekAndDay("2026-10-18"), { diaSemana: 7, semanaRef: "2026-W42" });
  assert.equal(legacyScheduleDate("2026-W42", 7), "2026-10-18");
});

test("backend and frontend no longer enforce fixed slots", () => {
  const service = readFileSync("lib/services/personal-schedule.ts", "utf8");
  const page = readFileSync("app/agenda-personal/page.tsx", "utf8");
  assert.doesNotMatch(service, /06:00-10:00|15:00-21:00|minute !== 0/);
  assert.doesNotMatch(page, /defaultSlots|isHorarioAtendimento/);
  assert.match(page, /type: "time"/);
  assert.match(page, /duracaoMinutos/);
  assert.match(page, /derivedTimeDuration/);
});

test("dedicated APIs preserve capabilities and validate in a transaction", () => {
  const collection = readFileSync("app/api/agenda-personal/route.ts", "utf8");
  const item = readFileSync("app/api/agenda-personal/[id]/route.ts", "utf8");
  const service = readFileSync("lib/services/personal-schedule.ts", "utf8");
  assert.match(collection, /requireCapability\(request, "schedule\.read"\)/);
  assert.match(collection, /requireCapability\(request, "schedule\.write"\)/);
  assert.match(item, /requireCapability\(request, "schedule\.write"\)/);
  assert.match(service, /\$transaction/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /hashtextextended/);
  assert.match(service, /TransactionIsolationLevel\.Serializable/);
  assert.match(service, /id: \{ not: ignoreId \}/);
});

test("migration is additive and does not rewrite existing schedules", () => {
  const sql = readFileSync("prisma/migrations/0009_flexible_personal_schedule/migration.sql", "utf8");
  assert.match(sql, /ADD COLUMN "data" DATE/);
  assert.match(sql, /ADD COLUMN "horarioFim" TEXT/);
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE|INSERT|TRUNCATE)\b/i);
});
