import { AlunoStatus, Prisma, type PrismaClient } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { civilDateToPrisma, civilMonthRange, compareCivilDates, parseCivilDate, prismaDateToCivil } from "@/lib/attendance-date";
import { prisma } from "@/lib/prisma";

type DbClient = PrismaClient | Prisma.TransactionClient;
type TransactionRunner = Pick<PrismaClient, "$transaction">;

export type EnrollmentActor = { id: string; name: string };
export type ResumeEnrollmentInput = {
  startDate: string;
  modalidadeId: string | null;
  monthlyValue: number | null;
  useDefaultValue: boolean;
  dueDay: number;
};

export class EnrollmentValidationError extends Error {}
export class EnrollmentNotFoundError extends Error {}

export function enrollmentActiveOnDateWhere(dateKey: string): Prisma.PeriodoMatriculaWhereInput {
  const date = civilDateToPrisma(dateKey);
  return {
    AND: [
      { OR: [{ dataInicio: null }, { dataInicio: { lte: date } }] },
      { OR: [{ dataSaida: null }, { dataSaida: { gte: date } }] }
    ]
  };
}

export function studentActiveOnDateWhere(dateKey: string): Prisma.AlunoWhereInput {
  return { periodosMatricula: { some: enrollmentActiveOnDateWhere(dateKey) } };
}

export function enrollmentCoversCompetenceWhere(competence: string): Prisma.PeriodoMatriculaWhereInput {
  const { start, end } = civilMonthRange(competence);
  const lastDay = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return {
    AND: [
      { OR: [{ dataInicio: null }, { dataInicio: { lte: lastDay } }] },
      { OR: [{ dataSaida: null }, { dataSaida: { gte: start } }] }
    ]
  };
}

export function enrollmentCoversCompetence(period: { dataInicio: Date | null; dataSaida: Date | null }, competence: string) {
  const { start, end } = civilMonthRange(competence);
  const lastDay = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return (!period.dataInicio || period.dataInicio <= lastDay) && (!period.dataSaida || period.dataSaida >= start);
}

export async function findEnrollmentForCompetence(client: DbClient, alunoId: string, competence: string) {
  return client.periodoMatricula.findFirst({
    where: { alunoId, ...enrollmentCoversCompetenceWhere(competence) },
    include: { modalidade: true },
    orderBy: [{ dataInicio: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }]
  });
}

export async function isStudentActiveOnDate(client: DbClient, alunoId: string, dateKey: string) {
  const count = await client.periodoMatricula.count({
    where: { alunoId, ...enrollmentActiveOnDateWhere(dateKey) }
  });
  return count > 0;
}

function assertDueDay(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 31) throw new EnrollmentValidationError("Dia de vencimento inválido");
}

export async function endEnrollment(
  studentId: string,
  input: { exitDate: string; status?: AlunoStatus; reason?: string | null },
  actor: EnrollmentActor,
  options: { client?: TransactionRunner } = {}
) {
  const runner = options.client ?? prisma;
  const exitDateKey = parseCivilDate(input.exitDate);
  const exitDate = civilDateToPrisma(exitDateKey);
  const targetStatus = input.status === AlunoStatus.TRANCADO ? AlunoStatus.TRANCADO : AlunoStatus.CANCELADO;

  return runner.$transaction(async (tx) => {
    const student = await tx.aluno.findUnique({ where: { id: studentId } });
    if (!student) throw new EnrollmentNotFoundError("Aluno não encontrado");
    const period = await tx.periodoMatricula.findFirst({ where: { alunoId: studentId, dataSaida: null }, orderBy: { createdAt: "desc" } });
    if (!period) throw new EnrollmentValidationError("O aluno não possui matrícula aberta");
    if (period.dataInicio && compareCivilDates(exitDateKey, prismaDateToCivil(period.dataInicio)) < 0) {
      throw new EnrollmentValidationError("A saída não pode ser anterior ao início da matrícula");
    }

    const closed = await tx.periodoMatricula.update({
      where: { id: period.id },
      data: { dataSaida: exitDate, motivoSaida: input.reason?.trim() || null, encerradoPor: actor.id }
    });
    const updated = await tx.aluno.update({
      where: { id: studentId },
      data: { status: targetStatus, dataSaidaCancelamento: exitDate }
    });
    await logAudit({
      userId: actor.id,
      modulo: "alunos",
      entidade: "PeriodoMatricula",
      entidadeId: closed.id,
      acao: "END_ENROLLMENT",
      antes: { alunoId: studentId, dataInicio: period.dataInicio ? prismaDateToCivil(period.dataInicio) : null, dataSaida: null },
      depois: { dataSaida: exitDateKey, status: targetStatus, motivo: closed.motivoSaida }
    }, tx);
    return { student: updated, period: closed };
  });
}

export async function resumeEnrollment(
  studentId: string,
  input: ResumeEnrollmentInput,
  actor: EnrollmentActor,
  options: { client?: TransactionRunner; now?: Date } = {}
) {
  const runner = options.client ?? prisma;
  const startDateKey = parseCivilDate(input.startDate);
  const startDate = civilDateToPrisma(startDateKey);
  assertDueDay(input.dueDay);
  if (input.monthlyValue !== null && (!Number.isFinite(input.monthlyValue) || input.monthlyValue <= 0)) {
    throw new EnrollmentValidationError("Valor mensal inválido");
  }

  return runner.$transaction(async (tx) => {
    const student = await tx.aluno.findUnique({ where: { id: studentId } });
    if (!student) throw new EnrollmentNotFoundError("Aluno não encontrado");
    const open = await tx.periodoMatricula.findFirst({ where: { alunoId: studentId, dataSaida: null } });
    if (open) throw new EnrollmentValidationError("O aluno já possui matrícula aberta");
    const overlap = await tx.periodoMatricula.findFirst({
      where: { alunoId: studentId, OR: [{ dataSaida: null }, { dataSaida: { gte: startDate } }] }
    });
    if (overlap) throw new EnrollmentValidationError("A data de retorno conflita com uma matrícula existente");

    const period = await tx.periodoMatricula.create({
      data: {
        alunoId: studentId,
        dataInicio: startDate,
        modalidadeId: input.modalidadeId,
        valorMensal: input.monthlyValue,
        usarValorPadrao: input.useDefaultValue,
        diaVencimento: input.dueDay,
        createdBy: actor.id
      }
    });
    const updated = await tx.aluno.update({
      where: { id: studentId },
      data: {
        // Compatibility mirror: ATIVO means an open (possibly scheduled) period exists.
        // Operational activity is always derived from the period dates.
        status: AlunoStatus.ATIVO,
        dataInicio: startDate,
        dataSaidaCancelamento: null,
        modalidadeId: input.modalidadeId,
        valorMensal: input.monthlyValue,
        usarValorPadrao: input.useDefaultValue,
        vencimentoDia: input.dueDay
      }
    });
    await logAudit({
      userId: actor.id,
      modulo: "alunos",
      entidade: "PeriodoMatricula",
      entidadeId: period.id,
      acao: "RESUME_ENROLLMENT",
      antes: { alunoId: studentId, status: student.status },
      depois: {
        dataInicio: startDateKey,
        modalidadeId: input.modalidadeId,
        valorMensal: input.monthlyValue,
        usarValorPadrao: input.useDefaultValue,
        diaVencimento: input.dueDay
      }
    }, tx);
    return { student: updated, period };
  });
}
