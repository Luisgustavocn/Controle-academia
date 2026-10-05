import { createByIdHandlers } from "@/lib/api/crud";

export const { PUT, DELETE } = createByIdHandlers({
  model: "despesaAcademia",
  module: "despesas-academia",
  writeCapability: "finance.expenses.manage",
  numericFields: ["valorPrevisto", "valorPago"],
  dateFields: ["dataVencimento", "dataPagamento"],
  deleteBlockedReason: "Exclusão física de despesas está bloqueada para proteger o histórico. Ajuste o status ou os valores."
});
