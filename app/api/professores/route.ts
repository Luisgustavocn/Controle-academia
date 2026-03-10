import { Prisma, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const PROFESSOR_KEY_PREFIX = "professor:";

function normalizeNome(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, UserRole.PERSONAL);
  if (auth instanceof Response) return auth;

  const q = request.nextUrl.searchParams.get("q") ?? "";

  const items = await prisma.configuracao.findMany({
    where: {
      chave: { startsWith: PROFESSOR_KEY_PREFIX },
      ...(q
        ? {
            valor: {
              contains: q,
              mode: Prisma.QueryMode.insensitive
            }
          }
        : {})
    },
    orderBy: { valor: "asc" }
  });

  return ok({
    items: items.map((item) => ({
      id: item.id,
      nome: item.valor,
      updatedAt: item.updatedAt
    }))
  });
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, UserRole.PERSONAL);
  if (auth instanceof Response) return auth;

  const body = (await request.json()) as Record<string, unknown>;
  const nome = normalizeNome(body.nome);

  if (!nome) {
    return fail("nome é obrigatório", 400);
  }

  const duplicate = await prisma.configuracao.findFirst({
    where: {
      chave: { startsWith: PROFESSOR_KEY_PREFIX },
      valor: { equals: nome, mode: Prisma.QueryMode.insensitive }
    }
  });

  if (duplicate) {
    return fail("Professor já cadastrado", 400);
  }

  const created = await prisma.configuracao.create({
    data: {
      chave: `${PROFESSOR_KEY_PREFIX}${crypto.randomUUID()}`,
      valor: nome,
      descricao: "Cadastro de professor para agenda personal"
    }
  });

  return ok(
    {
      item: {
        id: created.id,
        nome: created.valor,
        updatedAt: created.updatedAt
      }
    },
    201
  );
}
