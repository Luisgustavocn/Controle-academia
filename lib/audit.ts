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

export async function logAudit(payload: AuditPayload) {
  await prisma.logAuditoria.create({
    data: {
      userId: payload.userId,
      modulo: payload.modulo,
      entidade: payload.entidade,
      entidadeId: payload.entidadeId,
      acao: payload.acao,
      antes: payload.antes as never,
      depois: payload.depois as never
    }
  });
}
