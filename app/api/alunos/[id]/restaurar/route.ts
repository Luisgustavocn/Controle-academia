import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { restoreStudent, StudentDeletionNotFoundError } from "@/lib/services/student-deletion";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireCapability(request, "students.delete");
  if (auth instanceof Response) return auth;
  const { id } = await context.params;
  try { return ok({ item: await restoreStudent(id, { id: auth.id, name: auth.name }) }); }
  catch (error) { if (error instanceof StudentDeletionNotFoundError) return fail(error.message, 404); throw error; }
}
