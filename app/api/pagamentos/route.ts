import { createListCreateHandlers } from "@/lib/api/crud";
import { resolvePaymentMethodForWrite } from "@/lib/services/payment-methods";

export const { GET, POST } = createListCreateHandlers({
  model: "pagamento",
  module: "pagamentos",
  readCapability: "finance.monthlies.read",
  writeCapability: "finance.monthlies.manage",
  searchFields: ["formaPagamento", "observacao"],
  relationInclude: {
    aluno: { select: { nomeCompleto: true } },
    mensalidade: { select: { competencia: true } }
  },
  numericFields: ["valor"],
  dateFields: ["dataPagamento"],
  validateAsync: async (data) => {
    try {
      data.formaPagamento = await resolvePaymentMethodForWrite({
        value: data.formaPagamento,
        application: "RECEBIMENTO",
        required: true
      });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Forma de pagamento inválida";
    }
  }
});
