import { UserRole } from "@prisma/client";
import { createByIdHandlers } from "@/lib/api/crud";

export const { PUT, DELETE } = createByIdHandlers({
  model: "configuracao",
  module: "configuracoes",
  requiredRole: UserRole.ADMIN
});
