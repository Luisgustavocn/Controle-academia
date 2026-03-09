import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparePassword } from "@/lib/auth/password";
import { logAudit } from "@/lib/audit";
import { fail, ok } from "@/lib/api";
import { setSessionCookie, signSession } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const email = String(body.email || "").toLowerCase().trim();
  const password = String(body.password || "");

  if (!email || !password) return fail("Email e senha sao obrigatorios", 422);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) return fail("Credenciais invalidas", 401);

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) return fail("Credenciais invalidas", 401);

  const token = await signSession({
    sub: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
  });

  await setSessionCookie(token);
  await logAudit({ userId: user.id, entidade: "User", entidadeId: user.id, acao: "LOGIN" });

  return ok({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
}
