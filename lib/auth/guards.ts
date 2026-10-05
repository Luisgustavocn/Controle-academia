import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { fail } from "@/lib/http";
import { hasRole } from "@/lib/roles";
import { getSessionUserFromRequest, SessionUser } from "@/lib/auth/session";
import { Capability, hasCapability } from "@/lib/auth/capabilities";

export function requireAuth(request: NextRequest): SessionUser | Response {
  const session = getSessionUserFromRequest(request);
  if (!session) {
    return fail("Não autenticado", 401);
  }
  return session;
}

export function requireRole(request: NextRequest, role: UserRole): SessionUser | Response {
  const auth = requireAuth(request);
  if (auth instanceof Response) {
    return auth;
  }
  if (!hasRole(auth.role, role)) {
    return fail("Sem permissão", 403);
  }
  return auth;
}

export function requireCapability(request: NextRequest, capability: Capability): SessionUser | Response {
  const auth = requireAuth(request);
  if (auth instanceof Response) return auth;
  if (!hasCapability(auth.role, capability)) {
    return fail("Sem permissão", 403);
  }
  return auth;
}
