import { AlunoStatus, MensalidadeStatus, UserRole } from "@prisma/client";
import { hasCapability } from "@/lib/auth/capabilities";
import { prisma } from "@/lib/prisma";
import { getAcademyDateContext } from "@/lib/timezone";
import { addCivilDays, civilDateToPrisma, civilMonthRange, prismaDateToCivil } from "@/lib/attendance-date";

export class StudentProfileNotFoundError extends Error {}

export type StudentProfileCapabilities = {
  edit: boolean;
  changeStatus: boolean;
  reactivate: boolean;
  viewFinancial: boolean;
  manageFinancial: boolean;
  viewAttendance: boolean;
  writeAttendance: boolean;
};

export type StudentProfileOverview = {
  student: {
    id: string;
    name: string;
    phone: string;
    status: AlunoStatus;
    dueDay: number;
    startDate: string | null;
    exitDate: string | null;
    createdAt: string;
    notes: string | null;
    modality: { id: string; name: string } | null;
    activeEnrollment: boolean;
    hasOpenEnrollment: boolean;
    enrollment: {
      id: string;
      startDate: string | null;
      exitDate: string | null;
      monthlyValue: number | null;
      useDefaultValue: boolean;
      dueDay: number;
      modality: { id: string; name: string } | null;
    } | null;
  };
  summary: {
    attendance?: {
      lastAttendanceAt: string | null;
      thisMonth: number;
      last30Days: number;
    };
    financial?: {
      status: "EM_DIA" | "EM_ATRASO" | "PARCIAL" | "SEM_PENDENCIAS" | "COM_PENDENCIA";
      currentMonthly: { competence: string; value: number; status: MensalidadeStatus; dueAt: string; paidAt: string | null } | null;
      openCount: number;
      lastPaymentAt: string | null;
      nextDueAt: string | null;
    };
  };
  capabilities: StudentProfileCapabilities;
};

function iso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

export function studentProfileCapabilities(role: UserRole, status: AlunoStatus, hasOpenEnrollment = status === AlunoStatus.ATIVO): StudentProfileCapabilities {
  const changeStatus = hasCapability(role, "students.status");
  return {
    edit: hasCapability(role, "students.update"),
    changeStatus,
    reactivate: changeStatus && !hasOpenEnrollment,
    viewFinancial: hasCapability(role, "finance.monthlies.read"),
    manageFinancial: hasCapability(role, "finance.monthlies.manage"),
    viewAttendance: hasCapability(role, "attendance.read"),
    writeAttendance: hasCapability(role, "attendance.write")
  };
}

export function financialStatusFromOpenCount(openCount: number, activeEnrollment = true, partialCount = 0) {
  if (!activeEnrollment) return openCount > 0 ? "COM_PENDENCIA" as const : "SEM_PENDENCIAS" as const;
  if (partialCount > 0) return "PARCIAL" as const;
  return openCount > 0 ? "EM_ATRASO" as const : "EM_DIA" as const;
}

