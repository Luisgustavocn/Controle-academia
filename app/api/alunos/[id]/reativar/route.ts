import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { EnrollmentNotFoundError, EnrollmentValidationError, resumeEnrollment } from "@/lib/services/enrollment-periods";
import { CivilDateValidationError } from "@/lib/attendance-date";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireCapability(request, "students.status");
  if (auth instanceof Response) return auth;

  const { id } = await context.params;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const modalidadeId = String(body.modalidadeId ?? "").trim() || null;
  const dueDay = Number(body.diaVencimento);
  const rawValue = body.valorMensal;
  const monthlyValue = rawValue === null || rawValue === undefined || rawValue === "" ? null : Number(rawValue);
  if (typeof body.usarValorPadrao !== "boolean") return fail("Confirme a regra de valor padrão", 400);

  try {
    const result = await resumeEnrollment(id, {
      startDate: String(body.dataRetorno ?? ""),
      modalidadeId,
      monthlyValue,
      useDefaultValue: body.usarValorPadrao,
      dueDay
    }, { id: auth.id, name: auth.name });
    return ok({ item: result.student, periodo: result.period });
  } catch (error) {
    if (error instanceof EnrollmentNotFoundError) return fail(error.message, 404);
    if (error instanceof EnrollmentValidationError || error instanceof CivilDateValidationError) return fail(error.message, 400);
    throw error;
  }
}
