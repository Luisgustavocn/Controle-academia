import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const mov = await prisma.movimentacaoCaixa.update({
    where: { id },
    data: {
      data: body.data ? new Date(body.data) : undefined,
      tipo: body.tipo,
      categoriaId: body.categoriaId,
      descricao: body.descricao,
      valor: body.valor,
      origemDestino: body.origemDestino,
      formaPagamento: body.formaPagamento,
      observacao: body.observacao,
    },
  });
  return ok({ movimentacao: mov });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.movimentacaoCaixa.delete({ where: { id } });
  return ok({ success: true });
}
