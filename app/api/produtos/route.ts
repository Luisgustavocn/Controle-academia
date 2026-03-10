import { UserRole } from "@prisma/client";
import { createListCreateHandlers } from "@/lib/api/crud";

export const { GET, POST } = createListCreateHandlers({
  model: "produto",
  module: "produtos",
  requiredRole: UserRole.RECEPCAO,
  searchFields: ["nome", "categoria", "cor", "tamanho"],
  numericFields: ["preco"],
  intFields: ["estoque"],
  booleanFields: ["ativo"]
});
