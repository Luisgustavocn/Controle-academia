import { createByIdHandlers } from "@/lib/api/crud";

export const { PUT, DELETE } = createByIdHandlers({
  model: "modalidade",
  module: "modalidades",
  writeCapability: "students.update",
  nullableNumericFields: ["valorPadrao"],
  booleanFields: ["ativa"],
  validate: (data) => typeof data.valorPadrao === "number" && data.valorPadrao <= 0
    ? "Valor padrão deve ser maior que zero ou ficar vazio"
    : null
});
