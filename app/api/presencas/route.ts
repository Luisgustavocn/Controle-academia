import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { CivilDateValidationError, civilMonthRange, prismaDateToCivil } from "@/lib/attendance-date";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  AttendanceNotFoundError,
  AttendancePermissionError,
  AttendanceValidationError,
  confirmAttendance
} from "@/lib/services/attendance";

export async function GET(request: NextRequest) {
  const auth = requireCapability(request, "attendance.read");
  if (auth instanceof Response) return auth;

  const alunoId = request.nextUrl.searchParams.get("alunoId")?.trim() ?? "";
  const competencia = request.nextUrl.searchParams.get("competencia")?.trim() ?? "";
  const q = request.nextUrl.searchParams.get("q")?.trim().slice(0, 80) ?? "";
  try {
    const range = competencia ? civilMonthRange(competencia) : null;
    const items = await prisma.presenca.findMany({
      where: {
        ...(alunoId ? { alunoId } : {}),
        ...(range ? { data: { gte: range.start, lt: range.end } } : {}),
        ...(q ? { OR: [
          { tipoAula: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { horario: { contains: q, mode: Prisma.QueryMode.insensitive } }
        ] } : {})
      },
      include: { aluno: { select: { nomeCompleto: true, status: true } } },
      orderBy: [{ data: "desc" }, { createdAt: "desc" }]
    });
    return ok({ items: items.map((item) => ({ ...item, data: prismaDateToCivil(item.data) })) });
  } catch (error) {
    if (error instanceof CivilDateValidationError) return fail(error.message, 400);
    return fail("Não foi possível carregar presenças", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = requireCapability(request, "attendance.write");
  if (auth instanceof Response) return auth;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const result = await confirmAttendance({
      alunoId: body.alunoId,
      data: body.data,
      horario: body.horario,
      tipoAula: body.tipoAula,
      observacao: body.observacao
    }, { id: auth.id, role: auth.role });
    return ok(result, result.created ? 201 : 200);
  } catch (error) {
    if (error instanceof AttendanceValidationError || error instanceof CivilDateValidationError) return fail(error.message, 400);
    if (error instanceof AttendancePermissionError) return fail(error.message, 403);
    if (error instanceof AttendanceNotFoundError) return fail(error.message, 404);
    return fail("Não foi possível registrar presença", 500);
  }
}
