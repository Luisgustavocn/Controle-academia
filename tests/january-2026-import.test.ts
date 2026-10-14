import assert from "node:assert/strict";
import test from "node:test";
import { januaryCashEquivalenceKey, januaryCashId, parseJanuary2026Package } from "../lib/import/january-2026";

const source = "/Users/luisgustavo/Downloads/pacote_janeiro_2026_controle_academia.zip";
const extracted = "/tmp/controle-academia-january.hnT5Qs";

test("January 2026 package matches the canonical manifest and safety totals", () => {
  const pkg = parseJanuary2026Package(source);
  assert.equal(pkg.attendance.length, 1583);
  assert.equal(pkg.pendingRowsCount, 53);
  assert.equal(pkg.pendingNames.length, 9);
  assert.equal(pkg.attendanceInternalDuplicates, 0);
  assert.equal(pkg.cash.length, 157);
  assert.equal(pkg.cash.filter((row) => row.kind === "CARRY_FORWARD").length, 1);
  assert.equal(pkg.cash.filter((row) => row.kind === "ENTRY").reduce((sum, row) => sum + row.value, 0), 26664);
  assert.equal(pkg.cashInternalDuplicates, 0);
});

test("extracted package requires and accepts the confirmed original SHA-256", () => {
  assert.throws(() => parseJanuary2026Package(extracted), /SHA-256 divergente/);
  assert.equal(parseJanuary2026Package(extracted, "c27db8a541c7a6ca1fcc06ea3dfa785e6d382bce3b7e43f3ef06302355ef9ee6").attendance.length, 1583);
});

test("January cash identifiers are stable and source-line sensitive", () => {
  const row = { date: "2026-01-02", value: 100, description: "Aluno", sourceLine: 5 };
  assert.equal(januaryCashId(row), januaryCashId({ ...row }));
  assert.notEqual(januaryCashId(row), januaryCashId({ ...row, sourceLine: 6 }));
  const equivalence = { ...row, competence: "2026-01" as const };
  const equivalentDifferentSourceLine = { ...equivalence, sourceLine: 99 };
  assert.equal(januaryCashEquivalenceKey(equivalence), januaryCashEquivalenceKey(equivalentDifferentSourceLine));
});
