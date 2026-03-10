import { UserRole } from "@prisma/client";
import { createByIdHandlers } from "@/lib/api/crud";

export const { PUT, DELETE } = createByIdHandlers({
  model: "modalidade",
  module: "modalidades",
  requiredRole: UserRole.RECEPCAO,
  numericFields: ["valorPadrao"],
  booleanFields: ["ativa"]
});
