import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { normalizePaymentMethodName, type ConfiguredPaymentMethodApplication } from "@/lib/services/payment-methods";

const APPLICATIONS = new Set<ConfiguredPaymentMethodApplication>(["RECEBIMENTO", "DESPESA", "AMBOS"]);

type PaymentMethodRecord = {
  id: string;
  nome: string;
  nomeNormalizado: string;
  ativo: boolean;
  aplicacao: ConfiguredPaymentMethodApplication;
  ordem: number;
  createdAt: Date;
  updatedAt: Date;
};

function paymentMethods() {
  return (prisma as unknown as {
    formaPagamento: {
      findUnique: (args: Record<string, unknown>) => Promise<PaymentMethodRecord | null>;
      update: (args: Record<string, unknown>) => Promise<PaymentMethodRecord>;
    };
  }).formaPagamento;
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireCapability(request, "settings.manage");
  if (auth instanceof Response) return auth;
  const { id } = await context.params;
  const previous = await paymentMethods().findUnique({ where: { id } });
  if (!previous) return fail("Forma de pagamento não encontrada", 404);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const nome = body.nome === undefined ? previous.nome : String(body.nome).trim().replace(/\s+/g, " ");
  const aplicacao = body.aplicacao === undefined
    ? previous.aplicacao
    : String(body.aplicacao).toUpperCase() as ConfiguredPaymentMethodApplication;
  const ordem = body.ordem === undefined ? previous.ordem : Number(body.ordem);
  if (!nome) return fail("Nome é obrigatório", 400);
  if (!APPLICATIONS.has(aplicacao)) return fail("Aplicação é obrigatória", 400);
  if (!Number.isInteger(ordem) || ordem < 0) return fail("Ordem deve ser um inteiro maior ou igual a zero", 400);

  try {
    const item = await paymentMethods().update({
      where: { id },
      data: {
        nome,
        nomeNormalizado: normalizePaymentMethodName(nome),
        aplicacao,
        ordem,
        ativo: body.ativo === undefined ? previous.ativo : [true, "true", "1", 1].includes(body.ativo as never)
      }
    });
    await logAudit({ userId: auth.id, modulo: "configuracoes", entidade: "FormaPagamento", entidadeId: id, acao: "UPDATE", antes: previous, depois: item });
    return ok({ item });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("Já existe uma forma de pagamento com esse nome", 400);
    }
    return fail("Erro ao atualizar forma de pagamento", 500);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = requireCapability(request, "settings.manage");
  if (auth instanceof Response) return auth;
  return fail("Exclusão física de formas de pagamento está bloqueada. Desative a opção para preservar o histórico.", 409);
}
