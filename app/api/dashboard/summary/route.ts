import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import { requireRole } from "@/lib/auth/guards";
import { ok } from "@/lib/http";
import { getDashboardSummary } from "@/lib/services/dashboard";

export async function GET(request: NextRequest) {
  const auth = requireRole(request, UserRole.RECEPCAO);
  if (auth instanceof Response) return auth;

  const competencia = request.nextUrl.searchParams.get("competencia") || undefined;
  const summary = await getDashboardSummary(competencia);
  return ok(summary);
}
