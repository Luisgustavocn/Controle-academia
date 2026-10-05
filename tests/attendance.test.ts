import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import {
  academyToday,
  addCivilDays,
  civilDateLabel,
  civilDateToPrisma,
  civilMonthRange,
  isCivilDate,
  parseCivilDate,
  prismaDateToCivil,
  relativeCivilDateLabel
} from "../lib/attendance-date";
import {
  assertAttendanceDateAllowed,
  AttendancePermissionError,
  AttendanceValidationError,
  normalizeAttendanceTime
} from "../lib/services/attendance";
import { evaluateAttendancePreflight } from "../lib/services/attendance-preflight";

test("civil dates validate calendar values and round-trip without timezone drift", () => {
  assert.equal(isCivilDate("2026-10-05"), true);
  assert.equal(isCivilDate("2026-02-29"), false);
  assert.equal(isCivilDate("2024-02-29"), true);
  assert.equal(isCivilDate("05/10/2026"), false);
  assert.throws(() => parseCivilDate("2026-13-01"));
  assert.equal(prismaDateToCivil(civilDateToPrisma("2026-10-05")), "2026-10-05");
  assert.equal(civilDateLabel("2026-10-05"), "05/10/2026");
});

test("academy civil day handles midnight, 00:30, 23:30 and calendar boundaries", () => {
  assert.equal(academyToday(new Date("2026-10-05T02:59:59.000Z")), "2026-10-04"); // 23:59:59
  assert.equal(academyToday(new Date("2026-10-05T03:00:00.000Z")), "2026-10-05"); // 00:00
  assert.equal(academyToday(new Date("2026-10-05T03:30:00.000Z")), "2026-10-05"); // 00:30
  assert.equal(academyToday(new Date("2026-11-01T02:30:00.000Z")), "2026-10-31"); // 23:30 and month boundary
  assert.equal(academyToday(new Date("2027-01-01T02:30:00.000Z")), "2026-12-31"); // year boundary
  assert.equal(addCivilDays("2026-12-31", 1), "2027-01-01");
});

test("civil month ranges and relative labels never reinterpret DATE in Sao Paulo", () => {
  const range = civilMonthRange("2026-10");
  assert.equal(prismaDateToCivil(range.start), "2026-10-01");
  assert.equal(prismaDateToCivil(range.end), "2026-11-01");
  const reference = new Date("2026-10-05T15:00:00.000Z");
  assert.equal(relativeCivilDateLabel("2026-10-05", reference), "Hoje");
  assert.equal(relativeCivilDateLabel("2026-10-04", reference), "Ontem");
  assert.equal(relativeCivilDateLabel("2026-10-03", reference), "03/10/2026");
});

test("attendance authorization permits today, gates retroactive and rejects future", () => {
  const reference = new Date("2026-10-05T15:00:00.000Z");
  assert.doesNotThrow(() => assertAttendanceDateAllowed(UserRole.RECEPCAO, "2026-10-05", reference));
  assert.throws(
    () => assertAttendanceDateAllowed(UserRole.RECEPCAO, "2026-10-04", reference),
    AttendancePermissionError
  );
  assert.doesNotThrow(() => assertAttendanceDateAllowed(UserRole.ADMIN, "2026-10-04", reference));
  assert.throws(
    () => assertAttendanceDateAllowed(UserRole.ADMIN, "2026-10-06", reference),
    AttendanceValidationError
  );
});

test("attendance time is optional but strict when provided", () => {
  assert.equal(normalizeAttendanceTime(null), null);
  assert.equal(normalizeAttendanceTime(""), null);
  assert.equal(normalizeAttendanceTime(" 07:05 "), "07:05");
  assert.throws(() => normalizeAttendanceTime("24:00"), AttendanceValidationError);
  assert.throws(() => normalizeAttendanceTime("7:05"), AttendanceValidationError);
});

test("migration preflight reports every manual-review blocker", () => {
  const safe = evaluateAttendancePreflight({
    total: 1n,
    duplicateGroups: 0n,
    falseRecords: 0n,
    emptyTimes: 1n,
    nullTimes: 0n,
    nonMidnightDates: 0n
  });
  assert.equal(safe.safe, true);
  assert.equal(safe.emptyTimes, 1);

  const blocked = evaluateAttendancePreflight({
    total: 4n,
    duplicateGroups: 1n,
    falseRecords: 1n,
    emptyTimes: 0n,
    nullTimes: 2n,
    nonMidnightDates: 1n
  });
  assert.equal(blocked.safe, false);
  assert.equal(blocked.blockers.length, 3);
});
