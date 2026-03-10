import { UserRole } from "@prisma/client";
import { createByIdHandlers } from "@/lib/api/crud";

export const { PUT, DELETE } = createByIdHandlers({
  model: "categoriaFinanceira",
  module: "categorias-financeiras",
  requiredRole: UserRole.FINANCEIRO,
  booleanFields: ["ativa"]
});
