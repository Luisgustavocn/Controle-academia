import assert from "node:assert/strict";
import test from "node:test";
import { OPERATIONAL_DATA_ENTITIES, protectHistoricalMutation } from "../lib/import/operational-data-protection";

const operational = (entity: string, historicalValue: unknown = { value: "histórico" }) => protectHistoricalMutation({
  entity,
  operation: "UPSERT",
  existing: { id: `${entity}-1`, provenance: "SISTEMA_OPERACIONAL", updatedAt: "2026-10-14T12:00:00.000Z", value: { value: "sistema" } },
  historicalValue,
  historicalProvenance: "PLANILHA",
  comparedAt: new Date("2026-10-14T13:00:00.000Z")
});

test("historical imports preserve operational Aluno and PeriodoMatricula", () => {
  for (const entity of ["Aluno", "PeriodoMatricula"]) {
    const decision = operational(entity);
    assert.equal(decision.allowed, false);
    assert.equal(decision.classification, "CONFLITO_COM_DADO_OPERACIONAL");
  }
});

test("historical imports preserve existing Presenca", () => {
  assert.equal(operational("Presenca").allowed, false);
});

test("historical imports preserve existing Mensalidade and Pagamento", () => {
  for (const entity of ["Mensalidade", "Pagamento"]) assert.equal(operational(entity).action, "PRESERVAR");
});

test("historical imports preserve existing Caixa and Despesa", () => {
  for (const entity of ["MovimentacaoCaixa", "DespesaAcademia"]) assert.equal(operational(entity).allowed, false);
});

test("the permanent policy covers every persisted operational entity", () => {
  assert.deepEqual(OPERATIONAL_DATA_ENTITIES, [
    "Aluno", "PeriodoMatricula", "Presenca", "Mensalidade", "Pagamento", "MovimentacaoCaixa",
    "DespesaAcademia", "Produto", "PedidoProduto", "PedidoItem", "AgendaPersonal", "Configuracao"
  ]);
});

test("conflict is documented and skipped", () => {
  const decision = operational("Aluno");
  assert.equal(decision.action, "PRESERVAR");
  assert.equal(decision.conflict?.currentProvenance, "SISTEMA_OPERACIONAL");
  assert.equal(decision.conflict?.historicalProvenance, "PLANILHA");
  assert.equal(decision.conflict?.comparedAt, "2026-10-14T13:00:00.000Z");
});

test("updatedAt divergence produces SKIPPED_PRECONDITION", () => {
  const decision = protectHistoricalMutation({
    entity: "Aluno",
    operation: "UPDATE",
    existing: { id: "student-1", provenance: "IMPORTACAO", updatedAt: "2026-10-14T12:01:00.000Z" },
    observedUpdatedAt: "2026-10-14T12:00:00.000Z",
    allowExplicitImportedMutation: true
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.classification, "SKIPPED_PRECONDITION");
});

test("explicitly authorized imported update requires a matching updatedAt guard", () => {
  const decision = protectHistoricalMutation({
    entity: "Mensalidade",
    operation: "UPDATE",
    existing: { id: "fee-1", provenance: "IMPORTACAO", updatedAt: "2026-10-14T12:00:00.000Z" },
    observedUpdatedAt: "2026-10-14T12:00:00.000Z",
    allowExplicitImportedMutation: true
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.action, "UPDATE");
});

test("unknown provenance is preserved", () => {
  const decision = protectHistoricalMutation({ entity: "Configuracao", operation: "DELETE", existing: { id: "config-1", provenance: "DESCONHECIDO" } });
  assert.equal(decision.allowed, false);
  assert.equal(decision.action, "SKIP");
});

test("second execution is idempotent and preserves the record created by the first", () => {
  const first = protectHistoricalMutation({ entity: "Presenca", operation: "CREATE" });
  const second = protectHistoricalMutation({ entity: "Presenca", operation: "CREATE", existing: { id: "attendance-1", provenance: "IMPORTACAO", value: { date: "2026-10-01" } }, historicalValue: { date: "2026-10-01" }, historicalProvenance: "IMPORTACAO" });
  assert.equal(first.action, "CREATE");
  assert.equal(second.allowed, false);
  assert.equal(second.classification, "EXISTENTE");
  assert.equal(second.action, "PRESERVAR");
});
