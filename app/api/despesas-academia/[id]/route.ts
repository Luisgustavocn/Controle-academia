import { UserRole } from "@prisma/client";
import { createByIdHandlers } from "@/lib/api/crud";

export const { PUT, DELETE } = createByIdHandlers({
  model: "despesaAcademia",
  module: "despesas-academia",
  requiredRole: UserRole.FINANCEIRO,
  numericFields: ["valorPrevisto", "valorPago"],
  dateFields: ["dataVencimento", "dataPagamento"],
  deleteBlockedReason: "Exclusão física de despesas está bloqueada para proteger o histórico. Ajuste o status ou os valores."
});
