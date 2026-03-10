import { NextRequest } from "next/server";
import { ok } from "@/lib/http";
import { requireAuth } from "@/lib/auth/guards";

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof Response) {
    return auth;
  }

  return ok({ user: auth });
}
