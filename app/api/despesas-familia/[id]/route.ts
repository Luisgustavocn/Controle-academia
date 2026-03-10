import { UserRole } from "@prisma/client";
import { createByIdHandlers } from "@/lib/api/crud";

export const { PUT, DELETE } = createByIdHandlers({
  model: "despesaFamilia",
  module: "despesas-familia",
  requiredRole: UserRole.FINANCEIRO,
  numericFields: ["valorPrevisto", "valorPago"],
  dateFields: ["dataVencimento", "dataPagamento"]
});
