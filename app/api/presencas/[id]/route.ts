import { NextRequest } from "next/server";
import { CivilDateValidationError } from "@/lib/attendance-date";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import {
  AttendanceNotFoundError,
  AttendancePermissionError,
  AttendanceValidationError,
  confirmAttendanceById,
  removeAttendance
} from "@/lib/services/attendance";

function attendanceFailure(error: unknown) {
  if (error instanceof AttendanceValidationError || error instanceof CivilDateValidationError) return fail(error.message, 400);
  if (error instanceof AttendancePermissionError) return fail(error.message, 403);
  if (error instanceof AttendanceNotFoundError) return fail(error.message, 404);
  return fail("Não foi possível alterar presença", 500);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireCapability(request, "attendance.write");
  if (auth instanceof Response) return auth;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.presente !== true || Object.keys(body).some((key) => key !== "presente")) {
    return fail("A atualização aceita somente presente=true", 400);
  }
  const { id } = await context.params;
  try {
    return ok({ item: await confirmAttendanceById(id, { id: auth.id, role: auth.role }) });
  } catch (error) {
    return attendanceFailure(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireCapability(request, "attendance.write");
  if (auth instanceof Response) return auth;
  const { id } = await context.params;
  try {
    await removeAttendance(id, { id: auth.id, role: auth.role });
    return ok({ ok: true });
  } catch (error) {
    return attendanceFailure(error);
  }
}
