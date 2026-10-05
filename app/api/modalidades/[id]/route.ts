import { createByIdHandlers } from "@/lib/api/crud";

export const { PUT, DELETE } = createByIdHandlers({
  model: "modalidade",
  module: "modalidades",
  writeCapability: "students.update",
  numericFields: ["valorPadrao"],
  booleanFields: ["ativa"]
});
