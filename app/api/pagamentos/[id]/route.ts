import { createByIdHandlers } from "@/lib/api/crud";
import { resolvePaymentMethodForWrite } from "@/lib/services/payment-methods";

export const { PUT, DELETE } = createByIdHandlers({
  model: "pagamento",
  module: "pagamentos",
  writeCapability: "finance.monthlies.manage",
  numericFields: ["valor"],
  dateFields: ["dataPagamento"],
  validateAsync: async (data, _mode, previous) => {
    if (String(previous?.id ?? "").startsWith("pay_")) {
      return "Pagamentos de mensalidade são imutáveis; utilize o fluxo de estorno quando disponível";
    }
    try {
      data.formaPagamento = await resolvePaymentMethodForWrite({
        value: data.formaPagamento,
        previousValue: typeof previous?.formaPagamento === "string" ? previous.formaPagamento : null,
        application: "RECEBIMENTO",
        required: false
      });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Forma de pagamento inválida";
    }
  },
  deleteBlockedReason: "Exclusão física de pagamentos está bloqueada para proteger o histórico. Use estorno, ajuste ou observação."
});
