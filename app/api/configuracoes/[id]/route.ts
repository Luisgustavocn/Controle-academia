import { NextRequest } from "next/server";
import { createByIdHandlers } from "@/lib/api/crud";
import { requireCapability } from "@/lib/auth/guards";
import { isSensitiveConfigurationKey } from "@/lib/configuration-secrets";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const handlers = createByIdHandlers({
  model: "configuracao",
  module: "configuracoes",
  writeCapability: "settings.manage",
  validate: (data) =>
    data.chave && isSensitiveConfigurationKey(String(data.chave))
      ? "Segredos devem ser configurados por variaveis de ambiente."
      : null
});

export const DELETE = handlers.DELETE;

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireCapability(request, "settings.manage");
  if (auth instanceof Response) {
    return auth;
  }

  const { id } = await context.params;
  const current = await prisma.configuracao.findUnique({
    where: { id },
    select: { chave: true }
  });

  if (current && isSensitiveConfigurationKey(current.chave)) {
    return fail("Segredos legados nao podem ser alterados pela API.", 400);
  }

  return handlers.PUT(request, context);
}
