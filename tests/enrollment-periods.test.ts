import assert from "node:assert/strict";
import test from "node:test";
import { enrollmentCoversCompetence } from "../lib/services/enrollment-periods";
import { financialStatusFromOpenCount } from "../lib/services/student-profile";

test("enrollment competence uses exit as the last active civil day", () => {
  const period = { dataInicio: new Date("2026-07-05T00:00:00.000Z"), dataSaida: new Date("2026-09-30T00:00:00.000Z") };
  assert.equal(enrollmentCoversCompetence(period, "2026-07"), true);
  assert.equal(enrollmentCoversCompetence(period, "2026-09"), true);
  assert.equal(enrollmentCoversCompetence(period, "2026-10"), false);
});

test("unknown historical start remains explicit without blocking current competence", () => {
  assert.equal(enrollmentCoversCompetence({ dataInicio: null, dataSaida: null }, "2026-10"), true);
});

test("financial labels separate active enrollment from historical debt", () => {
  assert.equal(financialStatusFromOpenCount(0, true), "EM_DIA");
  assert.equal(financialStatusFromOpenCount(1, true), "EM_ATRASO");
  assert.equal(financialStatusFromOpenCount(1, true, 1), "PARCIAL");
  assert.equal(financialStatusFromOpenCount(0, false), "SEM_PENDENCIAS");
  assert.equal(financialStatusFromOpenCount(1, false), "COM_PENDENCIA");
});
