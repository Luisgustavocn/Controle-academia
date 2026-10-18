import { createByIdHandlers } from "@/lib/api/crud";
import { expenseRequiresPaymentMethod, resolvePaymentMethodForWrite } from "@/lib/services/payment-methods";

export const { PUT, DELETE } = createByIdHandlers({
  model: "despesaAcademia",
  module: "despesas-academia",
  writeCapability: "finance.expenses.manage",
  numericFields: ["valorPrevisto", "valorPago"],
  dateFields: ["dataVencimento", "dataPagamento"],
  validateAsync: async (data, _mode, previous) => {
    try {
      const status = data.status ?? previous?.status;
      const valorPago = data.valorPago ?? previous?.valorPago;
      const wasAlreadyPaid = expenseRequiresPaymentMethod(previous?.status, previous?.valorPago);
      data.formaPagamento = await resolvePaymentMethodForWrite({
        value: data.formaPagamento,
        previousValue: typeof previous?.formaPagamento === "string" ? previous.formaPagamento : null,
        application: "DESPESA",
        required: !wasAlreadyPaid && expenseRequiresPaymentMethod(status, valorPago)
      });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Forma de pagamento inválida";
    }
  },
  deleteBlockedReason: "Exclusão física de despesas está bloqueada para proteger o histórico. Ajuste o status ou os valores."
});
