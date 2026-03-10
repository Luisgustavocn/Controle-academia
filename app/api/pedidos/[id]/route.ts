import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import { requireRole } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, UserRole.RECEPCAO);
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const body = (await request.json()) as Record<string, unknown>;

  const updated = await prisma.pedidoProduto.update({
    where: { id },
    data: {
      clienteNome: body.clienteNome ? String(body.clienteNome) : undefined,
      alunoId: body.alunoId === "" ? null : (body.alunoId as string | undefined),
      modelo: body.modelo === "" ? null : (body.modelo as string | undefined),
      cor: body.cor === "" ? null : (body.cor as string | undefined),
      tamanho: body.tamanho === "" ? null : (body.tamanho as string | undefined),
      quantidade: body.quantidade ? Math.trunc(Number(body.quantidade)) : undefined,
      valorUnitario: body.valorUnitario ? Number(body.valorUnitario) : undefined,
      valorTotal: body.valorTotal ? Number(body.valorTotal) : undefined,
      pago: body.pago ? Number(body.pago) : undefined,
      dataPedido: body.dataPedido ? new Date(String(body.dataPedido)) : undefined,
      observacao: body.observacao === "" ? null : (body.observacao as string | undefined)
    }
  });

  return ok({ item: updated });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, UserRole.RECEPCAO);
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const existing = await prisma.pedidoProduto.findUnique({
    where: { id },
    include: { itens: true }
  });
  if (!existing) {
    return fail("Pedido não encontrado", 404);
  }

  await prisma.$transaction(async (trx) => {
    for (const item of existing.itens) {
      if (item.produtoId) {
        await trx.produto.update({
          where: { id: item.produtoId },
          data: {
            estoque: {
              increment: item.quantidade
            }
          }
        });
      }
    }

    await trx.pedidoProduto.delete({ where: { id } });
  });

  return ok({ ok: true });
}
