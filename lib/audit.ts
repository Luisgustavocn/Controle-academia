import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AuditPayload = {
  userId?: string;
  modulo: string;
  entidade: string;
  entidadeId: string;
  acao: string;
  antes?: unknown;
  depois?: unknown;
};

type AuditClient = PrismaClient | Prisma.TransactionClient;

export async function logAudit(payload: AuditPayload, client: AuditClient = prisma) {
  let safeUserId: string | null = payload.userId ?? null;

  if (safeUserId) {
    const userExists = await client.user.findUnique({
      where: { id: safeUserId },
      select: { id: true }
    });
    if (!userExists) {
      safeUserId = null;
    }
  }

  await client.logAuditoria.create({
    data: {
      userId: safeUserId,
      modulo: payload.modulo,
      entidade: payload.entidade,
      entidadeId: payload.entidadeId,
      acao: payload.acao,
      antes: payload.antes as never,
      depois: payload.depois as never
    }
  });
}
