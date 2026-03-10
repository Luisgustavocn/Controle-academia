import { NextResponse } from "next/server";
import { sessionCookie } from "@/lib/auth/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });

  const baseCookie = {
    httpOnly: true as const,
    path: "/",
    sameSite: "lax" as const,
    expires: new Date(0),
    maxAge: 0
  };

  response.cookies.set(sessionCookie, "", {
    ...baseCookie,
    secure: false
  });

  response.cookies.set(sessionCookie, "", {
    ...baseCookie,
    secure: true
  });

  return response;
}
