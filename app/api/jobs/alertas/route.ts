import {} from "@prisma/client";
import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { ok } from "@/lib/http";
import { getAlerts } from "@/lib/services/jobs";

export async function GET(request: NextRequest) {
  const auth = requireCapability(request, "reports.operational");
  if (auth instanceof Response) return auth;

  const result = await getAlerts();
  return ok(result);
}
