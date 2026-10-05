import { createListCreateHandlers } from "@/lib/api/crud";

export const { GET, POST } = createListCreateHandlers({
  model: "presenca",
  module: "presencas",
  readCapability: "attendance.read",
  writeCapability: "attendance.write",
  searchFields: ["tipoAula", "horario"],
  relationInclude: {
    aluno: { select: { nomeCompleto: true, status: true } }
  },
  dateFields: ["data"],
  booleanFields: ["presente"],
  queryFilters: (request) => {
    const alunoId = request.nextUrl.searchParams.get("alunoId");
    const competencia = request.nextUrl.searchParams.get("competencia");
    return {
      ...(alunoId ? { alunoId } : {}),
      ...(competencia
        ? {
            data: {
              gte: new Date(`${competencia}-01T00:00:00.000Z`),
              lt: new Date(new Date(`${competencia}-01T00:00:00.000Z`).setMonth(new Date(`${competencia}-01T00:00:00.000Z`).getMonth() + 1))
            }
          }
        : {})
    };
  }
});
