import { createListCreateHandlers } from "@/lib/api/crud";

function parseTipo(value: string | null) {
  if (!value) return undefined;
  const normalized = value.toUpperCase();
  if (normalized === "ENTRADA" || normalized === "SAIDA") {
    return normalized;
  }
  return undefined;
}

function parseAtiva(value: string | null) {
  if (value === null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "sim", "yes"].includes(normalized)) return true;
  if (["false", "0", "nao", "não", "no"].includes(normalized)) return false;
  return undefined;
}

export const { GET, POST } = createListCreateHandlers({
  model: "categoriaFinanceira",
  module: "categorias-financeiras",
  readCapability: "finance.cash.read",
  writeCapability: "finance.cash.manage",
  searchFields: ["nome", "descricao"],
  booleanFields: ["ativa"],
  queryFilters: (request) => {
    const tipo = parseTipo(request.nextUrl.searchParams.get("tipo"));
    const ativa = parseAtiva(request.nextUrl.searchParams.get("ativa"));

    return {
      ...(tipo ? { tipo } : {}),
      ...(ativa === undefined ? {} : { ativa })
    };
  },
  validate: (data, mode) => {
    const tipo = data.tipo;
    if (mode === "create" && (tipo === undefined || tipo === null || String(tipo).trim() === "")) {
      return "Tipo da categoria é obrigatório (ENTRADA ou SAIDA)";
    }

    if (tipo !== undefined && tipo !== null && String(tipo).trim() !== "") {
      const normalized = String(tipo).toUpperCase();
      if (normalized !== "ENTRADA" && normalized !== "SAIDA") {
        return "Tipo inválido. Use ENTRADA ou SAIDA";
      }
      data.tipo = normalized;
    }

    return null;
  }
});
