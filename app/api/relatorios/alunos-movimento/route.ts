import {} from "@prisma/client";
import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { currentCompetencia } from "@/lib/competencia";
import { buildMonthlyStudentControl, monthRange } from "@/lib/services/mensalidades";

function competenciaToReferenceDate(competencia: string) {
  const [year, month] = competencia.split("-").map(Number);
  return new Date(year, Math.max(0, month - 1), 1);
}

export async function GET(request: NextRequest) {
  const auth = requireCapability(request, "reports.operational");
  if (auth instanceof Response) return auth;

  const competenciaParam = request.nextUrl.searchParams.get("competencia");
  if (competenciaParam && !/^\d{4}-\d{2}$/.test(competenciaParam)) {
    return fail("competencia invalida. Use yyyy-mm", 400);
  }

  const competencia = competenciaParam || currentCompetencia();
  const competencias = monthRange(competenciaToReferenceDate(competencia), 6);
  const series = [];

  for (const item of competencias) {
    series.push(await buildMonthlyStudentControl(item));
  }

  return ok({
    competencia,
    atual: series[series.length - 1] ?? null,
    series
  });
}
