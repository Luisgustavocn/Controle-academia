import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const MODALIDADE_PERSONALIZADA = "Personalizada";

export function normalizeModalidadeNome(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function isModalidadePersonalizada(nome: string | null | undefined) {
  return normalizeModalidadeNome(nome) === normalizeModalidadeNome(MODALIDADE_PERSONALIZADA);
}

export async function ensureModalidadePersonalizada() {
  const existing = await prisma.modalidade.findFirst({
    where: {
      nome: {
        equals: MODALIDADE_PERSONALIZADA,
        mode: Prisma.QueryMode.insensitive
      }
    }
  });

  if (existing) {
    return existing;
  }

  try {
    return await prisma.modalidade.create({
      data: {
        nome: MODALIDADE_PERSONALIZADA,
        valorPadrao: 0,
        ativa: true
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const retry = await prisma.modalidade.findFirst({
        where: {
          nome: {
            equals: MODALIDADE_PERSONALIZADA,
            mode: Prisma.QueryMode.insensitive
          }
        }
      });
      if (retry) return retry;
    }
    throw error;
  }
}
