import { UserRole } from "@prisma/client";
import { createListCreateHandlers } from "@/lib/api/crud";

export const { GET, POST } = createListCreateHandlers({
  model: "despesaFamilia",
  module: "despesas-familia",
  requiredRole: UserRole.FINANCEIRO,
  searchFields: ["descricao", "competencia"],
  relationInclude: {
    categoria: { select: { nome: true } }
  },
  numericFields: ["valorPrevisto", "valorPago"],
  dateFields: ["dataVencimento", "dataPagamento"],
  queryFilters: (request) => {
    const competencia = request.nextUrl.searchParams.get("competencia");
    const status = request.nextUrl.searchParams.get("status");
    return {
      ...(competencia ? { competencia } : {}),
      ...(status ? { status } : {})
    };
  }
});
