import { UserRole } from "@prisma/client";
import { createByIdHandlers } from "@/lib/api/crud";

export const { PUT, DELETE } = createByIdHandlers({
  model: "presenca",
  module: "presencas",
  requiredRole: UserRole.PERSONAL,
  dateFields: ["data"],
  booleanFields: ["presente"]
});
