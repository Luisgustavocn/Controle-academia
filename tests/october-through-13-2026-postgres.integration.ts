import assert from "node:assert/strict";
import { TipoMovimentacao } from "@prisma/client";
import { applyOctoberThrough13, buildOctoberThrough13DryRun, OCTOBER_THROUGH_13_2026_APPLY_CONFIRMATION, OCTOBER_THROUGH_13_2026_SHA256, parseOctoberThrough13Package } from "../lib/import/october-through-13-2026";
import { normalizePersonName } from "../lib/import/october-2026";
import { prisma } from "../lib/prisma";

const source = process.env.OCTOBER_THROUGH_13_PACKAGE ?? "";
if (!source) throw new Error("OCTOBER_THROUGH_13_PACKAGE é obrigatório");

async function main() {
  const pkg = parseOctoberThrough13Package(source, source.endsWith(".zip") ? undefined : OCTOBER_THROUGH_13_2026_SHA256);
  const authorized = new Map([["elisiane fatima cuchinski", "Elisiane de Fatima Cuchinski"], ["janine da silva", "Janine da Sillva"]]);
  const names = [...new Map(pkg.attendance.map((row) => { const name = authorized.get(normalizePersonName(row.canonicalName)) ?? row.canonicalName; return [normalizePersonName(name), name]; })).values()].filter((name) => normalizePersonName(name) !== "maria isabel da silva");
  await prisma.aluno.createMany({ data: names.map((nomeCompleto, index) => ({ id: `oct-student-${index}`, nomeCompleto, telefone: `oct-${index}`, vencimentoDia: 10 })) });
  const student = await prisma.aluno.findFirstOrThrow();
  await prisma.periodoMatricula.create({ data: { alunoId: student.id, dataInicio: new Date("2026-10-01T00:00:00.000Z"), diaVencimento: 10 } });
  const fee = await prisma.mensalidade.create({ data: { alunoId: student.id, competencia: "2026-10", valor: 100, vencimento: new Date("2026-10-10T12:00:00.000Z") } });
  await prisma.pagamento.create({ data: { alunoId: student.id, mensalidadeId: fee.id, valor: 100, dataPagamento: new Date("2026-10-10T12:00:00.000Z"), formaPagamento: "DINHEIRO" } });
  const first = pkg.attendance.find((row) => normalizePersonName(row.canonicalName) === normalizePersonName(student.nomeCompleto));
  if (first) await prisma.presenca.create({ data: { alunoId: student.id, data: new Date(`${first.date}T00:00:00.000Z`), tipoAula: "historico" } });
  const firstCash = pkg.cash.find((row) => row.kind === "ENTRY")!;
  await prisma.movimentacaoCaixa.create({ data: { id: firstCash.id, data: new Date(`${firstCash.date}T12:00:00.000Z`), tipo: TipoMovimentacao.ENTRADA, descricao: firstCash.description, valor: firstCash.value, competencia: firstCash.competence } });

  const dry = await buildOctoberThrough13DryRun(prisma, pkg);
  assert.equal(dry.database, "controle_academia"); assert.equal(dry.attendance.exactlyResolved, 383); assert.equal(dry.attendance.additionalPending.reduce((sum, row) => sum + row.count, 0), 3);
  const before = dry.before; const firstApply = await applyOctoberThrough13(prisma, pkg, OCTOBER_THROUGH_13_2026_APPLY_CONFIRMATION);
  assert.equal(firstApply.attendanceCreated, 383 - dry.attendance.existing); assert.equal(firstApply.cashCreated, 81 - dry.cash.existing);
  const secondApply = await applyOctoberThrough13(prisma, pkg, OCTOBER_THROUGH_13_2026_APPLY_CONFIRMATION);
  assert.equal(secondApply.attendanceCreated, 0); assert.equal(secondApply.cashCreated, 0);
  assert.equal(await prisma.mensalidade.count(), before.monthlyFees); assert.equal(await prisma.pagamento.count(), before.payments); assert.equal(await prisma.aluno.count(), before.students); assert.equal(await prisma.periodoMatricula.count(), before.enrollmentPeriods);
  console.log(JSON.stringify({ status: "ok", firstAttendance: firstApply.attendanceCreated, firstCash: firstApply.cashCreated, secondAttendance: 0, secondCash: 0, monthlyDelta: 0, paymentDelta: 0, studentDelta: 0, enrollmentPeriodDelta: 0 }));
}

main().finally(() => prisma.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
