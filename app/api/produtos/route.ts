import { UserRole } from "@prisma/client";
import { createListCreateHandlers } from "@/lib/api/crud";

function toBooleanParam(value: string | null) {
  if (value === null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "sim", "yes"].includes(normalized)) return true;
  if (["false", "0", "nao", "não", "no"].includes(normalized)) return false;
  return undefined;
}

export const { GET, POST } = createListCreateHandlers({
  model: "produto",
  module: "produtos",
  requiredRole: UserRole.RECEPCAO,
  searchFields: ["nome", "categoria", "cor", "tamanho"],
  orderBy: { nome: "asc" },
  numericFields: ["preco"],
  intFields: ["estoque"],
  booleanFields: ["ativo"],
  queryFilters: (request) => {
    const ativo = toBooleanParam(request.nextUrl.searchParams.get("ativo"));
    const estoqueMinRaw = request.nextUrl.searchParams.get("estoqueMin");
    const estoqueMin = estoqueMinRaw === null ? undefined : Number(estoqueMinRaw);

    return {
      ...(ativo === undefined ? {} : { ativo }),
      ...(estoqueMin !== undefined && Number.isFinite(estoqueMin) ? { estoque: { gte: Math.trunc(estoqueMin) } } : {})
    };
  }
});
