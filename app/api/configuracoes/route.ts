import { UserRole } from "@prisma/client";
import { createListCreateHandlers } from "@/lib/api/crud";

export const { GET, POST } = createListCreateHandlers({
  model: "configuracao",
  module: "configuracoes",
  requiredRole: UserRole.ADMIN,
  searchFields: ["chave", "descricao", "valor"]
});
