import { hash } from "bcryptjs";
import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { createBackupFile } from "@/lib/services/backup";

function parseBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return ["true", "1", "sim", "yes"].includes(String(value).toLowerCase());
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, UserRole.ADMIN);
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const body = (await request.json()) as Record<string, unknown>;
  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) {
    return fail("Usuário não encontrado", 404);
  }

  const nextActive = body.active === undefined ? current.active : parseBool(body.active);
  const nextRole = body.role ? String(body.role) : current.role;

  if (current.role === UserRole.ADMIN && current.active && (!nextActive || nextRole !== UserRole.ADMIN)) {
    const totalActiveAdmins = await prisma.user.count({
      where: {
        role: UserRole.ADMIN,
        active: true
      }
    });

    if (totalActiveAdmins <= 1) {
      return fail("Não é permitido desativar ou rebaixar o último administrador ativo", 400);
    }
  }

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

  await logAudit({
    userId: auth.id,
    modulo: "configuracoes",
    entidade: "User",
    entidadeId: id,
    acao: "UPDATE",
    antes: {
      id: current.id,
      name: current.name,
      email: current.email,
      role: current.role,
      active: current.active
    },
    depois: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active
    }
  });

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

  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) {
    return fail("Usuário não encontrado", 404);
  }

  if (current.role === UserRole.ADMIN && current.active) {
    const totalActiveAdmins = await prisma.user.count({
      where: {
        role: UserRole.ADMIN,
        active: true
      }
    });

    if (totalActiveAdmins <= 1) {
      return fail("Não é permitido desativar o último administrador ativo", 400);
    }
  }

  const backup = await createBackupFile();
  const user = await prisma.user.update({
    where: { id },
    data: { active: false }
  });

  await logAudit({
    userId: auth.id,
    modulo: "configuracoes",
    entidade: "User",
    entidadeId: id,
    acao: "DEACTIVATE",
    antes: {
      id: current.id,
      name: current.name,
      email: current.email,
      role: current.role,
      active: current.active
    },
    depois: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active
    }
  });

  return ok({ ok: true, deactivated: true, backupFilePath: backup.filePath });
}
