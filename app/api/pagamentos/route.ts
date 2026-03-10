import { UserRole } from "@prisma/client";
import { createListCreateHandlers } from "@/lib/api/crud";

export const { GET, POST } = createListCreateHandlers({
  model: "pagamento",
  module: "pagamentos",
  requiredRole: UserRole.FINANCEIRO,
  searchFields: ["formaPagamento", "observacao"],
  relationInclude: {
    aluno: { select: { nomeCompleto: true } },
    mensalidade: { select: { competencia: true } }
  },
  numericFields: ["valor"],
  dateFields: ["dataPagamento"]
});
