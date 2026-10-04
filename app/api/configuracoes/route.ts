import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { createListCreateHandlers } from "@/lib/api/crud";
import { isSensitiveConfigurationKey, redactConfigurationValue } from "@/lib/configuration-secrets";
import { ok } from "@/lib/http";

const handlers = createListCreateHandlers({
  model: "configuracao",
  module: "configuracoes",
  requiredRole: UserRole.ADMIN,
  searchFields: ["chave", "descricao"],
  validate: (data) =>
    isSensitiveConfigurationKey(String(data.chave ?? ""))
      ? "Segredos devem ser configurados por variaveis de ambiente."
      : null
});

export const POST = handlers.POST;

export async function GET(request: NextRequest) {
  const response = await handlers.GET(request);
  if (!response.ok) {
    return response;
  }

  const payload = (await response.json()) as { items?: Array<{ chave: string; valor: string }> };
  return ok({
    ...payload,
    items: (payload.items ?? []).map(redactConfigurationValue)
  });
}
