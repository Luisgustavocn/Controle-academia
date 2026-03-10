import { UserRole } from "@prisma/client";
import { createListCreateHandlers } from "@/lib/api/crud";

export const { GET, POST } = createListCreateHandlers({
  model: "categoriaFinanceira",
  module: "categorias-financeiras",
  requiredRole: UserRole.FINANCEIRO,
  searchFields: ["nome", "descricao"],
  booleanFields: ["ativa"]
});
