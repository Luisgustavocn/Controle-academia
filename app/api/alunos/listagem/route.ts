import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { listStudents, parseStudentListParams, StudentListValidationError } from "@/lib/services/student-listing";

export async function GET(request: NextRequest) {
  const auth = requireCapability(request, "students.read");
  if (auth instanceof Response) return auth;

  try {
    const params = parseStudentListParams(request.nextUrl.searchParams);
    return ok(await listStudents(params, auth.role));
  } catch (error) {
    if (error instanceof StudentListValidationError) return fail(error.message, 400);
    return fail("Não foi possível carregar os alunos", 500);
  }
}
