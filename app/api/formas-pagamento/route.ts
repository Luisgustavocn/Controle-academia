import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { hasCapability } from "@/lib/auth/capabilities";
import { requireAuth, requireCapability } from "@/lib/auth/guards";
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
      findMany: (args: Record<string, unknown>) => Promise<PaymentMethodRecord[]>;
      create: (args: Record<string, unknown>) => Promise<PaymentMethodRecord>;
    };
  }).formaPagamento;
}

function parseApplication(value: unknown) {
  const normalized = String(value ?? "").toUpperCase() as ConfiguredPaymentMethodApplication;
  return APPLICATIONS.has(normalized) ? normalized : null;
}

function parseActive(value: string | null) {
  if (value === null || value === "") return undefined;
  return ["true", "1", "sim"].includes(value.toLowerCase());
}

function canReadPaymentMethods(role: Parameters<typeof hasCapability>[0]) {
  return hasCapability(role, "settings.manage") ||
    hasCapability(role, "finance.monthlies.read") ||
    hasCapability(role, "finance.expenses.read") ||
    hasCapability(role, "finance.cash.read");
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof Response) return auth;
  if (!canReadPaymentMethods(auth.role)) return fail("Sem permissão", 403);

  const application = parseApplication(request.nextUrl.searchParams.get("aplicacao"));
  const active = parseActive(request.nextUrl.searchParams.get("ativo"));
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  const items = await paymentMethods().findMany({
    where: {
      ...(active === undefined ? {} : { ativo: active }),
      ...(application && application !== "AMBOS"
        ? { aplicacao: { in: [application, "AMBOS"] } }
        : application ? { aplicacao: "AMBOS" } : {}),
      ...(q ? { nome: { contains: q, mode: Prisma.QueryMode.insensitive } } : {})
    },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }]
  });

  return ok({ items });
}

export async function POST(request: NextRequest) {
  const auth = requireCapability(request, "settings.manage");
  if (auth instanceof Response) return auth;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const nome = String(body.nome ?? "").trim().replace(/\s+/g, " ");
  const aplicacao = parseApplication(body.aplicacao);
  const ordem = Number(body.ordem ?? 0);
  if (!nome) return fail("Nome é obrigatório", 400);
  if (!aplicacao) return fail("Aplicação é obrigatória", 400);
  if (!Number.isInteger(ordem) || ordem < 0) return fail("Ordem deve ser um inteiro maior ou igual a zero", 400);

  try {
    const item = await paymentMethods().create({
      data: {
        nome,
        nomeNormalizado: normalizePaymentMethodName(nome),
        aplicacao,
        ordem,
        ativo: body.ativo === undefined ? true : [true, "true", "1", 1].includes(body.ativo as never)
      }
    });
    await logAudit({ userId: auth.id, modulo: "configuracoes", entidade: "FormaPagamento", entidadeId: item.id, acao: "CREATE", depois: item });
    return ok({ item }, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("Já existe uma forma de pagamento com esse nome", 400);
    }
    return fail("Erro ao criar forma de pagamento", 500);
  }
}
