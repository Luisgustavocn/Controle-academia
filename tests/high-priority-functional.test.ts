import assert from "node:assert/strict";
import test from "node:test";
import { filterLookupOptionsForSearch } from "../components/forms/crud-module";
import { shouldShowStudentExitDate } from "../components/students/student-form-dialog";
import { archiveStudent, restoreStudent } from "../lib/services/student-deletion";

test("student exit date is shown only for non-active statuses", () => {
  assert.equal(shouldShowStudentExitDate("ATIVO"), false);
  assert.equal(shouldShowStudentExitDate("CANCELADO"), true);
  assert.equal(shouldShowStudentExitDate("INATIVO"), true);
  assert.equal(shouldShowStudentExitDate("TRANCADO"), true);
});

test("Personal lookup search finds the end of a long complete list", () => {
  const options = Array.from({ length: 45 }, (_, index) => ({
    label: `Aluno ${String(index + 1).padStart(2, "0")}`,
    subtitle: `1190000${String(index + 1).padStart(4, "0")}`
  }));
  assert.equal(filterLookupOptionsForSearch(options).length, 45);
  assert.deepEqual(filterLookupOptionsForSearch(options, "Aluno 45"), [options[44]]);
  assert.deepEqual(filterLookupOptionsForSearch(options, "11900000045"), [options[44]]);
});

test("student archive and restore preserve status and do not create enrollment", async () => {
  const state = { id: "student-1", status: "INATIVO", arquivadoEm: null as Date | null, arquivadoPorId: null as string | null };
  const client = { $transaction: async (fn: (tx: never) => unknown) => fn({ user: { findUnique: async () => ({ id: "admin" }) }, aluno: { findUnique: async () => ({ ...state }), update: async ({ data }: { data: Partial<typeof state> }) => Object.assign(state, data) }, logAuditoria: { create: async () => ({}) } } as never) };
  await archiveStudent("student-1", { id: "admin", name: "Admin" }, { client: client as never });
  assert.ok(state.arquivadoEm); assert.equal(state.status, "INATIVO");
  await restoreStudent("student-1", { id: "admin", name: "Admin" }, { client: client as never });
  assert.equal(state.arquivadoEm, null); assert.equal(state.status, "INATIVO");
});
