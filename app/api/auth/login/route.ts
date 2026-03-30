import { compare } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail } from "@/lib/http";
import { sessionCookie, signSessionToken } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!email || !password) {
      return fail("Informe e-mail e senha", 400);
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.active) {
      return fail("Usuario invalido", 401);
    }

    const valid = await compare(password, user.passwordHash);
    if (!valid) {
      return fail("Credenciais invalidas", 401);
    }

    const token = signSessionToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(sessionCookie, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12
    });

    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "JWT_SECRET not configured") {
      return fail("JWT_SECRET nao configurado", 500);
    }

    return fail("Erro interno ao processar login", 500);
  }
}
