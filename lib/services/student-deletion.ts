import type { PrismaClient } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

type TransactionRunner = Pick<PrismaClient, "$transaction">;

export class StudentDeletionNotFoundError extends Error {}
export async function archiveStudent(
  studentId: string,
  actor: { id: string; name: string },
  options: { client?: TransactionRunner } = {}
) {
  const runner = options.client ?? prisma;
  return runner.$transaction(async (tx) => {
    const previous = await tx.aluno.findUnique({ where: { id: studentId } });
    if (!previous) throw new StudentDeletionNotFoundError("Aluno não encontrado");
    if (previous.arquivadoEm) return previous;
    const updated = await tx.aluno.update({ where: { id: studentId }, data: { arquivadoEm: new Date(), arquivadoPorId: actor.id } });
    await logAudit({
      userId: actor.id,
      modulo: "alunos",
      entidade: "Aluno",
      entidadeId: studentId,
      acao: "ARCHIVE",
      antes: { arquivadoEm: null, status: previous.status },
      depois: { arquivadoEm: updated.arquivadoEm, arquivadoPorId: actor.id, status: updated.status }
    }, tx);
    return updated;
  });
}

export async function restoreStudent(studentId: string, actor: { id: string; name: string }, options: { client?: TransactionRunner } = {}) {
  return (options.client ?? prisma).$transaction(async (tx) => {
    const previous = await tx.aluno.findUnique({ where: { id: studentId } });
    if (!previous) throw new StudentDeletionNotFoundError("Aluno não encontrado");
    const updated = await tx.aluno.update({ where: { id: studentId }, data: { arquivadoEm: null, arquivadoPorId: null } });
    await logAudit({ userId: actor.id, modulo: "alunos", entidade: "Aluno", entidadeId: studentId, acao: "RESTORE", antes: { arquivadoEm: previous.arquivadoEm, status: previous.status }, depois: { arquivadoEm: null, status: updated.status } }, tx);
    return updated;
  });
}
