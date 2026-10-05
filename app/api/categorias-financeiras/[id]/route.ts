import { createByIdHandlers } from "@/lib/api/crud";

export const { PUT, DELETE } = createByIdHandlers({
  model: "categoriaFinanceira",
  module: "categorias-financeiras",
  writeCapability: "finance.cash.manage",
  booleanFields: ["ativa"],
  validate: (data) => {
    if (data.tipo !== undefined && data.tipo !== null && String(data.tipo).trim() !== "") {
      const normalized = String(data.tipo).toUpperCase();
      if (normalized !== "ENTRADA" && normalized !== "SAIDA") {
        return "Tipo inválido. Use ENTRADA ou SAIDA";
      }
      data.tipo = normalized;
    }
    return null;
  }
});
