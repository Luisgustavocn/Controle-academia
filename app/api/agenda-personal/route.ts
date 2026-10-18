import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { createPersonalSchedule, PersonalScheduleError, serializeScheduleRecord, type ScheduleInput } from "@/lib/services/personal-schedule";

export async function GET(request: NextRequest) {
  const auth = requireCapability(request, "schedule.read");
  if (auth instanceof Response) return auth;
  const professor = request.nextUrl.searchParams.get("professor")?.trim();
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const rows = await prisma.agendaPersonal.findMany({
    where: {
      ...(professor ? { professor } : {}),
      ...(q ? { OR: [
        { professor: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { alunoNome: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { aluno: { nomeCompleto: { contains: q, mode: Prisma.QueryMode.insensitive } } }
      ] } : {})
    },
    include: { aluno: { select: { nomeCompleto: true } } },
    orderBy: [{ data: { sort: "asc", nulls: "last" } }, { semanaRef: "asc" }, { diaSemana: "asc" }, { horario: "asc" }]
  });
  return ok({ items: rows.map(serializeScheduleRecord) });
}

export async function POST(request: NextRequest) {
  const auth = requireCapability(request, "schedule.write");
  if (auth instanceof Response) return auth;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return fail("Payload inválido", 400);
  try {
    const created = await createPersonalSchedule(body as unknown as ScheduleInput, auth.id);
    return ok({ item: serializeScheduleRecord(created) }, 201);
  } catch (error) {
    if (error instanceof PersonalScheduleError) return fail(error.message, error.status);
    throw error;
  }
}
