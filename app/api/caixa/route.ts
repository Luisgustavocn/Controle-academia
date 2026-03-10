import { UserRole } from "@prisma/client";
import { createListCreateHandlers } from "@/lib/api/crud";

export const { GET, POST } = createListCreateHandlers({
  model: "movimentacaoCaixa",
  module: "caixa",
  requiredRole: UserRole.FINANCEIRO,
  searchFields: ["descricao", "origemDestino", "competencia"],
  relationInclude: {
    aluno: { select: { nomeCompleto: true } },
    categoria: { select: { nome: true } }
  },
  numericFields: ["valor"],
  dateFields: ["data"],
  queryFilters: (request) => {
    const competencia = request.nextUrl.searchParams.get("competencia");
    const tipo = request.nextUrl.searchParams.get("tipo");
    const categoriaId = request.nextUrl.searchParams.get("categoriaId");
    return {
      ...(competencia ? { competencia } : {}),
      ...(tipo ? { tipo } : {}),
      ...(categoriaId ? { categoriaId } : {})
    };
  }
});
