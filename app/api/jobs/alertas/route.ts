import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { ok } from "@/lib/http";
import { getAlerts } from "@/lib/services/jobs";

export async function GET(request: NextRequest) {
  const auth = requireRole(request, UserRole.RECEPCAO);
  if (auth instanceof Response) return auth;

  const result = await getAlerts();
  return ok(result);
}
