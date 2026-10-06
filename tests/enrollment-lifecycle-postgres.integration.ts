import assert from "node:assert/strict";
import { AlunoStatus, MensalidadeStatus, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { endEnrollment, isStudentActiveOnDate, resumeEnrollment, studentActiveOnDateWhere } from "../lib/services/enrollment-periods";
import { generateMensalidadesCompetencia } from "../lib/services/mensalidades";
import { confirmAttendance } from "../lib/services/attendance";
import { getOperationalDashboard } from "../lib/services/dashboard";

async function main() {
  const suffix = Date.now().toString(36);
  const actorId = `lifecycle-admin-${suffix}`;
  const studentId = `lifecycle-student-${suffix}`;
  const rollbackId = `lifecycle-rollback-${suffix}`;
  const oldModalityId = `lifecycle-old-${suffix}`;
  const newModalityId = `lifecycle-new-${suffix}`;
  const triggerName = `lifecycle_audit_${suffix}`;
  const functionName = `lifecycle_audit_fn_${suffix}`;
  let triggerCreated = false;

  try {
    await prisma.user.create({ data: { id: actorId, name: "Lifecycle Admin", email: `${actorId}@test.local`, passwordHash: "unused", role: UserRole.ADMIN } });
    await prisma.modalidade.createMany({ data: [
      { id: oldModalityId, nome: `3x Musculação ${suffix}`, valorPadrao: 100 },
      { id: newModalityId, nome: `2x Personal ${suffix}`, valorPadrao: 290 }
    ] });
    await prisma.aluno.createMany({ data: [studentId, rollbackId].map((id) => ({
      id, nomeCompleto: id, telefone: id, vencimentoDia: 10, status: AlunoStatus.CANCELADO,
      dataInicio: new Date("2026-07-05T00:00:00.000Z"), dataSaidaCancelamento: new Date("2026-09-30T00:00:00.000Z"),
      modalidadeId: oldModalityId, valorMensal: 100, usarValorPadrao: false
    })) });
    await prisma.periodoMatricula.createMany({ data: [studentId, rollbackId].map((alunoId) => ({
      alunoId, dataInicio: new Date("2026-07-05T00:00:00.000Z"), dataSaida: new Date("2026-09-30T00:00:00.000Z"),
      modalidadeId: oldModalityId, valorMensal: 100, usarValorPadrao: false, diaVencimento: 10
    })) });
    await prisma.mensalidade.createMany({ data: [
      { alunoId: studentId, competencia: "2026-08", valor: 100, vencimento: new Date("2026-08-10T00:00:00.000Z"), status: MensalidadeStatus.ATRASADO },
      { alunoId: studentId, competencia: "2026-09", valor: 100, vencimento: new Date("2026-09-10T00:00:00.000Z"), status: MensalidadeStatus.PAGO, dataPagamento: new Date("2026-09-10T12:00:00.000Z") }
    ] });
    const historicalBefore = await prisma.mensalidade.findMany({ where: { alunoId: studentId }, orderBy: { competencia: "asc" } });

    await generateMensalidadesCompetencia("2026-10");
    await generateMensalidadesCompetencia("2026-11");
    assert.equal(await prisma.mensalidade.count({ where: { alunoId: studentId, competencia: { in: ["2026-10", "2026-11"] } } }), 0);
    assert.equal(await isStudentActiveOnDate(prisma, studentId, "2026-10-05"), false);
    await assert.rejects(() => confirmAttendance(
      { alunoId: studentId, data: "2026-10-05", tipoAula: "musculacao" },
      { id: actorId, role: UserRole.ADMIN },
      new Date("2026-10-05T15:00:00.000Z")
    ), /sem matrícula ativa/i);
    const baselineOctoberActive = await prisma.aluno.count({ where: { id: { notIn: [studentId, rollbackId] }, ...studentActiveOnDateWhere("2026-10-05") } });
    const octoberDashboard = await getOperationalDashboard("ADMIN", new Date("2026-10-05T15:00:00.000Z"));
    assert.equal(octoberDashboard.overview.activeStudents, baselineOctoberActive);
    assert.ok((octoberDashboard.attention?.overdue?.students ?? 0) >= 1);

    const resumed = await resumeEnrollment(studentId, {
      startDate: "2026-12-01", modalidadeId: newModalityId, monthlyValue: 275,
      useDefaultValue: false, dueDay: 20
    }, { id: actorId, name: "Lifecycle Admin" }, { now: new Date("2026-10-05T12:00:00.000Z") });
    assert.equal(resumed.student.id, studentId);
    assert.equal(await prisma.aluno.count({ where: { id: studentId } }), 1);
    assert.equal(await prisma.periodoMatricula.count({ where: { alunoId: studentId } }), 2);
    assert.equal(await isStudentActiveOnDate(prisma, studentId, "2026-11-30"), false);
    assert.equal(await isStudentActiveOnDate(prisma, studentId, "2026-12-01"), true);
    await confirmAttendance(
      { alunoId: studentId, data: "2026-12-01", tipoAula: "personal" },
      { id: actorId, role: UserRole.ADMIN },
      new Date("2026-12-01T15:00:00.000Z")
    );
    const baselineDecemberActive = await prisma.aluno.count({ where: { id: { notIn: [studentId, rollbackId] }, ...studentActiveOnDateWhere("2026-12-01") } });
    const decemberDashboard = await getOperationalDashboard("ADMIN", new Date("2026-12-01T15:00:00.000Z"));
    assert.equal(decemberDashboard.overview.activeStudents, baselineDecemberActive + 1);

    await generateMensalidadesCompetencia("2026-12");
    const december = await prisma.mensalidade.findUniqueOrThrow({ where: { alunoId_competencia: { alunoId: studentId, competencia: "2026-12" } } });
    assert.equal(Number(december.valor), 275);
    assert.equal(december.vencimento.getDate(), 20);
    const historicalAfter = await prisma.mensalidade.findMany({ where: { alunoId: studentId, competencia: { in: ["2026-08", "2026-09"] } }, orderBy: { competencia: "asc" } });
    assert.deepEqual(historicalAfter.map((item) => [item.competencia, Number(item.valor), item.status, item.vencimento.toISOString()]), historicalBefore.map((item) => [item.competencia, Number(item.valor), item.status, item.vencimento.toISOString()]));

    await endEnrollment(studentId, { exitDate: "2026-12-31", status: AlunoStatus.TRANCADO, reason: "teste" }, { id: actorId, name: "Lifecycle Admin" });
    assert.equal(await isStudentActiveOnDate(prisma, studentId, "2027-01-01"), false);
    assert.equal((await prisma.mensalidade.findUniqueOrThrow({ where: { id: december.id } })).status, MensalidadeStatus.PENDENTE);

    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$ BEGIN IF NEW."entidadeId" IS NOT NULL THEN RAISE EXCEPTION 'controlled resume failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "LogAuditoria" FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`);
    triggerCreated = true;
    await assert.rejects(() => resumeEnrollment(rollbackId, {
      startDate: "2026-12-01", modalidadeId: newModalityId, monthlyValue: 290, useDefaultValue: false, dueDay: 15
    }, { id: actorId, name: "Lifecycle Admin" }), /controlled resume failure/);
    assert.equal(await prisma.periodoMatricula.count({ where: { alunoId: rollbackId } }), 1);
    assert.equal((await prisma.aluno.findUniqueOrThrow({ where: { id: rollbackId } })).status, AlunoStatus.CANCELADO);

    console.log(JSON.stringify({ status: "ok", sameStudent: true, gapsNotBilled: true, snapshotsPreserved: true, rollbackVerified: true }));
  } finally {
    if (triggerCreated) await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "LogAuditoria"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    await prisma.logAuditoria.deleteMany({ where: { userId: actorId } });
    await prisma.aluno.deleteMany({ where: { id: { in: [studentId, rollbackId] } } });
    await prisma.modalidade.deleteMany({ where: { id: { in: [oldModalityId, newModalityId] } } });
    await prisma.user.deleteMany({ where: { id: actorId } });
  }
}

main().finally(() => prisma.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