export async function getStudentProfileOverview(id: string, role: UserRole, referenceDate = new Date()): Promise<StudentProfileOverview> {
  const student = await prisma.aluno.findUnique({
    where: { id },
    select: {
      id: true,
      nomeCompleto: true,
      telefone: true,
      status: true,
      vencimentoDia: true,
      dataInicio: true,
      dataSaidaCancelamento: true,
      createdAt: true,
      observacoes: true,
      modalidade: { select: { id: true, nome: true } },
      periodosMatricula: {
        select: {
          id: true, dataInicio: true, dataSaida: true, valorMensal: true,
          usarValorPadrao: true, diaVencimento: true,
          modalidade: { select: { id: true, nome: true } }
        },
        orderBy: [{ dataInicio: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }]
      }
    }
  });
  if (!student) throw new StudentProfileNotFoundError("Aluno não encontrado");

  const academy = getAcademyDateContext(referenceDate);
  const periods = student.periodosMatricula ?? [];
  const activePeriod = periods.find((period) => {
    const date = civilDateToPrisma(academy.dateKey);
    return (!period.dataInicio || period.dataInicio <= date) && (!period.dataSaida || period.dataSaida >= date);
  }) ?? null;
  const displayPeriod = activePeriod ?? periods[0] ?? null;
  // Undefined is only possible in isolated legacy mocks; real Prisma always returns the selected relation.
  const activeEnrollment = student.periodosMatricula === undefined ? student.status === AlunoStatus.ATIVO : Boolean(activePeriod);
  const hasOpenEnrollment = student.periodosMatricula === undefined ? student.status === AlunoStatus.ATIVO : periods.some((period) => period.dataSaida === null);
  const capabilities = studentProfileCapabilities(role, student.status, hasOpenEnrollment);
  const attendanceMonth = civilMonthRange(academy.competencia);
  const last30DaysStart = civilDateToPrisma(addCivilDays(academy.dateKey, -29));
  const attendanceDayEnd = civilDateToPrisma(addCivilDays(academy.dateKey, 1));

  const [lastAttendance, attendanceThisMonth, attendanceLast30Days, currentMonthly, openMonthlyCount, partialMonthlyCount, lastPaidMonthly] = await Promise.all([
    capabilities.viewAttendance
      ? prisma.presenca.findFirst({
          where: { alunoId: id, presente: true },
          select: { data: true },
          orderBy: [{ data: "desc" }, { createdAt: "desc" }]
        })
      : null,
    capabilities.viewAttendance
      ? prisma.presenca.count({ where: { alunoId: id, presente: true, data: { gte: attendanceMonth.start, lt: attendanceMonth.end } } })
      : null,
    capabilities.viewAttendance
      ? prisma.presenca.count({ where: { alunoId: id, presente: true, data: { gte: last30DaysStart, lt: attendanceDayEnd } } })
      : null,
    capabilities.viewFinancial
      ? prisma.mensalidade.findUnique({
          where: { alunoId_competencia: { alunoId: id, competencia: academy.competencia } },
          select: { competencia: true, valor: true, vencimento: true, dataPagamento: true, status: true }
        })
      : null,
    capabilities.viewFinancial
      ? prisma.mensalidade.count({
          where: { alunoId: id, status: { in: [MensalidadeStatus.PENDENTE, MensalidadeStatus.ATRASADO, MensalidadeStatus.PARCIAL] } }
        })
      : null,
    capabilities.viewFinancial
      ? prisma.mensalidade.count({ where: { alunoId: id, status: MensalidadeStatus.PARCIAL } })
      : null,
    capabilities.viewFinancial
      ? prisma.mensalidade.findFirst({
          where: { alunoId: id, dataPagamento: { not: null } },
          select: { dataPagamento: true },
          orderBy: { dataPagamento: "desc" }
        })
      : null
  ]);

  return {
    student: {
      id: student.id,
      name: student.nomeCompleto,
      phone: student.telefone,
      status: student.status,
      dueDay: student.vencimentoDia,
      startDate: iso(student.dataInicio),
      exitDate: iso(student.dataSaidaCancelamento),
      createdAt: student.createdAt.toISOString(),
      notes: student.observacoes,
      modality: student.modalidade ? { id: student.modalidade.id, name: student.modalidade.nome } : null
      ,activeEnrollment,
      hasOpenEnrollment,
      enrollment: displayPeriod ? {
        id: displayPeriod.id,
        startDate: displayPeriod.dataInicio ? prismaDateToCivil(displayPeriod.dataInicio) : null,
        exitDate: displayPeriod.dataSaida ? prismaDateToCivil(displayPeriod.dataSaida) : null,
        monthlyValue: displayPeriod.valorMensal === null ? null : Number(displayPeriod.valorMensal),
        useDefaultValue: displayPeriod.usarValorPadrao,
        dueDay: displayPeriod.diaVencimento,
        modality: displayPeriod.modalidade ? { id: displayPeriod.modalidade.id, name: displayPeriod.modalidade.nome } : null
      } : null
    },
    summary: {
      ...(capabilities.viewAttendance ? {
        attendance: {
          lastAttendanceAt: lastAttendance?.data ? prismaDateToCivil(lastAttendance.data) : null,
          thisMonth: attendanceThisMonth ?? 0,
          last30Days: attendanceLast30Days ?? 0
        }
      } : {}),
      ...(capabilities.viewFinancial ? {
        financial: {
          status: financialStatusFromOpenCount(openMonthlyCount ?? 0, activeEnrollment, partialMonthlyCount ?? 0),
          currentMonthly: currentMonthly ? {
            competence: currentMonthly.competencia,
            value: Number(currentMonthly.valor),
            status: currentMonthly.status,
            dueAt: currentMonthly.vencimento.toISOString(),
            paidAt: iso(currentMonthly.dataPagamento)
          } : null,
          openCount: openMonthlyCount ?? 0,
          lastPaymentAt: iso(lastPaidMonthly?.dataPagamento),
          nextDueAt: activeEnrollment ? iso(currentMonthly?.vencimento) : null
        }
      } : {})
    },
    capabilities
  };
}

