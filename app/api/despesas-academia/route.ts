import { UserRole } from "@prisma/client";
import { createListCreateHandlers } from "@/lib/api/crud";

function toCompetencia(dateLike: unknown) {
  if (dateLike instanceof Date && !Number.isNaN(dateLike.getTime())) {
    return `${dateLike.getFullYear()}-${String(dateLike.getMonth() + 1).padStart(2, "0")}`;
  }

  const raw = String(dateLike ?? "").trim();
  if (!raw) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  if (/^\d{4}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

export const { GET, POST } = createListCreateHandlers({
  model: "despesaAcademia",
  module: "despesas-academia",
  requiredRole: UserRole.FINANCEIRO,
  searchFields: ["descricao"],
  relationInclude: {
    categoria: { select: { nome: true } }
  },
  numericFields: ["valorPrevisto", "valorPago"],
  dateFields: ["dataVencimento", "dataPagamento"],
  validate: (data) => {
    const competenciaRaw = String(data.competencia ?? "").trim();
    if (!competenciaRaw) {
      data.competencia = toCompetencia(data.dataPagamento ?? data.dataVencimento);
    }

    if (data.valorPrevisto === undefined || data.valorPrevisto === null || data.valorPrevisto === "") {
      const valorPago = Number(data.valorPago ?? 0);
      data.valorPrevisto = Number.isFinite(valorPago) ? valorPago : 0;
    }

    return null;
  },
  queryFilters: (request) => {
    const competencia = request.nextUrl.searchParams.get("competencia");
    const status = request.nextUrl.searchParams.get("status");
    return {
      ...(competencia ? { competencia } : {}),
      ...(status ? { status } : {})
    };
  }
});
