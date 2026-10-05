import { createByIdHandlers } from "@/lib/api/crud";

export const { PUT, DELETE } = createByIdHandlers({
  model: "presenca",
  module: "presencas",
  writeCapability: "attendance.write",
  dateFields: ["data"],
  booleanFields: ["presente"]
});
