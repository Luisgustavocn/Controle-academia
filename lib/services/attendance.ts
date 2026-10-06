import { Prisma, type Presenca, type UserRole } from "@prisma/client";
import { hasCapability } from "@/lib/auth/capabilities";
import {
  academyToday,
  civilDateToPrisma,
  compareCivilDates,
  parseCivilDate,
  prismaDateToCivil
} from "@/lib/attendance-date";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { isStudentActiveOnDate } from "@/lib/services/enrollment-periods";

export class AttendanceValidationError extends Error {}
export class AttendanceNotFoundError extends Error {}
export class AttendancePermissionError extends Error {}

export type AttendanceActor = { id: string; role: UserRole };

export type AttendanceDto = {
  id: string;
  alunoId: string;
  data: string;
  horario: string | null;
  tipoAula: string;
  presente: boolean;
  observacao: string | null;
  createdAt: string;
};

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) throw new AttendanceValidationError(`texto excede ${maxLength} caracteres`);
  return normalized;
}

export function normalizeAttendanceTime(value: unknown): string | null {
  const normalized = normalizeOptionalText(value, 5);
  if (normalized === null) return null;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(normalized)) {
    throw new AttendanceValidationError("horario inválido. Use HH:mm");
  }
  return normalized;
}

export function assertAttendanceDateAllowed(role: UserRole, dateKey: string, referenceDate = new Date()): void {
  const requested = parseCivilDate(dateKey);
  const today = academyToday(referenceDate);
  const comparison = compareCivilDates(requested, today);
  if (comparison > 0) throw new AttendanceValidationError("Não é permitido registrar presença em data futura");
  if (comparison < 0 && !hasCapability(role, "attendance.retroactive")) {
    throw new AttendancePermissionError("Sem permissão para registrar ou corrigir presença retroativa");
  }
}

export function attendanceDto(record: Presenca): AttendanceDto {
  return {
    id: record.id,
    alunoId: record.alunoId,
    data: prismaDateToCivil(record.data),
    horario: record.horario,
    tipoAula: record.tipoAula,
    presente: record.presente,
    observacao: record.observacao,
    createdAt: record.createdAt.toISOString()
  };
}

function auditSnapshot(record: Presenca) {
  return {
    id: record.id,
    alunoId: record.alunoId,
    data: prismaDateToCivil(record.data),
    horario: record.horario,
    tipoAula: record.tipoAula,
    presente: record.presente
  };
}

function isDailyUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function confirmAttendance(
  input: { alunoId: unknown; data: unknown; horario?: unknown; tipoAula?: unknown; observacao?: unknown },
  actor: AttendanceActor,
  referenceDate = new Date()
): Promise<{ item: AttendanceDto; created: boolean }> {
  const alunoId = String(input.alunoId ?? "").trim();
  if (!alunoId) throw new AttendanceValidationError("alunoId é obrigatório");
  const data = parseCivilDate(input.data);
  assertAttendanceDateAllowed(actor.role, data, referenceDate);
  const horario = normalizeAttendanceTime(input.horario);
  const tipoAula = normalizeOptionalText(input.tipoAula, 80) ?? "musculacao";
  const observacao = normalizeOptionalText(input.observacao, 500);
  const prismaDate = civilDateToPrisma(data);

  const student = await prisma.aluno.findUnique({ where: { id: alunoId }, select: { id: true } });
  if (!student) throw new AttendanceNotFoundError("Aluno não encontrado");
  if (!await isStudentActiveOnDate(prisma, alunoId, data)) {
    throw new AttendanceValidationError("Aluno sem matrícula ativa nesta data");
  }

  try {
    const created = await prisma.$transaction(async (transaction) => {
      const record = await transaction.presenca.create({
        data: { alunoId, data: prismaDate, horario, tipoAula, presente: true, observacao }
      });
      await logAudit({
        userId: actor.id,
        modulo: "presencas",
        entidade: "presenca",
        entidadeId: record.id,
        acao: "CREATE",
        depois: auditSnapshot(record)
      }, transaction);
      return record;
    });
    return { item: attendanceDto(created), created: true };
  } catch (error) {
    if (!isDailyUniqueConflict(error)) throw error;
  }

  const existing = await prisma.presenca.findUnique({ where: { alunoId_data: { alunoId, data: prismaDate } } });
  if (!existing) throw new Error("Conflito de presença sem registro recuperável");
  if (existing.presente) return { item: attendanceDto(existing), created: false };

  const updated = await prisma.$transaction(async (transaction) => {
    const record = await transaction.presenca.update({ where: { id: existing.id }, data: { presente: true } });
    await logAudit({
      userId: actor.id,
      modulo: "presencas",
      entidade: "presenca",
      entidadeId: record.id,
      acao: "UPDATE",
      antes: auditSnapshot(existing),
      depois: auditSnapshot(record)
    }, transaction);
    return record;
  });
  return { item: attendanceDto(updated), created: false };
}

export async function confirmAttendanceById(id: string, actor: AttendanceActor, referenceDate = new Date()): Promise<AttendanceDto> {
  const existing = await prisma.presenca.findUnique({ where: { id } });
  if (!existing) throw new AttendanceNotFoundError("Presença não encontrada");
  assertAttendanceDateAllowed(actor.role, prismaDateToCivil(existing.data), referenceDate);
  if (existing.presente) return attendanceDto(existing);

  const updated = await prisma.$transaction(async (transaction) => {
    const record = await transaction.presenca.update({ where: { id }, data: { presente: true } });
    await logAudit({
      userId: actor.id,
      modulo: "presencas",
      entidade: "presenca",
      entidadeId: id,
      acao: "UPDATE",
      antes: auditSnapshot(existing),
      depois: auditSnapshot(record)
    }, transaction);
    return record;
  });
  return attendanceDto(updated);
}

export async function removeAttendance(id: string, actor: AttendanceActor, referenceDate = new Date()): Promise<void> {
  const existing = await prisma.presenca.findUnique({ where: { id } });
  if (!existing) throw new AttendanceNotFoundError("Presença não encontrada");
  assertAttendanceDateAllowed(actor.role, prismaDateToCivil(existing.data), referenceDate);

  await prisma.$transaction(async (transaction) => {
    await transaction.presenca.delete({ where: { id } });
    await logAudit({
      userId: actor.id,
      modulo: "presencas",
      entidade: "presenca",
      entidadeId: id,
      acao: "DELETE",
      antes: auditSnapshot(existing)
    }, transaction);
  });
}
