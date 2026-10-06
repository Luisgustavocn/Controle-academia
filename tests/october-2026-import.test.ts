import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import {
  buildOctoberDryRunPlan,
  normalizeModalityKey,
  normalizePersonName,
  normalizePhone,
  parseOctober2026Workbook,
  type ProductionSnapshot
} from "../lib/import/october-2026";

function sourceWorkbook() {
  const workbook = XLSX.utils.book_new();
  const musc = XLSX.utils.aoa_to_sheet([
    [],
    [],
    ["", "TELEFONE", "Modalidade", "Venc", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out"],
    ["Pessoa Ativa", "55 11 99999-0000", "3x musc", 10, 100],
    ["Pessoa Inativa", "", "todos os dias", 5, 110],
    ["Pessoa Futura", "", "3xmusc", 15, 100]
  ]);
  musc.A4.s = { patternType: "solid", fgColor: { theme: 0, tint: -0.249977111117893 } };
  musc.A5.s = { patternType: "solid", fgColor: { rgb: "FF0000" } };
  musc.A6.s = { patternType: "solid", fgColor: { rgb: "C0C0C0" } };
  const out = XLSX.utils.aoa_to_sheet([
    [], [],
    ["", "", "Q"],
    ["", "", 1],
    [1, "Pessoa Ativa", 1],
    [2, "Nome Diferente", 1]
  ]);
  XLSX.utils.book_append_sheet(workbook, musc, "Musc");
  XLSX.utils.book_append_sheet(workbook, out, "Out");
  return workbook;
}

test("normalizes names, modalities and phones without inventing data", () => {
  assert.equal(normalizePersonName("  João  da Sílva "), "joao da silva");
  assert.equal(normalizeModalityKey("3X MUSC"), "3xmusc");
  assert.equal(normalizePhone("(55) 99999-0000"), "55999990000");
  assert.equal(normalizePhone(""), null);
});

test("parser reads status colors, October attendance and unresolved names", () => {
  const parsed = parseOctober2026Workbook(sourceWorkbook());
  assert.equal(parsed.students.length, 3);
  assert.deepEqual(parsed.students.map((student) => student.status), ["ACTIVE", "INACTIVE", "NOT_ENROLLED"]);
  assert.deepEqual(parsed.students[0].attendanceDates, ["2026-10-01"]);
  assert.equal(parsed.sourceAttendanceCount, 2);
  assert.equal(parsed.unmatchedAttendanceRows[0].dates.length, 1);
  assert.ok(parsed.issues.some((issue) => issue.code === "ATTENDANCE_WITHOUT_STUDENT"));
});

test("dry-run never auto-matches a merely probable student after structural blockers are resolved", () => {
  const parsed = parseOctober2026Workbook(sourceWorkbook());
  const production: ProductionSnapshot = {
    students: [{ id: "student-1", name: "Pessoa Ativaa", phone: "5511999990000", dueDay: 10, status: "ATIVO", modalityId: "mod-1", modalityName: "3xmusc", enrollments: [] }],
    modalities: [{ id: "mod-1", name: "3xmusc", defaultValue: 100, active: true }],
    attendance: []
  };
  const plan = buildOctoberDryRunPlan(parsed, production);
  const active = plan.students.find((student) => student.name === "Pessoa Ativa");
  assert.equal(active?.match, "AMBIGUO");
  assert.equal(active?.action, "REVISAR");
  assert.ok(!plan.issues.some((issue) => issue.code === "STUDENT_MONTHLY_VALUE_SCHEMA_MISSING"));
  assert.ok(plan.summary.blockers > 0);
});

test("preserves the real individual value and reuses an existing open enrollment", () => {
  const parsed = parseOctober2026Workbook(sourceWorkbook());
  const production: ProductionSnapshot = {
    students: [{
      id: "student-1",
      name: "Pessoa Ativa",
      phone: "5511999990000",
      dueDay: 10,
      status: "ATIVO",
      modalityId: "mod-1",
      modalityName: "3x Musculação",
      enrollments: [{ id: "period-1", startDate: null, exitDate: null, modalityId: "mod-1", monthlyValue: 100, useDefaultValue: false, dueDay: 10 }]
    }],
    modalities: [{ id: "mod-1", name: "3x Musculação", defaultValue: 100, active: true }],
    attendance: []
  };
  const plan = buildOctoberDryRunPlan(parsed, production);
  const active = plan.students.find((student) => student.name === "Pessoa Ativa");
  assert.equal(active?.match, "EXISTENTE_EXATO");
  assert.equal(active?.plannedMonthlyValue, 100);
  assert.equal(active?.plannedUseDefaultValue, false);
  assert.equal(active?.plannedStartDate, null);
  assert.equal(active?.plannedEnrollmentAction, "REUTILIZAR_ABERTO");
  assert.equal(active?.attendanceOutsideEnrollment, 0);
});

test("uses only an explicitly approved alias for a production match", () => {
  const workbook = sourceWorkbook();
  workbook.Sheets.Musc.A4.v = "Adelar de cezaro";
  workbook.Sheets.Musc.A4.w = "Adelar de cezaro";
  const parsed = parseOctober2026Workbook(workbook);
  const production: ProductionSnapshot = {
    students: [{ id: "student-1", name: "Adelar Decezaro", phone: "", dueDay: 10, status: "INATIVO", modalityId: null, modalityName: null, enrollments: [] }],
    modalities: [{ id: "mod-1", name: "3x Musculação", defaultValue: 100, active: true }],
    attendance: []
  };
  const plan = buildOctoberDryRunPlan(parsed, production);
  assert.equal(plan.students.find((student) => student.name === "Adelar de cezaro")?.match, "MATCH_MANUAL_APROVADO");
});
