import { NextRequest } from "next/server";
import {} from "@prisma/client";
import { requireCapability } from "@/lib/auth/guards";
import { ok } from "@/lib/http";
import { getOperationalDashboard } from "@/lib/services/dashboard";

export async function GET(request: NextRequest) {
  const auth = requireCapability(request, "dashboard.view");
  if (auth instanceof Response) return auth;

  const summary = await getOperationalDashboard(auth.role);
  return ok(summary);
}
