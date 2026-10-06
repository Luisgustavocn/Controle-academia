import { AlunoStatus, MensalidadeStatus, Prisma, UserRole } from "@prisma/client";
import { hasCapability } from "@/lib/auth/capabilities";
import { prisma } from "@/lib/prisma";
import { academyToday, civilDateToPrisma, prismaDateToCivil } from "@/lib/attendance-date";
import { studentActiveOnDateWhere } from "@/lib/services/enrollment-periods";

export const STUDENT_PAGE_SIZES = [10, 20, 50] as const;
export const STUDENT_SORTS = ["name.asc", "name.desc", "status.asc", "dueDay.asc", "dueDay.desc"] as const;
export const STUDENT_FINANCIAL_FILTERS = ["EM_DIA", "INADIMPLENTE"] as const;

export type StudentSort = (typeof STUDENT_SORTS)[number];
export type StudentFinancialFilter = (typeof STUDENT_FINANCIAL_FILTERS)[number];

export type StudentListParams = {
  page: number;
  pageSize: (typeof STUDENT_PAGE_SIZES)[number];
  q: string;
  status: AlunoStatus | "";
  modalidadeId: string;
  financial: StudentFinancialFilter | "";
  sort: StudentSort;
};

export class StudentListValidationError extends Error {}

function enumValue<T extends string>(value: string, values: readonly T[], field: string): T | "" {
  if (!value) return "";
  if (!values.includes(value as T)) throw new StudentListValidationError(`${field} inválido`);
  return value as T;
}

export function parseStudentListParams(searchParams: URLSearchParams): StudentListParams {
  const rawPage = searchParams.get("page") ?? "1";
  const rawPageSize = searchParams.get("pageSize") ?? "20";
  const page = Number(rawPage);
  const pageSize = Number(rawPageSize);
  if (!Number.isInteger(page) || page < 1) throw new StudentListValidationError("page inválida");
  if (!STUDENT_PAGE_SIZES.includes(pageSize as StudentListParams["pageSize"])) {
    throw new StudentListValidationError("pageSize inválido");
  }

  return {
    page,
    pageSize: pageSize as StudentListParams["pageSize"],
    q: (searchParams.get("q") ?? "").trim().slice(0, 120),
    status: enumValue((searchParams.get("status") ?? "").toUpperCase(), Object.values(AlunoStatus), "status"),
    modalidadeId: (searchParams.get("modalidadeId") ?? "").trim(),
    financial: enumValue((searchParams.get("financial") ?? "").toUpperCase(), STUDENT_FINANCIAL_FILTERS, "financial"),
    sort: enumValue(searchParams.get("sort") ?? "name.asc", STUDENT_SORTS, "sort") || "name.asc"
  };
}

export function buildStudentWhere(params: StudentListParams, dateKey = academyToday()): Prisma.AlunoWhereInput {
  const filters: Prisma.AlunoWhereInput[] = [];
  if (params.q) {
    filters.push({
      OR: [
        { nomeCompleto: { contains: params.q, mode: Prisma.QueryMode.insensitive } },
        { telefone: { contains: params.q, mode: Prisma.QueryMode.insensitive } }
      ]
    });
  }
  if (params.status === AlunoStatus.ATIVO) {
    filters.push(studentActiveOnDateWhere(dateKey));
  } else if (params.status === AlunoStatus.INATIVO) {
    filters.push({
      AND: [
        { NOT: studentActiveOnDateWhere(dateKey) },
        { status: { in: [AlunoStatus.ATIVO, AlunoStatus.INATIVO] } }
      ]
    });
  } else if (params.status) {
    filters.push({ status: params.status, NOT: studentActiveOnDateWhere(dateKey) });
  }
  if (params.modalidadeId) filters.push({ modalidadeId: params.modalidadeId });
  if (params.financial === "INADIMPLENTE") {
    filters.push({ mensalidades: { some: { status: { in: [MensalidadeStatus.PENDENTE, MensalidadeStatus.ATRASADO, MensalidadeStatus.PARCIAL] } } } });
  } else if (params.financial === "EM_DIA") {
    filters.push({ mensalidades: { none: { status: { in: [MensalidadeStatus.PENDENTE, MensalidadeStatus.ATRASADO, MensalidadeStatus.PARCIAL] } } } });
  }
  return filters.length ? { AND: filters } : {};
}

