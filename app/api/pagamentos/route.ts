import { createListCreateHandlers } from "@/lib/api/crud";

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
  dateFields: ["dataPagamento"]
});
