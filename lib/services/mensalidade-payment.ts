import { MensalidadeStatus } from "@prisma/client";

export const MARK_MONTHLY_PAID_ACTION = "mark-paid";

export function validatePaymentTransition(
  previousStatus: MensalidadeStatus,
  nextStatus: MensalidadeStatus,
  paymentMethod: unknown
) {
  if (previousStatus !== MensalidadeStatus.PAGO && nextStatus === MensalidadeStatus.PAGO && !String(paymentMethod ?? "").trim()) {
    return "Forma de pagamento é obrigatória";
  }
  return null;
}
