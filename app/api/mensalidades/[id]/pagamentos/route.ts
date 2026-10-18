import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { MonthlyPaymentError, registerMonthlyPayment } from "@/lib/services/monthly-payments";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireCapability(request, "finance.monthlies.manage");
  if (auth instanceof Response) return auth;
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return fail("Payload inválido", 400);

  try {
    const result = await registerMonthlyPayment({
      mensalidadeId: id,
      valor: body.valor,
      formaPagamento: body.formaPagamento,
      dataPagamento: body.dataPagamento,
      valorFinal: body.valorFinal,
      motivoAjuste: body.motivoAjuste,
      idempotencyKey: body.idempotencyKey,
      actor: { id: auth.id, name: auth.name }
    });
    return ok({
      item: {
        mensalidade: result.monthly,
        pagamento: result.payment,
        valorOriginal: Number(result.amounts.original),
        valorDevido: Number(result.amounts.due),
        totalPago: Number(result.amounts.paid),
        saldo: Number(result.amounts.balance)
      },
      alreadyProcessed: result.alreadyProcessed
    }, result.alreadyProcessed ? 200 : 201);
  } catch (error) {
    if (error instanceof MonthlyPaymentError) return fail(error.message, error.status);
    throw error;
  }
}
