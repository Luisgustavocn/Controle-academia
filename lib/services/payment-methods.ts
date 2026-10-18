import { prisma } from "@/lib/prisma";

export type PaymentMethodApplication = "RECEBIMENTO" | "DESPESA";
export type ConfiguredPaymentMethodApplication = PaymentMethodApplication | "AMBOS";

export function normalizePaymentMethodName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

export function paymentMethodApplies(
  configured: ConfiguredPaymentMethodApplication,
  requested: PaymentMethodApplication
) {
  return configured === "AMBOS" || configured === requested;
}

export function expenseRequiresPaymentMethod(status: unknown, paidValue: unknown) {
  const normalizedStatus = String(status ?? "PENDENTE").toUpperCase();
  return normalizedStatus === "PAGO" || normalizedStatus === "PARCIAL" || Number(paidValue ?? 0) > 0;
}

export async function resolvePaymentMethodForWrite({
  value,
  previousValue,
  application,
  required
}: {
  value: unknown;
  previousValue?: string | null;
  application: PaymentMethodApplication;
  required: boolean;
}) {
  const submitted = value === undefined ? undefined : String(value ?? "").trim();
  const effective = submitted === undefined ? previousValue?.trim() ?? "" : submitted;

  if (!effective) {
    if (required) throw new Error("Forma de pagamento é obrigatória");
    return submitted === undefined ? undefined : null;
  }

  // Um formulario historico pode ser salvo sem revalidar o texto antigo.
  if (previousValue && effective === previousValue.trim()) {
    return previousValue;
  }

  const paymentMethodDelegate = (prisma as unknown as {
    formaPagamento: {
      findUnique: (args: Record<string, unknown>) => Promise<{ nome: string; ativo: boolean; aplicacao: ConfiguredPaymentMethodApplication } | null>;
    };
  }).formaPagamento;
  const method = await paymentMethodDelegate.findUnique({
    where: { nomeNormalizado: normalizePaymentMethodName(effective) },
    select: { nome: true, ativo: true, aplicacao: true }
  });

  if (!method || !method.ativo || !paymentMethodApplies(method.aplicacao, application)) {
    throw new Error("Selecione uma forma de pagamento ativa e aplicável");
  }

  return method.nome;
}
