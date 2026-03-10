import { hash } from "bcryptjs";
import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

function parseBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return ["true", "1", "sim", "yes"].includes(String(value).toLowerCase());
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, UserRole.ADMIN);
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const body = (await request.json()) as Record<string, unknown>;

  const data: Record<string, unknown> = {
    ...(body.name ? { name: String(body.name) } : {}),
    ...(body.email ? { email: String(body.email).toLowerCase() } : {}),
    ...(body.role ? { role: String(body.role) } : {}),
    ...(body.active !== undefined ? { active: parseBool(body.active) } : {})
  };

  if (body.password) {
    data.passwordHash = await hash(String(body.password), 10);
  }

  const user = await prisma.user.update({ where: { id }, data });

  return ok({
    item: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active
    }
  });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, UserRole.ADMIN);
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  if (auth.id === id) {
    return fail("Não é permitido remover o próprio usuário logado", 400);
  }

  await prisma.user.delete({ where: { id } });
  return ok({ ok: true });
}
