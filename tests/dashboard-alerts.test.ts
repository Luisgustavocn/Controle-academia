import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AlunoStatus, MensalidadeStatus, PagamentoStatus } from "@prisma/client";
import { buildAbsenceAlerts, buildOverdueFeeAlerts } from "../lib/services/dashboard-alerts";

const today = "2026-10-18";
const civil = (value: string) => new Date(`${value}T00:00:00.000Z`);

function monthly(overrides: Record<string, unknown> = {}) {
  return {
    id: "fee-1",
    alunoId: "student-1",
    competencia: "2026-10",
    valor: 100,
    valorFinal: null,
    vencimento: civil("2026-10-13"),
    status: MensalidadeStatus.ATRASADO,
    pagamentos: [],
    aluno: { nomeCompleto: "Ana" },
    ...overrides
  };
}

function student(overrides: Record<string, unknown> = {}) {
  return {
    id: "student-1",
    nomeCompleto: "Ana",
    fotoPath: null,
    status: AlunoStatus.ATIVO,
    presencas: [{ data: civil("2026-10-11") }],
    periodosMatricula: [{ dataInicio: civil("2026-10-01"), dataSaida: null }],
    ...overrides
  };
}

test("yesterday presence is counted as distinct students with civil boundaries", () => {
  const service = readFileSync("lib/services/dashboard.ts", "utf8");
  assert.match(service, /attendanceYesterday = civilDateToPrisma\(addCivilDays\(context\.dateKey, -1\)\)/);
  assert.match(service, /prisma\.presenca\.groupBy\(\{\s*by: \["alunoId"\],[\s\S]*data: attendanceYesterday/);
  assert.doesNotMatch(service, /data: attendanceYesterday[\s\S]{0,80}\.count/);
});

test("attendance query separates today from yesterday", () => {
  const service = readFileSync("lib/services/dashboard.ts", "utf8");
  assert.match(service, /data: attendanceToday/);
  assert.match(service, /data: attendanceYesterday/);
  assert.match(service, /attendancesYesterday: source\.attendancesYesterday \?\? 0/);
});

test("fee with four overdue days does not alert and exact five or ten days does", () => {
  assert.equal(buildOverdueFeeAlerts([monthly({ vencimento: civil("2026-10-14") })], today).length, 0);
  assert.equal(buildOverdueFeeAlerts([monthly({ vencimento: civil("2026-10-13") })], today)[0]?.diasAtraso, 5);
  assert.equal(buildOverdueFeeAlerts([monthly({ vencimento: civil("2026-10-08") })], today)[0]?.diasAtraso, 10);
});

test("fully paid and historical PAGO fees do not alert", () => {
  const fullyPaid = monthly({ pagamentos: [{ valor: 100, status: PagamentoStatus.CONFIRMADO }] });
  const historical = monthly({ status: MensalidadeStatus.PAGO, pagamentos: [] });
  assert.equal(buildOverdueFeeAlerts([fullyPaid, historical], today).length, 0);
});

test("partially paid fee alerts only for its remaining balance", () => {
  const alert = buildOverdueFeeAlerts([monthly({ valorFinal: 90, pagamentos: [{ valor: 60, status: PagamentoStatus.CONFIRMADO }] })], today)[0];
  assert.equal(alert?.saldo, 30);
});

test("absence threshold excludes six days and includes exactly seven and fifteen", () => {
  assert.equal(buildAbsenceAlerts([student({ presencas: [{ data: civil("2026-10-12") }] })], today).alerts.length, 0);
  assert.equal(buildAbsenceAlerts([student({ presencas: [{ data: civil("2026-10-11") }] })], today).alerts[0]?.diasSemPresenca, 7);
  assert.equal(buildAbsenceAlerts([student({ presencas: [{ data: civil("2026-10-03") }] })], today).alerts[0]?.diasSemPresenca, 15);
});

test("inactive, cancelled and paused students never alert", () => {
  for (const status of [AlunoStatus.INATIVO, AlunoStatus.CANCELADO, AlunoStatus.TRANCADO]) {
    assert.equal(buildAbsenceAlerts([student({ status, presencas: [{ data: civil("2026-09-01") }] })], today).alerts.length, 0);
  }
});

test("student without attendance uses current enrollment start at six, seven and twenty days", () => {
  const withoutAttendance = (start: string) => student({ presencas: [], periodosMatricula: [{ dataInicio: civil(start), dataSaida: null }] });
  assert.equal(buildAbsenceAlerts([withoutAttendance("2026-10-12")], today).alerts.length, 0);
  assert.equal(buildAbsenceAlerts([withoutAttendance("2026-10-11")], today).alerts[0]?.diasSemPresenca, 7);
  assert.equal(buildAbsenceAlerts([withoutAttendance("2026-09-28")], today).alerts[0]?.diasSemPresenca, 20);
});

test("student without attendance ignores closed enrollment and uses the current open one", () => {
  const result = buildAbsenceAlerts([student({
    presencas: [],
    periodosMatricula: [
      { dataInicio: civil("2025-01-01"), dataSaida: civil("2025-02-01") },
      { dataInicio: civil("2026-10-11"), dataSaida: null }
    ]
  })], today);
  assert.equal(result.alerts[0]?.dataInicio, "2026-10-11");
  assert.equal(result.alerts[0]?.diasSemPresenca, 7);
});

test("missing and duplicate open enrollments are reported without mutating data", () => {
  const missing = student({ id: "missing", presencas: [], periodosMatricula: [] });
  const duplicate = student({ id: "duplicate", presencas: [], periodosMatricula: [
    { dataInicio: civil("2026-10-01"), dataSaida: null },
    { dataInicio: civil("2026-10-11"), dataSaida: null }
  ] });
  const result = buildAbsenceAlerts([missing, duplicate], today);
  assert.deepEqual(result.activeWithoutOpenPeriod, ["missing"]);
  assert.deepEqual(result.activeWithMultipleOpenPeriods, ["duplicate"]);
  assert.equal(result.alerts.find((item) => item.alunoId === "duplicate")?.dataInicio, "2026-10-11");
});

test("fee and absence alerts sort longest delay first", () => {
  const fees = buildOverdueFeeAlerts([
    monthly({ id: "five", vencimento: civil("2026-10-13") }),
    monthly({ id: "ten", vencimento: civil("2026-10-08") })
  ], today);
  assert.deepEqual(fees.map((item) => item.mensalidadeId), ["ten", "five"]);
  const absences = buildAbsenceAlerts([
    student({ id: "seven", presencas: [{ data: civil("2026-10-11") }] }),
    student({ id: "fifteen", presencas: [{ data: civil("2026-10-03") }] })
  ], today).alerts;
  assert.deepEqual(absences.map((item) => item.alunoId), ["fifteen", "seven"]);
});