export function buildStudentOrderBy(sort: StudentSort): Prisma.AlunoOrderByWithRelationInput[] {
  switch (sort) {
    case "name.desc": return [{ nomeCompleto: "desc" }, { id: "asc" }];
    case "status.asc": return [{ status: "asc" }, { nomeCompleto: "asc" }, { id: "asc" }];
    case "dueDay.asc": return [{ vencimentoDia: "asc" }, { nomeCompleto: "asc" }, { id: "asc" }];
    case "dueDay.desc": return [{ vencimentoDia: "desc" }, { nomeCompleto: "asc" }, { id: "asc" }];
    default: return [{ nomeCompleto: "asc" }, { id: "asc" }];
  }
}

export function canViewStudentFinancial(role: UserRole) {
  return hasCapability(role, "finance.monthlies.read");
}

export async function listStudents(params: StudentListParams, role: UserRole) {
  const showFinancial = canViewStudentFinancial(role);
  if (params.financial && !showFinancial) {
    throw new StudentListValidationError("Filtro financeiro não permitido para este perfil");
  }

  const where = buildStudentWhere(params);
  const today = civilDateToPrisma(academyToday());
  const [totalItems, students, modalidades] = await Promise.all([
    prisma.aluno.count({ where }),
    prisma.aluno.findMany({
      where,
      select: {
        id: true,
        nomeCompleto: true,
        telefone: true,
        status: true,
        vencimentoDia: true,
        modalidade: { select: { id: true, nome: true } },
        periodosMatricula: {
          select: { id: true, dataInicio: true, dataSaida: true, diaVencimento: true, modalidade: { select: { id: true, nome: true } } },
          orderBy: [{ dataInicio: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }]
        }
      },
      orderBy: buildStudentOrderBy(params.sort),
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize
    }),
    prisma.modalidade.findMany({
      select: { id: true, nome: true, ativa: true },
      orderBy: { nome: "asc" }
    })
  ]);

  const studentIds = students.map((student) => student.id);
  const [lastAttendance, financialCounts] = studentIds.length
    ? await Promise.all([
        prisma.presenca.groupBy({
          by: ["alunoId"],
          where: { alunoId: { in: studentIds }, presente: true },
          _max: { data: true }
        }),
        showFinancial
          ? prisma.mensalidade.groupBy({
              by: ["alunoId"],
              where: {
                alunoId: { in: studentIds },
                status: { in: [MensalidadeStatus.PENDENTE, MensalidadeStatus.ATRASADO, MensalidadeStatus.PARCIAL] }
              },
              _count: { _all: true }
            })
          : Promise.resolve([])
      ])
    : [[], []] as const;

  const attendanceByStudent = new Map(lastAttendance.map((item) => [item.alunoId, item._max.data]));
  const financialByStudent = new Map(financialCounts.map((item) => [item.alunoId, item._count._all]));
  const totalPages = Math.max(1, Math.ceil(totalItems / params.pageSize));

  return {
    items: students.map((student) => {
      const activePeriod = student.periodosMatricula.find((period) =>
        (!period.dataInicio || period.dataInicio <= today) && (!period.dataSaida || period.dataSaida >= today)
      );
      const displayPeriod = activePeriod ?? student.periodosMatricula[0];
      const hasDebt = (financialByStudent.get(student.id) ?? 0) > 0;
      return {
      id: student.id,
      name: student.nomeCompleto,
      phone: student.telefone,
      status: activePeriod ? AlunoStatus.ATIVO : (student.status === AlunoStatus.ATIVO ? AlunoStatus.INATIVO : student.status),
      activeEnrollment: Boolean(activePeriod),
      dueDay: displayPeriod?.diaVencimento ?? student.vencimentoDia,
      modality: displayPeriod?.modalidade
        ? { id: displayPeriod.modalidade.id, name: displayPeriod.modalidade.nome }
        : student.modalidade ? { id: student.modalidade.id, name: student.modalidade.nome } : null,
      lastAttendanceAt: attendanceByStudent.get(student.id) ? prismaDateToCivil(attendanceByStudent.get(student.id)!) : null,
      ...(showFinancial
        ? { financialStatus: activePeriod ? (hasDebt ? "EM_ATRASO" as const : "EM_DIA" as const) : (hasDebt ? "COM_PENDENCIA" as const : "SEM_PENDENCIAS" as const) }
        : {})
    };}),
    pagination: {
      page: Math.min(params.page, totalPages),
      pageSize: params.pageSize,
      totalItems,
      totalPages
    },
    facets: {
      modalidades: modalidades.map((item) => ({ id: item.id, name: item.nome, active: item.ativa }))
    },
    visibility: { financial: showFinancial }
  };
}
