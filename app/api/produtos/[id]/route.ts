import { createByIdHandlers } from "@/lib/api/crud";

export const { PUT, DELETE } = createByIdHandlers({
  model: "produto",
  module: "produtos",
  writeCapability: "products.manage",
  numericFields: ["preco"],
  intFields: ["estoque"],
  booleanFields: ["ativo"]
});
