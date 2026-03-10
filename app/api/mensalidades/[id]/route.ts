import { MensalidadeStatus, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, UserRole.FINANCEIRO);
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const body = (await request.json()) as Record<string, unknown>;

  const previous = await prisma.mensalidade.findUnique({ where: { id } });
  if (!previous) {
    return fail("Mensalidade não encontrada", 404);
  }

  const status = body.status ? (String(body.status) as MensalidadeStatus) : undefined;
  const dataPagamento = body.dataPagamento ? new Date(String(body.dataPagamento)) : undefined;
  const valorPago = body.valorPago ? Number(body.valorPago) : Number(previous.valor);

  const updated = await prisma.mensalidade.update({
    where: { id },
    data: {
      valor: body.valor ? Number(body.valor) : undefined,
      vencimento: body.vencimento ? new Date(String(body.vencimento)) : undefined,
      status,
      dataPagamento,
      formaPagamento: body.formaPagamento === "" ? null : (body.formaPagamento as string | undefined),
      observacao: body.observacao === "" ? null : (body.observacao as string | undefined)
    }
  });

  if (status === MensalidadeStatus.PAGO || status === MensalidadeStatus.PARCIAL) {
    await prisma.pagamento.create({
      data: {
        alunoId: updated.alunoId,
        mensalidadeId: updated.id,
        valor: valorPago,
        dataPagamento: dataPagamento ?? new Date(),
        formaPagamento: String(body.formaPagamento ?? updated.formaPagamento ?? "não informado"),
        observacao: "Registro automático via mensalidade"
      }
    });
  }

  await logAudit({
    userId: auth.id,
    modulo: "mensalidades",
    entidade: "Mensalidade",
    entidadeId: id,
    acao: "UPDATE",
    antes: previous,
    depois: updated
  });

  return ok({ item: updated });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, UserRole.ADMIN);
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const previous = await prisma.mensalidade.findUnique({ where: { id } });
  if (!previous) {
    return fail("Mensalidade não encontrada", 404);
  }

  await prisma.mensalidade.delete({ where: { id } });

  await logAudit({
    userId: auth.id,
    modulo: "mensalidades",
    entidade: "Mensalidade",
    entidadeId: id,
    acao: "DELETE",
    antes: previous
  });

  return ok({ ok: true });
}
