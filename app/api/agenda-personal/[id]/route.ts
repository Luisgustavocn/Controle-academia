import { UserRole } from "@prisma/client";
import { createByIdHandlers } from "@/lib/api/crud";

export const { PUT, DELETE } = createByIdHandlers({
  model: "agendaPersonal",
  module: "agenda-personal",
  requiredRole: UserRole.PERSONAL,
  intFields: ["diaSemana"],
  booleanFields: ["ativo"]
});
