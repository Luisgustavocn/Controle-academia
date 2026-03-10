import { Prisma, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const PROFESSOR_KEY_PREFIX = "professor:";

function normalizeNome(value: unknown) {
  return String(value ?? "").trim();
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, UserRole.PERSONAL);
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const body = (await request.json()) as Record<string, unknown>;
  const nome = normalizeNome(body.nome);

  if (!nome) {
    return fail("nome é obrigatório", 400);
  }

  const current = await prisma.configuracao.findUnique({ where: { id } });
  if (!current || !current.chave.startsWith(PROFESSOR_KEY_PREFIX)) {
    return fail("Professor não encontrado", 404);
  }

  const duplicate = await prisma.configuracao.findFirst({
    where: {
      id: { not: id },
      chave: { startsWith: PROFESSOR_KEY_PREFIX },
      valor: { equals: nome, mode: Prisma.QueryMode.insensitive }
    }
  });

  if (duplicate) {
    return fail("Professor já cadastrado", 400);
  }

  const updated = await prisma.configuracao.update({
    where: { id },
    data: { valor: nome }
  });

  return ok({
    item: {
      id: updated.id,
      nome: updated.valor,
      updatedAt: updated.updatedAt
    }
  });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, UserRole.PERSONAL);
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const current = await prisma.configuracao.findUnique({ where: { id } });
  if (!current || !current.chave.startsWith(PROFESSOR_KEY_PREFIX)) {
    return fail("Professor não encontrado", 404);
  }

  await prisma.configuracao.delete({ where: { id } });
  return ok({ ok: true });
}
