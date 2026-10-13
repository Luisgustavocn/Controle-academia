import assert from "node:assert/strict";
import { AlunoStatus, TipoMovimentacao, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { deleteStudentWithoutHistory, inspectStudentDeletion, StudentDeletionBlockedError } from "../lib/services/student-deletion";

async function createStudent(id: string) {
  await prisma.aluno.create({ data: { id, nomeCompleto: id, telefone: id, vencimentoDia: 10, status: AlunoStatus.ATIVO } });
  await prisma.periodoMatricula.create({ data: { alunoId: id, dataInicio: new Date("2026-10-01T00:00:00.000Z"), diaVencimento: 10 } });
}

async function main() {
  const suffix = Date.now().toString(36);
  const actorId = `delete-admin-${suffix}`;
  const ids = ["fresh", "monthly", "attendance", "operations"].map((name) => `delete-${name}-${suffix}`);
  await prisma.user.create({ data: { id: actorId, name: "Delete Admin", email: `${actorId}@test.local`, passwordHash: "unused", role: UserRole.ADMIN } });
  try {
    for (const id of ids) await createStudent(id);
    await prisma.mensalidade.create({ data: { alunoId: ids[1]!, competencia: "2026-10", valor: 100, vencimento: new Date("2026-10-10T00:00:00.000Z") } });
    await prisma.presenca.create({ data: { alunoId: ids[2]!, data: new Date("2026-10-05T00:00:00.000Z"), tipoAula: "musculacao" } });
    await prisma.movimentacaoCaixa.create({ data: { alunoId: ids[3]!, data: new Date(), tipo: TipoMovimentacao.ENTRADA, descricao: "Teste", valor: 10, competencia: "2026-10" } });
    await prisma.pedidoProduto.create({ data: { alunoId: ids[3]!, clienteNome: "Teste", quantidade: 1, valorUnitario: 10, valorTotal: 10 } });

    assert.equal((await inspectStudentDeletion(ids[0]!)).canDelete, true);
    await deleteStudentWithoutHistory(ids[0]!, { id: actorId, name: "Delete Admin" });
    assert.equal(await prisma.aluno.count({ where: { id: ids[0] } }), 0);
    for (const id of ids.slice(1)) {
      const inspection = await inspectStudentDeletion(id);
      assert.equal(inspection.canDelete, false);
      await assert.rejects(() => deleteStudentWithoutHistory(id, { id: actorId, name: "Delete Admin" }), StudentDeletionBlockedError);
      assert.equal(await prisma.aluno.count({ where: { id } }), 1);
    }
    console.log(JSON.stringify({ status: "ok", freshDeleted: true, historicalBlocked: 3 }));
  } finally {
    await prisma.logAuditoria.deleteMany({ where: { userId: actorId } });
    await prisma.aluno.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: actorId } });
  }
}

main().finally(() => prisma.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
