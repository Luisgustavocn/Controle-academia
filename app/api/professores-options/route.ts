import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const PROFESSOR_KEY_PREFIX = "professor:";

export async function GET(request: NextRequest) {
  const auth = requireRole(request, UserRole.PERSONAL);
  if (auth instanceof Response) return auth;

  const items = await prisma.configuracao.findMany({
    where: {
      chave: { startsWith: PROFESSOR_KEY_PREFIX }
    },
    orderBy: { valor: "asc" }
  });

  return ok({
    items: items.map((item) => ({
      id: item.valor,
      nome: item.valor
    }))
  });
}
