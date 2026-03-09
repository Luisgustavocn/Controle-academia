import { prisma } from "@/lib/prisma";

type AuditInput = {
  userId?: string;
  entidade: string;
  entidadeId: string;
  acao: "CREATE" | "UPDATE" | "DELETE" | "LOGIN";
  dadosAntes?: unknown;
  dadosDepois?: unknown;
};

export async function logAudit(input: AuditInput) {
  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      entidade: input.entidade,
      entidadeId: input.entidadeId,
      acao: input.acao,
      dadosAntes: input.dadosAntes as object | undefined,
      dadosDepois: input.dadosDepois as object | undefined,
    },
  });
}
