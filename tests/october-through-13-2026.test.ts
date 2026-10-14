import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { OCTOBER_THROUGH_13_2026_SHA256, octoberCashId, parseOctoberThrough13Package } from "../lib/import/october-through-13-2026";

const source = process.env.OCTOBER_THROUGH_13_PACKAGE ?? "/Users/luisgustavo/Downloads/pacote_outubro_ate_13_2026_controle_academia.zip";

test("October through 13 package validates canonical scope and totals", () => {
  const pkg = parseOctoberThrough13Package(source, source.endsWith(".zip") ? undefined : OCTOBER_THROUGH_13_2026_SHA256);
  assert.equal(pkg.sha256, OCTOBER_THROUGH_13_2026_SHA256); assert.equal(pkg.attendance.length, 386); assert.equal(pkg.pendingRowsCount, 28); assert.equal(pkg.pendingNames.length, 11);
  assert.equal(pkg.attendanceInternalDuplicates, 0); assert.equal(pkg.cashInternalDuplicates, 0); assert.equal(pkg.cash.length, 82);
  assert.equal(pkg.cash.filter((row) => row.kind === "CARRY_FORWARD").reduce((sum, row) => sum + row.value, 0), 1078);
  assert.equal(pkg.cash.filter((row) => row.kind === "ENTRY").reduce((sum, row) => sum + row.value, 0), 16720);
  assert.ok(pkg.attendance.every((row) => row.date >= "2026-10-01" && row.date <= "2026-10-13")); assert.ok(pkg.cash.every((row) => row.date <= "2026-10-13"));
});

test("October cash IDs are deterministic", () => {
  const row = { date: "2026-10-02", value: 320, description: "janine", sourceLine: 6 };
  assert.equal(octoberCashId(row), octoberCashId({ ...row }));
});

test("October importer rejects any source date after October 13", () => {
  const extracted = process.env.OCTOBER_THROUGH_13_EXTRACTED;
  if (!extracted) return;
  const altered = mkdtempSync(path.join(tmpdir(), "october-after-cutoff-"));
  try {
    cpSync(extracted, altered, { recursive: true });
    const csv = path.join(altered, "presencas_outubro_ate_13_resolvidas.csv");
    writeFileSync(csv, readFileSync(csv, "utf8").replace("2026-10-13", "2026-10-14"));
    assert.throws(() => parseOctoberThrough13Package(altered, OCTOBER_THROUGH_13_2026_SHA256), /data fora/);
  } finally {
    rmSync(altered, { recursive: true, force: true });
  }
});
