import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  getFirstAccessUser,
  isFirstAccessPending,
  markFirstAccessComplete
} from "@/lib/auth/first-access";
import { getSessionCookieOptions, sessionCookie, signSessionToken } from "@/lib/auth/session";

export async function GET() {
  const pending = await isFirstAccessPending();
  const user = pending ? await getFirstAccessUser() : null;

  return NextResponse.json({
    setupRequired: pending,
    email: user?.email ?? null
  });
}

export async function POST(request: NextRequest) {
  const pending = await isFirstAccessPending();
  if (!pending) {
    return fail("O primeiro acesso já foi configurado.", 409);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const confirmPassword = String(body.confirmPassword ?? "");

  if (!email || !password || !confirmPassword) {
    return fail("Informe e-mail, senha e confirmação de senha.", 400);
  }

  if (!email.includes("@")) {
    return fail("Informe um e-mail válido.", 400);
  }

  if (password.length < 8) {
    return fail("A senha precisa ter pelo menos 8 caracteres.", 400);
  }

  if (password !== confirmPassword) {
    return fail("A confirmação de senha não confere.", 400);
  }

  const firstAccessUser = await getFirstAccessUser();
  if (!firstAccessUser) {
    return fail("Usuário inicial não encontrado.", 404);
  }

  const duplicate = await prisma.user.findFirst({
    where: {
      email,
      id: {
        not: firstAccessUser.id
      }
    },
    select: { id: true }
  });

  if (duplicate) {
    return fail("Esse e-mail já está em uso.", 400);
  }

  const passwordHash = await hash(password, 10);
  const updated = await prisma.user.update({
    where: { id: firstAccessUser.id },
    data: {
      email,
      passwordHash
    }
  });
  await markFirstAccessComplete();

  const token = signSessionToken({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role
  });

  const response = NextResponse.json({ ok: true, setupRequired: false });
  response.cookies.set(sessionCookie, token, getSessionCookieOptions(request));
  return response;
}
