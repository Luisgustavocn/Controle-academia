import type { PrismaClient } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

type TransactionRunner = Pick<PrismaClient, "$transaction">;

export class StudentDeletionNotFoundError extends Error {}
export class StudentDeletionBlockedError extends Error {
  constructor(public readonly dependencies: string[]) {
    super("Não é possível excluir este aluno porque ele possui histórico. Use Inativo, Cancelado ou Trancado para preservar os registros.");
  }
}

export async function inspectStudentDeletion(studentId: string, client: PrismaClient = prisma) {
  const student = await client.aluno.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      nomeCompleto: true,
      _count: {
        select: {
          mensalidades: true,
          pagamentos: true,
          presencas: true,
          movimentacoesCaixa: true,
          agendaPersonal: true,
          pedidosProduto: true,
          historicoPlanos: true,
          periodosMatricula: true
        }
      },
      periodosMatricula: { select: { dataSaida: true }, orderBy: { createdAt: "asc" } }
    }
  });
  if (!student) throw new StudentDeletionNotFoundError("Aluno não encontrado");

  const dependencies: string[] = [];
  const labels: Array<[keyof typeof student._count, string]> = [
    ["mensalidades", "mensalidades"], ["pagamentos", "pagamentos"], ["presencas", "presenças"],
    ["movimentacoesCaixa", "movimentações financeiras"], ["agendaPersonal", "agenda"],
    ["pedidosProduto", "pedidos"], ["historicoPlanos", "alterações de modalidade"]
  ];
  for (const [key, label] of labels) if (student._count[key] > 0) dependencies.push(label);
  // O único período aberto criado junto com um cadastro novo não é histórico relevante.
  if (student.periodosMatricula.length > 1 || student.periodosMatricula.some((period) => period.dataSaida !== null)) {
    dependencies.push("períodos de matrícula históricos");
  }
  return { student, dependencies, canDelete: dependencies.length === 0 };
}

export async function deleteStudentWithoutHistory(
  studentId: string,
  actor: { id: string; name: string },
  options: { client?: TransactionRunner } = {}
) {
  const runner = options.client ?? prisma;
  return runner.$transaction(async (tx) => {
    const inspection = await inspectStudentDeletion(studentId, tx as unknown as PrismaClient);
    if (!inspection.canDelete) throw new StudentDeletionBlockedError(inspection.dependencies);
    await tx.periodoMatricula.deleteMany({ where: { alunoId: studentId } });
    await tx.aluno.delete({ where: { id: studentId } });
    await logAudit({
      userId: actor.id,
      modulo: "alunos",
      entidade: "Aluno",
      entidadeId: studentId,
      acao: "DELETE",
      antes: { nomeCompleto: inspection.student.nomeCompleto, semHistorico: true },
      depois: null
    }, tx);
    return inspection.student;
  });
}
