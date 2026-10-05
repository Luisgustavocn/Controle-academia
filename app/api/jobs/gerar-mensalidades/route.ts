import {} from "@prisma/client";
import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { ok } from "@/lib/http";
import { currentCompetencia } from "@/lib/competencia";
import { runMonthlyGeneration } from "@/lib/services/jobs";

export async function POST(request: NextRequest) {
  const auth = requireCapability(request, "finance.monthlies.manage");
  if (auth instanceof Response) return auth;

  const body = (await request.json().catch(() => ({}))) as { competencia?: string };
  const competencia = body.competencia || currentCompetencia();
  const result = await runMonthlyGeneration(competencia);

  return ok({ result });
}
