import assert from "node:assert/strict";
import { AlunoStatus, MensalidadeStatus, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { generateMensalidadesAteCompetencia } from "../lib/services/mensalidades";
import { updateStudentRegistration } from "../lib/services/student-registration";

function snapshotFee(item: {
  competencia: string;
  valor: unknown;
  vencimento: Date;
  status: MensalidadeStatus;
  dataPagamento: Date | null;
  formaPagamento: string | null;
}) {
  return {
    competencia: item.competencia,
    valor: Number(item.valor),
    vencimento: item.vencimento.toISOString(),
    status: item.status,
    dataPagamento: item.dataPagamento?.toISOString() ?? null,
    formaPagamento: item.formaPagamento
  };
}

async function main() {
  const suffix = Date.now().toString(36);
  const actorId = `plan-admin-${suffix}`;
  const oldModalityId = `plan-old-${suffix}`;
  const newModalityId = `plan-new-${suffix}`;
  const studentId = `plan-student-${suffix}`;
  const paidStudentId = `plan-paid-${suffix}`;
  const noFeeStudentId = `plan-no-fee-${suffix}`;
  const rollbackStudentId = `plan-rollback-${suffix}`;
  const triggerName = `test_plan_history_${suffix}`;
  const functionName = `test_plan_history_fn_${suffix}`;
  let triggerCreated = false;

  try {
    await prisma.user.create({
      data: { id: actorId, name: "Plan Test Admin", email: `plan-${suffix}@test.local`, passwordHash: "not-used", role: UserRole.ADMIN }
    });
    await prisma.modalidade.createMany({
      data: [
        { id: oldModalityId, nome: `Plan Old ${suffix}`, valorPadrao: 110 },
        { id: newModalityId, nome: `Plan New ${suffix}`, valorPadrao: 300 }
      ]
    });
    await prisma.aluno.createMany({
      data: [studentId, paidStudentId, noFeeStudentId, rollbackStudentId].map((id) => ({
        id,
        nomeCompleto: `Plan Student ${id}`,
        telefone: id,
        modalidadeId: oldModalityId,
        vencimentoDia: 10,
        status: AlunoStatus.ATIVO,
        dataInicio: new Date("2026-09-01T00:00:00.000Z")
      }))
    });
    await prisma.mensalidade.createMany({
      data: [
        { alunoId: studentId, competencia: "2026-09", valor: 110, vencimento: new Date("2026-09-10T00:00:00.000Z"), status: MensalidadeStatus.PAGO, dataPagamento: new Date("2026-09-10T12:00:00.000Z"), formaPagamento: "PIX" },
        { alunoId: studentId, competencia: "2026-10", valor: 110, vencimento: new Date("2026-10-10T00:00:00.000Z"), status: MensalidadeStatus.PENDENTE },
        { alunoId: studentId, competencia: "2026-11", valor: 110, vencimento: new Date("2026-11-10T00:00:00.000Z"), status: MensalidadeStatus.PARCIAL, dataPagamento: new Date("2026-11-05T12:00:00.000Z"), formaPagamento: "DINHEIRO" },
        { alunoId: paidStudentId, competencia: "2026-10", valor: 110, vencimento: new Date("2026-10-10T00:00:00.000Z"), status: MensalidadeStatus.PAGO, dataPagamento: new Date("2026-10-10T12:00:00.000Z"), formaPagamento: "PIX" }
      ]
    });

    const before = (await prisma.mensalidade.findMany({ where: { alunoId: studentId }, orderBy: { competencia: "asc" } })).map(snapshotFee);
    await updateStudentRegistration(studentId, {
      modalidadeId: newModalityId,
      vencimentoDia: 25,
      hasDataSaidaPayload: false
    }, { id: actorId, name: "Plan Test Admin" }, { now: new Date("2026-10-05T15:00:00.000Z") });
    const after = (await prisma.mensalidade.findMany({ where: { alunoId: studentId }, orderBy: { competencia: "asc" } })).map(snapshotFee);

    assert.deepEqual(after, before);
    assert.equal((await prisma.aluno.findUniqueOrThrow({ where: { id: studentId } })).modalidadeId, newModalityId);
    assert.equal((await prisma.aluno.findUniqueOrThrow({ where: { id: studentId } })).vencimentoDia, 25);

    const history = await prisma.historicoPlano.findFirstOrThrow({ where: { alunoId: studentId } });
    assert.equal(history.valorAnterior, null);
    assert.equal(history.valorNovo, null);
    assert.match(history.observacao ?? "", /Mensalidades emitidas foram preservadas/);
    assert.equal(await prisma.logAuditoria.count({ where: { entidadeId: studentId, acao: "UPDATE_BILLING_TERMS" } }), 1);

    const paidBefore = snapshotFee(await prisma.mensalidade.findUniqueOrThrow({ where: { alunoId_competencia: { alunoId: paidStudentId, competencia: "2026-10" } } }));
    await updateStudentRegistration(paidStudentId, {
      modalidadeId: newModalityId,
      hasDataSaidaPayload: false
    }, { id: actorId, name: "Plan Test Admin" });
    const paidAfter = snapshotFee(await prisma.mensalidade.findUniqueOrThrow({ where: { alunoId_competencia: { alunoId: paidStudentId, competencia: "2026-10" } } }));
    assert.deepEqual(paidAfter, paidBefore);

    await updateStudentRegistration(noFeeStudentId, {
      modalidadeId: newModalityId,
      hasDataSaidaPayload: false
    }, { id: actorId, name: "Plan Test Admin" });
    assert.equal(await prisma.mensalidade.count({ where: { alunoId: noFeeStudentId } }), 0);

    await generateMensalidadesAteCompetencia("2026-12", [studentId]);
    const december = await prisma.mensalidade.findUniqueOrThrow({
      where: { alunoId_competencia: { alunoId: studentId, competencia: "2026-12" } }
    });
    assert.equal(Number(december.valor), 300);
    assert.equal(december.vencimento.getDate(), 25);

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
      BEGIN
        IF NEW."alunoId" = '${rollbackStudentId}' THEN
          RAISE EXCEPTION 'controlled history failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${triggerName}"
      BEFORE INSERT ON "HistoricoPlano"
      FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
    `);
    triggerCreated = true;

    await assert.rejects(() => updateStudentRegistration(rollbackStudentId, {
      modalidadeId: newModalityId,
      hasDataSaidaPayload: false
    }, { id: actorId, name: "Plan Test Admin" }), /controlled history failure/);
    assert.equal((await prisma.aluno.findUniqueOrThrow({ where: { id: rollbackStudentId } })).modalidadeId, oldModalityId);

    console.log(JSON.stringify({ status: "ok", issuedFeesPreserved: before.length + 1, futureValue: Number(december.valor), rollbackVerified: true }));
  } finally {
    if (triggerCreated) {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "HistoricoPlano";`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"();`);
    }
    await prisma.logAuditoria.deleteMany({ where: { entidadeId: { in: [studentId, paidStudentId, noFeeStudentId, rollbackStudentId] } } });
    await prisma.aluno.deleteMany({ where: { id: { in: [studentId, paidStudentId, noFeeStudentId, rollbackStudentId] } } });
    await prisma.modalidade.deleteMany({ where: { id: { in: [oldModalityId, newModalityId] } } });
    await prisma.user.deleteMany({ where: { id: actorId } });
  }
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
