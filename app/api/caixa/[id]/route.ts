import { UserRole } from "@prisma/client";
import { createByIdHandlers } from "@/lib/api/crud";

export const { PUT, DELETE } = createByIdHandlers({
  model: "movimentacaoCaixa",
  module: "caixa",
  requiredRole: UserRole.FINANCEIRO,
  numericFields: ["valor"],
  dateFields: ["data"]
});
