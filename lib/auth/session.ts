import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import { isSessionPayload, SESSION_COOKIE_NAME } from "@/lib/auth/jwt-payload";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export function signSessionToken(user: SessionUser): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET not configured");
  }
  return jwt.sign(user, secret, { expiresIn: "12h" });
}

export function verifySessionToken(token: string): SessionUser | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET not configured");
  }

  try {
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (!isSessionPayload(payload)) {
      return null;
    }

    return {
      id: payload.id,
      name: payload.name,
      email: payload.email,
      role: payload.role as UserRole
    };
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  return verifySessionToken(token);
}

export function getSessionUserFromRequest(request: NextRequest): SessionUser | null {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  return verifySessionToken(token);
}

export function getSessionCookieOptions(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const isHttps = request.nextUrl.protocol === "https:" || forwardedProto === "https";

  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isHttps,
    path: "/",
    maxAge: 60 * 60 * 12
  };
}

export const sessionCookie = SESSION_COOKIE_NAME;
