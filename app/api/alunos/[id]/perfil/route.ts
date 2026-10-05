import { NextRequest } from "next/server";
import { hasCapability } from "@/lib/auth/capabilities";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import {
  getStudentProfileAttendance,
  getStudentProfileFinancial,
  getStudentProfileHistory,
  getStudentProfileOverview,
  StudentProfileNotFoundError
} from "@/lib/services/student-profile";

const SECTIONS = ["overview", "financial", "attendance", "history"] as const;

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireCapability(request, "students.read");
  if (auth instanceof Response) return auth;
  const { id } = await context.params;
  const section = request.nextUrl.searchParams.get("section") ?? "overview";
  if (!SECTIONS.includes(section as (typeof SECTIONS)[number])) return fail("Seção inválida", 400);

  try {
    if (section === "financial") {
      if (!hasCapability(auth.role, "finance.monthlies.read")) return fail("Sem permissão", 403);
      return ok({ section, data: await getStudentProfileFinancial(id) });
    }
    if (section === "attendance") {
      if (!hasCapability(auth.role, "attendance.read")) return fail("Sem permissão", 403);
      return ok({ section, data: await getStudentProfileAttendance(id) });
    }
    if (section === "history") return ok({ section, data: await getStudentProfileHistory(id) });
    return ok({ section: "overview", data: await getStudentProfileOverview(id, auth.role) });
  } catch (error) {
    if (error instanceof StudentProfileNotFoundError) return fail(error.message, 404);
    return fail("Não foi possível carregar o perfil do aluno", 500);
  }
}
