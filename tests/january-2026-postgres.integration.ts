import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TipoMovimentacao } from "@prisma/client";
import { buildJanuary2026DryRun, JANUARY_2026_APPLY_CONFIRMATION, JANUARY_2026_SHA256, parseJanuary2026Package } from "../lib/import/january-2026";
import { normalizePersonName } from "../lib/import/october-2026";
import { prisma } from "../lib/prisma";

const source = "/Users/luisgustavo/Downloads/pacote_janeiro_2026_controle_academia.zip";

async function main() {
  const pkg = parseJanuary2026Package(source);
  const names = [...new Map(pkg.attendance.map((row) => {
    const name = normalizePersonName(row.canonicalName) === "janine da silva" ? "Janine da Sillva" : row.canonicalName;
    return [normalizePersonName(name), name];
  })).values()];
  await prisma.aluno.createMany({
    data: names.map((name, index) => ({ id: `jan-student-${index}`, nomeCompleto: name, telefone: `jan-${index}`, vencimentoDia: 10 }))
  });
  const firstAttendance = pkg.attendance[0]!;
  const firstStudent = await prisma.aluno.findFirstOrThrow({ where: { nomeCompleto: firstAttendance.canonicalName } });
  await prisma.presenca.create({ data: { alunoId: firstStudent.id, data: new Date(`${firstAttendance.date}T00:00:00.000Z`), tipoAula: "historico" } });
  const firstCash = pkg.cash.find((row) => row.kind === "ENTRY")!;
  await prisma.movimentacaoCaixa.create({ data: { id: firstCash.id, data: new Date(`${firstCash.date}T12:00:00.000Z`), tipo: TipoMovimentacao.ENTRADA, descricao: firstCash.description, valor: firstCash.value, competencia: firstCash.competence } });
  const monthly = await prisma.mensalidade.create({ data: { alunoId: firstStudent.id, competencia: "2026-01", valor: 100, vencimento: new Date("2026-01-10T12:00:00.000Z") } });
  await prisma.pagamento.create({ data: { alunoId: firstStudent.id, mensalidadeId: monthly.id, valor: 100, dataPagamento: new Date("2026-01-10T12:00:00.000Z"), formaPagamento: "DINHEIRO" } });

  const before = await buildJanuary2026DryRun(prisma, pkg);
  assert.equal(before.database, "controle_academia");
  assert.equal(before.attendance.existing, 1);
  assert.equal(before.attendance.planned, 1582);
  assert.equal(before.attendance.unresolvedCanonicalNames.length, 0);
  assert.deepEqual(before.manuallyAuthorizedAliases, [{ source: "Janine da silva", target: "Janine da Sillva" }]);
  assert.equal(before.cash.existing, 1);
  assert.equal(before.cash.planned, 155);
  assert.deepEqual(before.before, before.after);
  assert.equal(before.before.monthlyFees, 1);
  assert.equal(before.before.payments, 1);

  const reportDir = mkdtempSync(path.join(tmpdir(), "january-2026-apply-"));
  try {
    const args = ["--import", "tsx", "scripts/dry-run-january-2026.ts", "--apply", "--source", source, "--confirm-sha256", JANUARY_2026_SHA256, "--confirm-apply", JANUARY_2026_APPLY_CONFIRMATION, "--report-dir", reportDir];
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", JWT_SECRET: "integration-secret-with-enough-entropy", APP_DATA_DIR: reportDir };
    execFileSync(process.execPath, args, { cwd: process.cwd(), env, stdio: "pipe" });
    assert.equal(await prisma.presenca.count(), 1583);
    assert.equal(await prisma.movimentacaoCaixa.count(), 156);
    assert.equal(await prisma.mensalidade.count(), 1);
    assert.equal(await prisma.pagamento.count(), 1);
    execFileSync(process.execPath, args, { cwd: process.cwd(), env, stdio: "pipe" });
    assert.equal(await prisma.presenca.count(), 1583);
    assert.equal(await prisma.movimentacaoCaixa.count(), 156);
    assert.equal(await prisma.mensalidade.count(), 1);
    assert.equal(await prisma.pagamento.count(), 1);
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ status: "ok", firstApplyAttendance: 1582, firstApplyCash: 155, secondApplyAttendance: 0, secondApplyCash: 0, pendingIgnored: 53, monthlyDelta: 0, paymentDelta: 0 }));
}

main().finally(() => prisma.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
