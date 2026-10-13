import assert from "node:assert/strict";
import test from "node:test";
import { filterLookupOptionsForSearch } from "../components/forms/crud-module";
import { shouldShowStudentExitDate } from "../components/students/student-form-dialog";
import { inspectStudentDeletion } from "../lib/services/student-deletion";

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

test("student deletion inspection allows a fresh registration and blocks relevant history", async () => {
  const client = (counts: Record<string, number>, periods: Array<{ dataSaida: Date | null }>) => ({
    aluno: { findUnique: async () => ({ id: "student-1", nomeCompleto: "Aluno", _count: counts, periodosMatricula: periods }) }
  });
  const emptyCounts = { mensalidades: 0, pagamentos: 0, presencas: 0, movimentacoesCaixa: 0, agendaPersonal: 0, pedidosProduto: 0, historicoPlanos: 0, periodosMatricula: 1 };
  const fresh = await inspectStudentDeletion("student-1", client(emptyCounts, [{ dataSaida: null }]) as never);
  assert.equal(fresh.canDelete, true);
  const historical = await inspectStudentDeletion("student-1", client({ ...emptyCounts, mensalidades: 1, presencas: 1 }, [{ dataSaida: null }]) as never);
  assert.equal(historical.canDelete, false);
  assert.deepEqual(historical.dependencies, ["mensalidades", "presenças"]);
});
