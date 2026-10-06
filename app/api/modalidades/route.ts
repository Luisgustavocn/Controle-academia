import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ensureModalidadePersonalizada } from "@/lib/services/modalidades";

function parseBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "sim", "yes"].includes(normalized)) return true;
  if (["false", "0", "nao", "não", "no"].includes(normalized)) return false;
  return fallback;
}

export async function GET(request: NextRequest) {
  const auth = requireCapability(request, "students.read");
  if (auth instanceof Response) return auth;

  await ensureModalidadePersonalizada();

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const where = q
    ? {
        nome: {
          contains: q,
          mode: Prisma.QueryMode.insensitive
        }
      }
    : undefined;

  const items = await prisma.modalidade.findMany({
    where,
    orderBy: { nome: "asc" }
  });

  return ok({ items });
}

export async function POST(request: NextRequest) {
  const auth = requireCapability(request, "students.update");
  if (auth instanceof Response) return auth;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const nome = String(body.nome ?? "").trim();
  if (!nome) {
    return fail("Nome da modalidade é obrigatório", 400);
  }

  const valorPadrao = body.valorPadrao === undefined || body.valorPadrao === null || body.valorPadrao === ""
    ? null
    : Number(body.valorPadrao);
  if (valorPadrao !== null && (!Number.isFinite(valorPadrao) || valorPadrao <= 0)) {
    return fail("Valor padrão inválido", 400);
  }

  try {
    const item = await prisma.modalidade.create({
      data: {
        nome,
        valorPadrao,
        ativa: parseBoolean(body.ativa, true)
      }
    });
    return ok({ item }, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("Já existe uma modalidade com esse nome", 400);
    }
    return fail("Erro ao criar modalidade", 500);
  }
}
