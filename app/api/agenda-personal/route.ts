import { UserRole } from "@prisma/client";
import { createListCreateHandlers } from "@/lib/api/crud";

export const { GET, POST } = createListCreateHandlers({
  model: "agendaPersonal",
  module: "agenda-personal",
  requiredRole: UserRole.PERSONAL,
  searchFields: ["professor", "horario", "alunoNome", "tipoAula", "semanaRef"],
  relationInclude: {
    aluno: { select: { nomeCompleto: true } }
  },
  intFields: ["diaSemana"],
  booleanFields: ["ativo"],
  queryFilters: (request) => {
    const semanaRef = request.nextUrl.searchParams.get("semanaRef");
    const professor = request.nextUrl.searchParams.get("professor");
    return {
      ...(semanaRef ? { semanaRef } : {}),
      ...(professor ? { professor } : {})
    };
  }
});
