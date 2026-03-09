import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const mensalidade = await prisma.mensalidade.update({
    where: { id },
    data: {
      valor: body.valor,
      vencimento: body.vencimento ? new Date(body.vencimento) : undefined,
      dataPagamento: body.dataPagamento ? new Date(body.dataPagamento) : null,
      formaPagamento: body.formaPagamento,
      status: body.status,
      observacao: body.observacao,
    },
  });

  return ok({ mensalidade });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.mensalidade.delete({ where: { id } });
  return ok({ success: true });
}
