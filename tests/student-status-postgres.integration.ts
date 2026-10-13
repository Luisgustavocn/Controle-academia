import assert from "node:assert/strict";
import { AlunoStatus, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { resumeEnrollment } from "../lib/services/enrollment-periods";
import { updateStudentRegistration } from "../lib/services/student-registration";

async function main() {
  const suffix = Date.now().toString(36);
  const actorId = `status-admin-${suffix}`;
  const statuses = [AlunoStatus.CANCELADO, AlunoStatus.INATIVO, AlunoStatus.TRANCADO];
  const ids = statuses.map((status) => `status-${status.toLowerCase()}-${suffix}`);
  await prisma.user.create({ data: { id: actorId, name: "Status Admin", email: `${actorId}@test.local`, passwordHash: "unused", role: UserRole.ADMIN } });
  try {
    for (const id of ids) {
      await prisma.aluno.create({ data: { id, nomeCompleto: id, telefone: id, vencimentoDia: 10, status: AlunoStatus.ATIVO, dataInicio: new Date("2026-09-01T00:00:00.000Z") } });
      await prisma.periodoMatricula.create({ data: { alunoId: id, dataInicio: new Date("2026-09-01T00:00:00.000Z"), diaVencimento: 10 } });
    }
    for (const [index, status] of statuses.entries()) {
      const result = await updateStudentRegistration(ids[index]!, {
        status, dataSaidaCancelamento: new Date("2026-10-05T00:00:00.000Z"), hasDataSaidaPayload: true
      }, { id: actorId, name: "Status Admin" });
      assert.equal(result.updated.status, status);
      const periods = await prisma.periodoMatricula.findMany({ where: { alunoId: ids[index] } });
      assert.equal(periods.length, 1);
      assert.equal(periods[0]?.dataSaida?.toISOString().slice(0, 10), "2026-10-05");
      assert.equal(periods[0]?.motivoSaida, `Status alterado para ${status}`);
    }

    await resumeEnrollment(ids[0]!, { startDate: "2026-10-06", modalidadeId: null, monthlyValue: null, useDefaultValue: true, dueDay: 10 }, { id: actorId, name: "Status Admin" });
    const resumed = await prisma.aluno.findUniqueOrThrow({ where: { id: ids[0] } });
    assert.equal(resumed.status, AlunoStatus.ATIVO);
    assert.equal(resumed.dataSaidaCancelamento, null);
    assert.equal(await prisma.periodoMatricula.count({ where: { alunoId: ids[0] } }), 2);
    assert.equal(await prisma.periodoMatricula.count({ where: { alunoId: ids[0], dataSaida: null } }), 1);
    console.log(JSON.stringify({ status: "ok", transitions: statuses, resumedSameStudent: true }));
  } finally {
    await prisma.logAuditoria.deleteMany({ where: { userId: actorId } });
    await prisma.aluno.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: actorId } });
  }
}

main().finally(() => prisma.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
