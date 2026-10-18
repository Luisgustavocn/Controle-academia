import { AlunoStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { createBackupFile } from "@/lib/services/backup";
import { academyToday, civilDateToPrisma, CivilDateValidationError, parseCivilDate } from "@/lib/attendance-date";
import { StudentDeletionBlockedError, StudentDeletionNotFoundError, deleteStudentWithoutHistory, inspectStudentDeletion } from "@/lib/services/student-deletion";
import {
  StudentRegistrationNotFoundError,
  updateStudentRegistration
} from "@/lib/services/student-registration";

const ALUNO_STATUS_VALUES = new Set<AlunoStatus>(Object.values(AlunoStatus));

function toDateInputValue(date: Date | null | undefined) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function parseOptionalDate(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  try { return civilDateToPrisma(parseCivilDate(String(value))); }
  catch { throw new CivilDateValidationError(`${fieldName} inválida`); }
}

function parseOptionalBirthDate(value: unknown) {
  const parsed = parseOptionalDate(value, "data de nascimento");
  if (parsed && parsed > civilDateToPrisma(academyToday())) {
    throw new CivilDateValidationError("Data de nascimento não pode ser futura");
  }
  return parsed;
}

function parseOptionalNumber(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${fieldName} inválido`);
  return parsed;
}

function parseBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("regra de valor padrão inválida");
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireCapability(request, "students.update");
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const aluno = await prisma.aluno.findUnique({
    where: { id },
    select: {
      id: true,
      nomeCompleto: true,
      telefone: true,
      modalidadeId: true,
      vencimentoDia: true,
      status: true,
      dataInicio: true,
      valorMensal: true,
      usarValorPadrao: true,
      dataSaidaCancelamento: true,
      dataNascimento: true,
      fotoPath: true,
      observacoes: true
    }
  });

  if (!aluno) return fail("Aluno não encontrado", 404);
  return ok({
    item: {
      id: aluno.id,
      nomeCompleto: aluno.nomeCompleto,
      telefone: aluno.telefone,
      modalidadeId: aluno.modalidadeId ?? "",
      vencimentoDia: String(aluno.vencimentoDia),
      status: aluno.status,
      dataInicio: toDateInputValue(aluno.dataInicio),
      dataSaidaCancelamento: toDateInputValue(aluno.dataSaidaCancelamento),
      dataNascimento: toDateInputValue(aluno.dataNascimento),
      fotoPath: aluno.fotoPath ?? "",
      observacoes: aluno.observacoes ?? "",
      valorMensal: aluno.valorMensal === null ? "" : String(aluno.valorMensal),
      usarValorPadrao: aluno.usarValorPadrao
    }
  });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireCapability(request, "students.update");
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const body = (await request.json()) as Record<string, unknown>;
  let dataSaidaCancelamento: Date | null | undefined = undefined;
  let dataInicio: Date | null | undefined = undefined;
  let valorMensal: number | null | undefined = undefined;
  let usarValorPadrao: boolean | undefined = undefined;
  let dataNascimento: Date | null | undefined = undefined;
  const statusInformado = body.status ? (String(body.status).toUpperCase() as AlunoStatus) : undefined;
  if (statusInformado && !ALUNO_STATUS_VALUES.has(statusInformado)) return fail("status do aluno inválido", 400);

  try {
    if ("dataSaidaCancelamento" in body) {
      dataSaidaCancelamento = parseOptionalDate(body.dataSaidaCancelamento, "data de saída/cancelamento");
    }
    if ("dataInicio" in body) dataInicio = parseOptionalDate(body.dataInicio, "data de início");
    if ("valorMensal" in body) valorMensal = parseOptionalNumber(body.valorMensal, "valor mensal");
    if ("usarValorPadrao" in body) usarValorPadrao = parseBoolean(body.usarValorPadrao);
    if ("dataNascimento" in body) dataNascimento = parseOptionalBirthDate(body.dataNascimento);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Dados do aluno inválidos", 400);
  }

  const hasDataSaidaPayload = "dataSaidaCancelamento" in body;
  let result;
  try {
    result = await updateStudentRegistration(id, {
      nomeCompleto: body.nomeCompleto ? String(body.nomeCompleto) : undefined,
      telefone: body.telefone ? String(body.telefone) : undefined,
      modalidadeId: body.modalidadeId === "" ? null : (body.modalidadeId as string | undefined),
      vencimentoDia: body.vencimentoDia ? Math.min(31, Math.max(1, Number(body.vencimentoDia))) : undefined,
      status: statusInformado,
      dataInicio,
      valorMensal,
      usarValorPadrao,
      dataSaidaCancelamento,
      hasDataSaidaPayload,
      observacoes: body.observacoes === "" ? null : (body.observacoes as string | undefined),
      dataNascimento
    }, { id: auth.id, name: auth.name });
  } catch (error) {
    if (error instanceof StudentRegistrationNotFoundError) {
      return fail("Aluno não encontrado", 404);
    }
    throw error;
  }

  const { updated } = result;

  return ok({ item: updated });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireCapability(request, "students.delete");
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  try {
    const inspection = await inspectStudentDeletion(id);
    if (!inspection.canDelete) throw new StudentDeletionBlockedError(inspection.dependencies);
    const backup = await createBackupFile();
    await deleteStudentWithoutHistory(id, { id: auth.id, name: auth.name });
    return ok({ ok: true, deleted: true, message: "Aluno excluído com sucesso", backupFilePath: backup.filePath });
  } catch (error) {
    if (error instanceof StudentDeletionNotFoundError) return fail(error.message, 404);
    if (error instanceof StudentDeletionBlockedError) return fail(error.message, 409, { dependencies: error.dependencies });
    throw error;
  }
}
