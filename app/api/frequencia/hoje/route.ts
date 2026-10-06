import { NextRequest } from "next/server";
import { CivilDateValidationError, academyToday, compareCivilDates } from "@/lib/attendance-date";
import { hasCapability } from "@/lib/auth/capabilities";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { getAttendanceRoster, parseAttendanceRosterParams } from "@/lib/services/attendance-workspace";

export async function GET(request: NextRequest) {
  const auth = requireCapability(request, "attendance.read");
  if (auth instanceof Response) return auth;

  try {
    const params = parseAttendanceRosterParams(request.nextUrl.searchParams);
    if (compareCivilDates(params.date, academyToday()) < 0 && !hasCapability(auth.role, "attendance.retroactive")) {
      return fail("Sem permissão para consultar o lançamento retroativo", 403);
    }
    return ok(await getAttendanceRoster(params));
  } catch (error) {
    if (error instanceof CivilDateValidationError) return fail(error.message, 400);
    return fail("Não foi possível carregar a presença operacional", 500);
  }
}
