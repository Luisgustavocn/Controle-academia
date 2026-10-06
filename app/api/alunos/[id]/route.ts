import { AlunoStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { cancelarMensalidadesFuturasDoAluno } from "@/lib/services/mensalidades";
import { createBackupFile } from "@/lib/services/backup";
import {
  StudentRegistrationNotFoundError,
  updateStudentRegistration
} from "@/lib/services/student-registration";

function toDateInputValue(date: Date | null | undefined) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function parseOptionalDate(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} inválida`);
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
  const statusInformado = body.status ? (String(body.status).toUpperCase() as AlunoStatus) : undefined;

  try {
    if ("dataSaidaCancelamento" in body) {
      dataSaidaCancelamento = parseOptionalDate(body.dataSaidaCancelamento, "data de saída/cancelamento");
    }
    if ("dataInicio" in body) dataInicio = parseOptionalDate(body.dataInicio, "data de início");
    if ("valorMensal" in body) valorMensal = parseOptionalNumber(body.valorMensal, "valor mensal");
    if ("usarValorPadrao" in body) usarValorPadrao = parseBoolean(body.usarValorPadrao);
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
      observacoes: body.observacoes === "" ? null : (body.observacoes as string | undefined)
    }, { id: auth.id, name: auth.name });
  } catch (error) {
    if (error instanceof StudentRegistrationNotFoundError) {
      return fail("Aluno não encontrado", 404);
    }
    throw error;
  }

  const { updated } = result;

  if (updated.status === AlunoStatus.CANCELADO || updated.status === AlunoStatus.TRANCADO) {
    const referenciaSaida = updated.dataSaidaCancelamento ?? new Date();
    await cancelarMensalidadesFuturasDoAluno(id, referenciaSaida);
  } else if (updated.dataSaidaCancelamento) {
    await cancelarMensalidadesFuturasDoAluno(id, updated.dataSaidaCancelamento);
  }

  return ok({ item: updated });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireCapability(request, "students.status");
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const previous = await prisma.aluno.findUnique({ where: { id } });
  if (!previous) {
    return fail("Aluno não encontrado", 404);
  }

  const backup = await createBackupFile();
  const dataSaida = previous.dataSaidaCancelamento ?? new Date();
  const updated = await prisma.aluno.update({
    where: { id },
    data: {
      status: AlunoStatus.CANCELADO,
      dataSaidaCancelamento: dataSaida
    }
  });

  await cancelarMensalidadesFuturasDoAluno(id, dataSaida);

  await logAudit({
    userId: auth.id,
    modulo: "alunos",
    entidade: "Aluno",
    entidadeId: id,
    acao: "ARCHIVE",
    antes: previous,
    depois: updated
  });

  return ok({ ok: true, archived: true, backupFilePath: backup.filePath });
}
