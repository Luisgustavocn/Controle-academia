import {} from "@prisma/client";
import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { ok } from "@/lib/http";
import { currentCompetencia } from "@/lib/competencia";
import { runCashClosing } from "@/lib/services/jobs";

export async function POST(request: NextRequest) {
  const auth = requireCapability(request, "finance.cash.manage");
  if (auth instanceof Response) return auth;

  const body = (await request.json().catch(() => ({}))) as { competencia?: string };
  const competencia = body.competencia || currentCompetencia();
  const result = await runCashClosing(competencia);

  return ok({ result });
}