async function ensureStudent(id: string) {
  const exists = await prisma.aluno.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new StudentProfileNotFoundError("Aluno não encontrado");
}

export async function getStudentProfileFinancial(id: string) {
  await ensureStudent(id);
  const [monthlyRows, paymentRows] = await Promise.all([
    prisma.mensalidade.findMany({
      where: { alunoId: id },
      select: { id: true, competencia: true, valor: true, vencimento: true, dataPagamento: true, formaPagamento: true, status: true },
      orderBy: [{ competencia: "desc" }, { vencimento: "desc" }],
      take: 12
    }),
    prisma.pagamento.findMany({
      where: { alunoId: id },
      select: {
        id: true,
        valor: true,
        dataPagamento: true,
        formaPagamento: true,
        status: true,
        mensalidade: { select: { competencia: true } }
      },
      orderBy: [{ dataPagamento: "desc" }, { createdAt: "desc" }],
      take: 12
    })
  ]);
  return {
    monthly: monthlyRows.map((item) => ({
      id: item.id,
      competence: item.competencia,
      value: Number(item.valor),
      dueAt: item.vencimento.toISOString(),
      paidAt: iso(item.dataPagamento),
      paymentMethod: item.formaPagamento,
      status: item.status
    })),
    payments: paymentRows.map((item) => ({
      id: item.id,
      value: Number(item.valor),
      paidAt: item.dataPagamento.toISOString(),
      paymentMethod: item.formaPagamento,
      status: item.status,
      competence: item.mensalidade?.competencia ?? null
    })),
    limits: { monthly: 12, payments: 12 }
  };
}

export async function getStudentProfileAttendance(id: string, referenceDate = new Date()) {
  await ensureStudent(id);
  const academy = getAcademyDateContext(referenceDate);
  const periodStart = civilDateToPrisma(addCivilDays(academy.dateKey, -59));
  const periodEnd = civilDateToPrisma(addCivilDays(academy.dateKey, 1));
  const rows = await prisma.presenca.findMany({
    where: { alunoId: id, presente: true, data: { gte: periodStart, lt: periodEnd } },
    select: { id: true, data: true, horario: true, tipoAula: true },
    orderBy: [{ data: "desc" }, { horario: "desc" }],
    take: 61
  });
  return {
    items: rows.slice(0, 60).map((item) => ({
      id: item.id,
      date: prismaDateToCivil(item.data),
      time: item.horario,
      classType: item.tipoAula
    })),
    periodDays: 60,
    hasMore: rows.length > 60
  };
}

export async function getStudentProfileHistory(id: string) {
  const student = await prisma.aluno.findUnique({
    where: { id },
    select: {
      id: true, createdAt: true, status: true, dataSaidaCancelamento: true,
      periodosMatricula: {
        select: {
          id: true, dataInicio: true, dataSaida: true, valorMensal: true,
          usarValorPadrao: true, diaVencimento: true,
          modalidade: { select: { id: true, nome: true } }
        },
        orderBy: [{ dataInicio: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }]
      }
    }
  });
  if (!student) throw new StudentProfileNotFoundError("Aluno não encontrado");
  const rows = await prisma.historicoPlano.findMany({
    where: { alunoId: id },
    select: { id: true, modalidadeAnterior: true, modalidadeNova: true, dataMudanca: true, observacao: true },
    orderBy: { dataMudanca: "desc" },
    take: 21
  });
  return {
    registration: { occurredAt: student.createdAt.toISOString(), type: "REGISTRATION" as const },
    currentExit: student.dataSaidaCancelamento
      ? { occurredAt: student.dataSaidaCancelamento.toISOString(), type: "CURRENT_EXIT" as const, status: student.status }
      : null,
    planChanges: rows.slice(0, 20).map((item) => ({
      id: item.id,
      occurredAt: item.dataMudanca.toISOString(),
      previousModality: item.modalidadeAnterior,
      newModality: item.modalidadeNova,
      note: item.observacao
    })),
    enrollments: (student.periodosMatricula ?? []).map((period) => ({
      id: period.id,
      startDate: period.dataInicio ? prismaDateToCivil(period.dataInicio) : null,
      exitDate: period.dataSaida ? prismaDateToCivil(period.dataSaida) : null,
      modality: period.modalidade?.nome ?? null,
      monthlyValue: period.valorMensal === null ? null : Number(period.valorMensal),
      useDefaultValue: period.usarValorPadrao,
      dueDay: period.diaVencimento
    })),
    hasMore: rows.length > 20
  };
}
