import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  await prisma.pedidoItem.deleteMany({ where: { pedidoId: id } });

  const pedido = await prisma.pedidoProduto.update({
    where: { id },
    data: {
      clienteNome: body.clienteNome,
      alunoId: body.alunoId || null,
      valorTotal: body.valorTotal,
      valorPago: body.valorPago,
      pago: body.pago,
      dataPedido: body.dataPedido ? new Date(body.dataPedido) : undefined,
      observacao: body.observacao,
      itens: {
        create: (body.itens || []).map((item: any) => ({
          produtoId: item.produtoId || null,
          modelo: item.modelo,
          cor: item.cor,
          tamanho: item.tamanho,
          quantidade: Number(item.quantidade || 1),
          valorUnitario: item.valorUnitario,
          valorTotal: item.valorTotal,
        })),
      },
    },
    include: { itens: true },
  });

  return ok({ pedido });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.pedidoProduto.delete({ where: { id } });
  return ok({ success: true });
}
