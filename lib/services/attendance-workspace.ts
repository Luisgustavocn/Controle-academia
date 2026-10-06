import { AlunoStatus, Prisma, type PrismaClient } from "@prisma/client";
import {
  academyToday,
  addCivilDays,
  CivilDateValidationError,
  civilDateToPrisma,
  civilMonthRange,
  compareCivilDates,
  parseCivilDate,
  prismaDateToCivil
} from "@/lib/attendance-date";
import { prisma } from "@/lib/prisma";

const ROSTER_PAGE_SIZES = [12, 24, 48] as const;
const HISTORY_PAGE_SIZES = [10, 20, 50] as const;

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function allowedPageSize<const T extends readonly number[]>(value: string | null, allowed: T, fallback: T[number]) {
  const parsed = Number(value);
  return allowed.includes(parsed as T[number]) ? parsed as T[number] : fallback;
}

function normalizedQuery(value: string | null) {
  return (value ?? "").trim().slice(0, 80);
}

export type AttendanceRosterParams = {
  date: string;
  q: string;
  page: number;
  pageSize: (typeof ROSTER_PAGE_SIZES)[number];
};

export function parseAttendanceRosterParams(searchParams: URLSearchParams, referenceDate = new Date()): AttendanceRosterParams {
  const today = academyToday(referenceDate);
  const date = searchParams.get("data") ? parseCivilDate(searchParams.get("data")) : today;
  if (compareCivilDates(date, today) > 0) {
    throw new CivilDateValidationError("Não é permitido consultar presença operacional em data futura");
  }
  return {
    date,
    q: normalizedQuery(searchParams.get("q")),
    page: positiveInteger(searchParams.get("page"), 1),
    pageSize: allowedPageSize(searchParams.get("pageSize"), ROSTER_PAGE_SIZES, 12)
  };
}

export async function getAttendanceRoster(params: AttendanceRosterParams, client: PrismaClient = prisma) {
  const date = civilDateToPrisma(params.date);
  const search: Prisma.AlunoWhereInput = params.q
    ? {
        OR: [
          { nomeCompleto: { contains: params.q, mode: Prisma.QueryMode.insensitive } },
          { telefone: { contains: params.q } }
        ]
      }
    : {};
  const where: Prisma.AlunoWhereInput = { status: AlunoStatus.ATIVO, ...search };

  const [activeStudents, presentToday, totalItems, students] = await Promise.all([
    client.aluno.count({ where: { status: AlunoStatus.ATIVO } }),
    client.presenca.count({ where: { data: date, presente: true, aluno: { status: AlunoStatus.ATIVO } } }),
    client.aluno.count({ where }),
    client.aluno.findMany({
      where,
      select: {
        id: true,
        nomeCompleto: true,
        telefone: true,
        modalidade: { select: { nome: true } }
      },
      orderBy: { nomeCompleto: "asc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize
    })
  ]);

  const presences = students.length
    ? await client.presenca.findMany({
        where: { alunoId: { in: students.map((student) => student.id) }, data: date, presente: true },
        select: { id: true, alunoId: true, horario: true, tipoAula: true }
      })
    : [];
  const presenceByStudent = new Map(presences.map((presence) => [presence.alunoId, presence]));
  const totalPages = Math.max(1, Math.ceil(totalItems / params.pageSize));

  return {
    date: params.date,
    summary: {
      activeStudents,
      presentStudents: presentToday,
      attendanceRate: activeStudents ? Math.round((presentToday / activeStudents) * 100) : 0
    },
    items: students.map((student) => {
      const presence = presenceByStudent.get(student.id);
      return {
        id: student.id,
        name: student.nomeCompleto,
        phone: student.telefone,
        modality: student.modalidade?.nome ?? "Sem modalidade",
        attendance: presence
          ? { id: presence.id, time: presence.horario, classType: presence.tipoAula }
          : null
      };
    }),
    pagination: {
      page: Math.min(params.page, totalPages),
      pageSize: params.pageSize,
      totalItems,
      totalPages
    }
  };
}

export type AttendanceHistoryParams = {
  from: string;
  to: string;
  q: string;
  alunoId: string;
  page: number;
  pageSize: (typeof HISTORY_PAGE_SIZES)[number];
};

export function parseAttendanceHistoryParams(searchParams: URLSearchParams, referenceDate = new Date()): AttendanceHistoryParams {
  const competencia = searchParams.get("competencia")?.trim() || academyToday(referenceDate).slice(0, 7);
  const month = civilMonthRange(competencia);
  const from = searchParams.get("de") ? parseCivilDate(searchParams.get("de")) : prismaDateToCivil(month.start);
  const to = searchParams.get("ate") ? parseCivilDate(searchParams.get("ate")) : addCivilDays(prismaDateToCivil(month.end), -1);
  if (compareCivilDates(from, to) > 0) throw new CivilDateValidationError("O início do período deve ser anterior ao fim");

  return {
    from,
    to,
    q: normalizedQuery(searchParams.get("q")),
    alunoId: (searchParams.get("alunoId") ?? "").trim(),
    page: positiveInteger(searchParams.get("page"), 1),
    pageSize: allowedPageSize(searchParams.get("pageSize"), HISTORY_PAGE_SIZES, 20)
  };
}

export async function getAttendanceHistory(params: AttendanceHistoryParams, client: PrismaClient = prisma) {
  const where: Prisma.PresencaWhereInput = {
    presente: true,
    data: {
      gte: civilDateToPrisma(params.from),
      lt: civilDateToPrisma(addCivilDays(params.to, 1))
    },
    ...(params.alunoId ? { alunoId: params.alunoId } : {}),
    ...(params.q
      ? {
          aluno: {
            OR: [
              { nomeCompleto: { contains: params.q, mode: Prisma.QueryMode.insensitive } },
              { telefone: { contains: params.q } }
            ]
          }
        }
      : {})
  };
  const [totalItems, rows] = await Promise.all([
    client.presenca.count({ where }),
    client.presenca.findMany({
      where,
      select: {
        id: true,
        data: true,
        horario: true,
        tipoAula: true,
        aluno: { select: { id: true, nomeCompleto: true, telefone: true, modalidade: { select: { nome: true } } } }
      },
      orderBy: [{ data: "desc" }, { createdAt: "desc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize
    })
  ]);
  const totalPages = Math.max(1, Math.ceil(totalItems / params.pageSize));

  return {
    period: { from: params.from, to: params.to },
    items: rows.map((row) => ({
      id: row.id,
      date: prismaDateToCivil(row.data),
      time: row.horario,
      classType: row.tipoAula,
      student: {
        id: row.aluno.id,
        name: row.aluno.nomeCompleto,
        phone: row.aluno.telefone,
        modality: row.aluno.modalidade?.nome ?? "Sem modalidade"
      }
    })),
    pagination: {
      page: Math.min(params.page, totalPages),
      pageSize: params.pageSize,
      totalItems,
      totalPages
    }
  };
}
