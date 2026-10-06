import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { AlunoStatus, MensalidadeStatus, UserRole } from "@prisma/client";
import { POST as createMonthly } from "../app/api/mensalidades/route";
import { GET as listMonthlies } from "../app/api/mensalidades/route";
import { GET as listMonthlyColumns } from "../app/api/mensalidades/colunas/route";
import { SESSION_COOKIE_NAME } from "../lib/auth/jwt-payload";
import { signSessionToken } from "../lib/auth/session";
import { prisma } from "../lib/prisma";
import { confirmAttendance } from "../lib/services/attendance";
import { garantirMensalidadesDoMesAtual, generateMensalidadesCompetencia } from "../lib/services/mensalidades";

process.env.JWT_SECRET = "monthly-activity-rule-test-secret-with-enough-entropy";

function paidRequest(actorId: string, alunoId: string, competencia: string) {
  const token = signSessionToken({ id: actorId, name: "Activity Admin", email: "activity@test.local", role: UserRole.ADMIN });
  return new NextRequest("http://localhost/api/mensalidades", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE_NAME}=${token}` },
    body: JSON.stringify({ alunoId, competencia, status: MensalidadeStatus.PAGO, valor: 120, formaPagamento: "PIX" })
  });
}

function getRequest(actorId: string, path: string) {
  const token = signSessionToken({ id: actorId, name: "Activity Admin", email: "activity@test.local", role: UserRole.ADMIN });
  return new NextRequest(`http://localhost${path}`, { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } });
}

async function main() {
  const suffix = Date.now().toString(36);
  const actorId = `activity-admin-${suffix}`;
  const modalityId = `activity-modality-${suffix}`;
  const absentId = `activity-absent-${suffix}`;
  const presentId = `activity-present-${suffix}`;
  const prepaidId = `activity-prepaid-${suffix}`;
  const returningId = `activity-returning-${suffix}`;
  const recreateId = `activity-recreate-${suffix}`;
  const studentIds = [absentId, presentId, prepaidId, returningId, recreateId];

  try {
    await prisma.user.create({ data: { id: actorId, name: "Activity Admin", email: `${actorId}@test.local`, passwordHash: "unused", role: UserRole.ADMIN } });
    await prisma.modalidade.create({ data: { id: modalityId, nome: `Activity ${suffix}`, valorPadrao: 120 } });
    await prisma.aluno.createMany({ data: studentIds.map((id) => ({
      id, nomeCompleto: id, telefone: id, vencimentoDia: 10, status: AlunoStatus.ATIVO,
      dataInicio: new Date("2026-01-01T00:00:00.000Z"), modalidadeId: modalityId, usarValorPadrao: true
    })) });
    await prisma.periodoMatricula.createMany({ data: [absentId, presentId, prepaidId, recreateId].map((alunoId) => ({
      alunoId, dataInicio: new Date("2026-01-01T00:00:00.000Z"), modalidadeId: modalityId, usarValorPadrao: true, diaVencimento: 10
    })) });
    await prisma.periodoMatricula.createMany({ data: [
      { alunoId: returningId, dataInicio: new Date("2026-01-01T00:00:00.000Z"), dataSaida: new Date("2026-08-31T00:00:00.000Z"), modalidadeId: modalityId, usarValorPadrao: true, diaVencimento: 10 },
      { alunoId: returningId, dataInicio: new Date("2026-10-01T00:00:00.000Z"), modalidadeId: modalityId, usarValorPadrao: true, diaVencimento: 10 }
    ] });

    await generateMensalidadesCompetencia("2026-10", new Date("2026-10-05T12:00:00.000Z"));
    assert.equal(await prisma.mensalidade.count({ where: { alunoId: absentId } }), 0);

    await confirmAttendance(
      { alunoId: presentId, data: "2026-10-05", tipoAula: "musculacao" },
      { id: actorId, role: UserRole.ADMIN },
      new Date("2026-10-05T12:00:00.000Z")
    );
    assert.equal(await prisma.mensalidade.count({ where: { alunoId: presentId, competencia: "2026-10" } }), 1);
    assert.equal(await prisma.mensalidade.count({ where: { alunoId: presentId, competencia: "2026-09" } }), 0);
    await confirmAttendance(
      { alunoId: presentId, data: "2026-10-06", tipoAula: "musculacao" },
      { id: actorId, role: UserRole.ADMIN },
      new Date("2026-10-06T12:00:00.000Z")
    );
    assert.equal(await prisma.mensalidade.count({ where: { alunoId: presentId, competencia: "2026-10" } }), 1);

    const prepaid = await createMonthly(paidRequest(actorId, prepaidId, "2026-10"));
    assert.equal(prepaid.status, 201);
    assert.equal((await prisma.mensalidade.findUniqueOrThrow({ where: { alunoId_competencia: { alunoId: prepaidId, competencia: "2026-10" } } })).status, MensalidadeStatus.PAGO);

    await confirmAttendance(
      { alunoId: returningId, data: "2026-10-05", tipoAula: "musculacao" },
      { id: actorId, role: UserRole.ADMIN },
      new Date("2026-10-05T12:00:00.000Z")
    );
    assert.equal(await prisma.mensalidade.count({ where: { alunoId: returningId, competencia: "2026-09" } }), 0);
    assert.equal(await prisma.mensalidade.count({ where: { alunoId: returningId, competencia: "2026-10" } }), 1);

    await prisma.mensalidade.create({ data: {
      alunoId: recreateId, competencia: "2026-10", valor: 120,
      vencimento: new Date("2026-10-10T00:00:00.000Z"), status: MensalidadeStatus.PENDENTE
    } });
    await prisma.mensalidade.delete({ where: { alunoId_competencia: { alunoId: recreateId, competencia: "2026-10" } } });
    await garantirMensalidadesDoMesAtual("2026-10");
    assert.equal(await prisma.mensalidade.count({ where: { alunoId: recreateId, competencia: "2026-10" } }), 0);

    const beforeGets = await prisma.mensalidade.count();
    assert.equal((await listMonthlies(getRequest(actorId, "/api/mensalidades?competencia=2026-10"))).status, 200);
    assert.equal((await listMonthlyColumns(getRequest(actorId, "/api/mensalidades/colunas?competencia=2026-10"))).status, 200);
    assert.equal(await prisma.mensalidade.count(), beforeGets);

    console.log(JSON.stringify({ status: "ok", noActivityNoFee: true, attendanceCreatesFee: true, secondAttendanceDoesNotDuplicate: true, prepaymentCreatesFee: true, gapNotBackfilled: true, getsDoNotWrite: true, removedFeeNotRecreated: true }));
  } finally {
    await prisma.logAuditoria.deleteMany({ where: { userId: actorId } });
    await prisma.movimentacaoCaixa.deleteMany({ where: { alunoId: { in: studentIds } } });
    await prisma.aluno.deleteMany({ where: { id: { in: studentIds } } });
    await prisma.modalidade.deleteMany({ where: { id: modalityId } });
    await prisma.user.deleteMany({ where: { id: actorId } });
  }
}

main().finally(() => prisma.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
