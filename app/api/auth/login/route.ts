import { compare } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail } from "@/lib/http";
import { getSessionCookieOptions, sessionCookie, signSessionToken } from "@/lib/auth/session";
import { isFirstAccessPending } from "@/lib/auth/first-access";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!email || !password) {
      return fail("Informe e-mail e senha", 400);
    }

    if (await isFirstAccessPending()) {
      return fail("Primeiro acesso pendente. Defina o e-mail e a senha do administrador.", 403, {
        setupRequired: true
      });
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
    response.cookies.set(sessionCookie, token, getSessionCookieOptions(request));

    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "JWT_SECRET not configured") {
      return fail("JWT_SECRET nao configurado", 500);
    }

    return fail("Erro interno ao processar login", 500);
  }
}
