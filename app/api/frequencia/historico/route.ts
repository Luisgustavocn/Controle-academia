import { NextRequest } from "next/server";
import { CivilDateValidationError } from "@/lib/attendance-date";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { getAttendanceHistory, parseAttendanceHistoryParams } from "@/lib/services/attendance-workspace";

export async function GET(request: NextRequest) {
  const auth = requireCapability(request, "attendance.read");
  if (auth instanceof Response) return auth;

  try {
    return ok(await getAttendanceHistory(parseAttendanceHistoryParams(request.nextUrl.searchParams)));
  } catch (error) {
    if (error instanceof CivilDateValidationError) return fail(error.message, 400);
    return fail("Não foi possível carregar o histórico de presença", 500);
  }
}
