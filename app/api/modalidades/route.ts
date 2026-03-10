import { UserRole } from "@prisma/client";
import { createListCreateHandlers } from "@/lib/api/crud";

export const { GET, POST } = createListCreateHandlers({
  model: "modalidade",
  module: "modalidades",
  requiredRole: UserRole.RECEPCAO,
  searchFields: ["nome"],
  numericFields: ["valorPadrao"],
  booleanFields: ["ativa"],
  orderBy: { nome: "asc" }
});
