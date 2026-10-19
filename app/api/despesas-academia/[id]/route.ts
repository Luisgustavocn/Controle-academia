import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { ExpensePaymentError, updateExpense } from "@/lib/services/expense-payments";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireCapability(request, "finance.expenses.manage");
  if (auth instanceof Response) return auth;
  const { id } = await context.params;
  try {
    const item = await updateExpense(id, (await request.json()) as Record<string, unknown>, auth.id);
    return ok({ item });
  } catch (error) {
    if (error instanceof ExpensePaymentError) return fail(error.message, error.status);
    return fail("Erro ao atualizar despesa", 500);
  }
}

export async function DELETE() {
  return fail("Exclusão física de despesas permanece bloqueada; reverta a baixa pelo Caixa.", 409);
}
