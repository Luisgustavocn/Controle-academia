import { createListCreateHandlers } from "@/lib/api/crud";
import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { createExpense, ExpensePaymentError } from "@/lib/services/expense-payments";
import { expenseRequiresPaymentMethod, resolvePaymentMethodForWrite } from "@/lib/services/payment-methods";

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

const handlers = createListCreateHandlers({
  model: "despesaAcademia",
  module: "despesas-academia",
  readCapability: "finance.expenses.read",
  writeCapability: "finance.expenses.manage",
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
  validateAsync: async (data) => {
    try {
      data.formaPagamento = await resolvePaymentMethodForWrite({
        value: data.formaPagamento,
        application: "DESPESA",
        required: expenseRequiresPaymentMethod(data.status, data.valorPago)
      });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Forma de pagamento inválida";
    }
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

export const GET = handlers.GET;

export async function POST(request: NextRequest) {
  const auth = requireCapability(request, "finance.expenses.manage");
  if (auth instanceof Response) return auth;
  try {
    const item = await createExpense((await request.json()) as Record<string, unknown>, auth.id);
    return ok({ item }, 201);
  } catch (error) {
    if (error instanceof ExpensePaymentError) return fail(error.message, error.status);
    return fail("Erro ao criar despesa", 500);
  }
}
