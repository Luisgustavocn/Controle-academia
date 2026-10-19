import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("student archive migration is additive and operational readers exclude archived students", () => {
  const sql = readFileSync("prisma/migrations/0010_archive_students/migration.sql", "utf8");
  assert.match(sql, /arquivadoEm/); assert.match(sql, /ON DELETE SET NULL/); assert.doesNotMatch(sql, /^\s*(?:UPDATE|DELETE FROM|INSERT)\b/im);
  for (const file of ["lib/services/student-listing.ts", "app/api/alunos/route.ts", "lib/services/attendance-workspace.ts", "lib/services/attendance.ts", "lib/services/personal-schedule.ts", "app/api/pedidos/route.ts", "app/api/mensalidades/route.ts"]) assert.match(readFileSync(file, "utf8"), /arquivadoEm/);
  const service = readFileSync("lib/services/student-deletion.ts", "utf8");
  assert.match(service, /acao: "ARCHIVE"/); assert.match(service, /acao: "RESTORE"/); assert.doesNotMatch(service, /aluno\.delete|periodoMatricula\.delete/);
});

test("cash link migration is nullable, restrictive and does not backfill", () => {
  const sql = readFileSync("prisma/migrations/0011_link_cash_to_payments/migration.sql", "utf8");
  assert.match(sql, /pagamentoId/); assert.match(sql, /mensalidadeId/); assert.match(sql, /ON DELETE RESTRICT/g); assert.doesNotMatch(sql, /^\s*(?:UPDATE|DELETE FROM|INSERT)\b/im);
  const payments = readFileSync("lib/services/monthly-payments.ts", "utf8");
  assert.match(payments, /pagamentoId: payment\.id/); assert.match(payments, /mensalidadeId: monthly\.id/);
});

test("monthly deletion is transactional, auditable and uses no textual matching", () => {
  const source = readFileSync("lib/services/monthly-deletion.ts", "utf8");
  assert.match(source, /TransactionIsolationLevel\.Serializable/); assert.match(source, /FOR UPDATE/); assert.match(source, /DELETE_RECONCILED/);
  assert.match(source, /AUTO_PAGAMENTO_PREFIX/); assert.match(source, /auto_mensalidade_/); assert.doesNotMatch(source, /contains:|descricao: \{|observacao: \{/);
  assert.ok(source.indexOf("movimentacaoCaixa.deleteMany") < source.indexOf("pagamento.deleteMany"));
  assert.ok(source.indexOf("pagamento.deleteMany") < source.indexOf("mensalidade.delete"));
});

test("cash views aggregate in the backend with civil ranges and pagination", () => {
  const api = readFileSync("app/api/caixa/route.ts", "utf8");
  assert.match(api, /visao === "diaria"/); assert.match(api, /visao === "anual"/); assert.match(api, /civilMonthRange/); assert.match(api, /aggregate/); assert.match(api, /GROUP BY 1/); assert.match(api, /pagination/);
});

test("used categories cannot change type or be deleted and automatic sync does not reactivate", () => {
  const route = readFileSync("app/api/categorias-financeiras/[id]/route.ts", "utf8");
  assert.match(route, /histórico financeiro/); assert.match(route, /não pode ser alterado/);
  const cash = readFileSync("lib/services/caixa.ts", "utf8");
  assert.match(cash, /existing\.ativa === false \? undefined : existing\.id/); assert.doesNotMatch(cash, /ativa: true\s*\}\s*\)/);
});
