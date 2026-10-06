import { AlunoStatus, PrismaClient } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { prismaDateToCivil } from "@/lib/attendance-date";

type TransactionRunner = Pick<PrismaClient, "$transaction">;

export type StudentRegistrationPatch = {
  nomeCompleto?: string;
  telefone?: string;
  modalidadeId?: string | null;
  vencimentoDia?: number;
  status?: AlunoStatus;
  dataInicio?: Date | null;
  valorMensal?: number | null;
  usarValorPadrao?: boolean;
  dataSaidaCancelamento?: Date | null;
  hasDataSaidaPayload: boolean;
  observacoes?: string | null;
};

export type StudentRegistrationActor = {
  id: string;
  name: string;
};

export class StudentRegistrationNotFoundError extends Error {}

export async function updateStudentRegistration(
  studentId: string,
  patch: StudentRegistrationPatch,
  actor: StudentRegistrationActor,
  options: { client?: TransactionRunner; now?: Date } = {}
) {
  const client = options.client ?? prisma;
  const changedAt = options.now ?? new Date();
  const currentMonthStart = new Date(changedAt);
  currentMonthStart.setHours(0, 0, 0, 0);
  currentMonthStart.setDate(1);

  return client.$transaction(async (tx) => {
    const previous = await tx.aluno.findUnique({
      where: { id: studentId },
      include: {
        modalidade: true,
        periodosMatricula: { where: { dataSaida: null }, orderBy: { createdAt: "desc" }, take: 1 }
      }
    });

    if (!previous) {
      throw new StudentRegistrationNotFoundError("Aluno não encontrado");
    }

    let statusFinal = patch.status ?? previous.status;
    let exitDate = patch.dataSaidaCancelamento;
    const periodsLoaded = Array.isArray(previous.periodosMatricula);
    const currentPeriod = previous.periodosMatricula?.[0] ?? null;

    if (exitDate) {
      statusFinal = AlunoStatus.CANCELADO;
    }

    if (statusFinal === AlunoStatus.ATIVO) {
      if (periodsLoaded && !currentPeriod) {
        throw new Error("Use Retomar matrícula para ativar um aluno sem vínculo aberto");
      }
      exitDate = null;
    } else {
      if (exitDate === undefined) {
        exitDate = previous.dataSaidaCancelamento ?? currentMonthStart;
      }
      if (patch.hasDataSaidaPayload && exitDate === null) {
        exitDate = currentMonthStart;
      }
    }

    const updated = await tx.aluno.update({
      where: { id: studentId },
      data: {
        nomeCompleto: patch.nomeCompleto,
        telefone: patch.telefone,
        modalidadeId: patch.modalidadeId,
        vencimentoDia: patch.vencimentoDia,
        status: statusFinal,
        dataInicio: patch.dataInicio,
        valorMensal: patch.valorMensal,
        usarValorPadrao: patch.usarValorPadrao,
        dataSaidaCancelamento: exitDate,
        observacoes: patch.observacoes
      },
      include: { modalidade: true }
    });

    const modalityChanged = previous.modalidadeId !== updated.modalidadeId;
    const dueDayChanged = previous.vencimentoDia !== updated.vencimentoDia;
    const previousMonthlyValue = previous.valorMensal === null ? null : Number(previous.valorMensal);
    const updatedMonthlyValue = updated.valorMensal === null ? null : Number(updated.valorMensal);
    const monthlyValueChanged = previousMonthlyValue !== updatedMonthlyValue;
    const defaultValueRuleChanged = previous.usarValorPadrao !== updated.usarValorPadrao;

    if (currentPeriod && statusFinal !== AlunoStatus.ATIVO && !currentPeriod.dataSaida) {
      const closingDate = exitDate ?? currentMonthStart;
      if (currentPeriod.dataInicio && closingDate < currentPeriod.dataInicio) {
        throw new Error("A saída não pode ser anterior ao início da matrícula");
      }
      const closed = await tx.periodoMatricula.update({
        where: { id: currentPeriod.id },
        data: { dataSaida: closingDate, encerradoPor: actor.id }
      });
      await logAudit({
        userId: actor.id,
        modulo: "alunos",
        entidade: "PeriodoMatricula",
        entidadeId: currentPeriod.id,
        acao: "END_ENROLLMENT",
        antes: { dataSaida: null, status: previous.status },
        depois: { dataSaida: prismaDateToCivil(closed.dataSaida!), status: statusFinal }
      }, tx);
    } else if (currentPeriod && statusFinal === AlunoStatus.ATIVO) {
      await tx.periodoMatricula.update({
        where: { id: currentPeriod.id },
        data: {
          dataInicio: patch.dataInicio,
          modalidadeId: patch.modalidadeId,
          diaVencimento: patch.vencimentoDia,
          valorMensal: patch.valorMensal,
          usarValorPadrao: patch.usarValorPadrao
        }
      });
    }

    if (modalityChanged) {
      const previousName = previous.modalidade?.nome ?? "Sem modalidade";
      const newName = updated.modalidade?.nome ?? "Sem modalidade";

      await tx.historicoPlano.create({
        data: {
          alunoId: studentId,
          modalidadeAnterior: previous.modalidade?.nome ?? null,
          modalidadeNova: newName,
          valorAnterior: null,
          valorNovo: null,
          dataMudanca: changedAt,
          observacao: `Modalidade alterada de "${previousName}" para "${newName}" por ${actor.name} em ${changedAt.toISOString()}. Mensalidades emitidas foram preservadas.`
        }
      });
    }

    if (modalityChanged || dueDayChanged || monthlyValueChanged || defaultValueRuleChanged) {
      await logAudit({
        userId: actor.id,
        modulo: "alunos",
        entidade: "Aluno",
        entidadeId: studentId,
        acao: "UPDATE_BILLING_TERMS",
        antes: {
          modalidadeId: previous.modalidadeId,
          modalidade: previous.modalidade?.nome ?? null,
          vencimentoDia: previous.vencimentoDia,
          valorMensal: previousMonthlyValue,
          usarValorPadrao: previous.usarValorPadrao
        },
        depois: {
          modalidadeId: updated.modalidadeId,
          modalidade: updated.modalidade?.nome ?? null,
          vencimentoDia: updated.vencimentoDia,
          valorMensal: updatedMonthlyValue,
          usarValorPadrao: updated.usarValorPadrao,
          alteradoEm: changedAt.toISOString()
        }
      }, tx);
    }

    return {
      previous,
      updated,
      changes: {
        modalityChanged,
        dueDayChanged,
        monthlyValueChanged,
        defaultValueRuleChanged
      }
    };
  });
}
