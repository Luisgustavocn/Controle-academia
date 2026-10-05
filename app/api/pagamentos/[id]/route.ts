import { createByIdHandlers } from "@/lib/api/crud";

export const { PUT, DELETE } = createByIdHandlers({
  model: "pagamento",
  module: "pagamentos",
  writeCapability: "finance.monthlies.manage",
  numericFields: ["valor"],
  dateFields: ["dataPagamento"],
  deleteBlockedReason: "Exclusão física de pagamentos está bloqueada para proteger o histórico. Use estorno, ajuste ou observação."
});
