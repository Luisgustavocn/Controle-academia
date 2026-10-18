import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { PersonalScheduleError, serializeScheduleRecord, updatePersonalSchedule } from "@/lib/services/personal-schedule";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireCapability(request, "schedule.write");
  if (auth instanceof Response) return auth;
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return fail("Payload inválido", 400);
  try {
    const updated = await updatePersonalSchedule(id, body, auth.id);
    return ok({ item: serializeScheduleRecord(updated) });
  } catch (error) {
    if (error instanceof PersonalScheduleError) return fail(error.message, error.status);
    throw error;
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireCapability(request, "schedule.write");
  if (auth instanceof Response) return auth;
  const { id } = await context.params;
  const previous = await prisma.agendaPersonal.findUnique({ where: { id } });
  if (!previous) return fail("Agendamento não encontrado", 404);
  await prisma.$transaction(async (tx) => {
    await tx.agendaPersonal.delete({ where: { id } });
    await logAudit({ userId: auth.id, modulo: "agenda-personal", entidade: "AgendaPersonal", entidadeId: id, acao: "DELETE", antes: previous }, tx);
  });
  return ok({ ok: true });
}
