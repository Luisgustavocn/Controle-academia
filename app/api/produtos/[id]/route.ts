import { UserRole } from "@prisma/client";
import { createByIdHandlers } from "@/lib/api/crud";

export const { PUT, DELETE } = createByIdHandlers({
  model: "produto",
  module: "produtos",
  requiredRole: UserRole.RECEPCAO,
  numericFields: ["preco"],
  intFields: ["estoque"],
  booleanFields: ["ativo"]
});
