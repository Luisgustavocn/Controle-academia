import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const despesa = await prisma.despesaFamilia.update({
    where: { id },
    data: {
      dataVencimento: body.dataVencimento ? new Date(body.dataVencimento) : undefined,
      competencia: body.competencia,
      descricao: body.descricao,
      categoria: body.categoria,
      valorPrevisto: body.valorPrevisto,
      valorPago: body.valorPago,
      status: body.status,
      dataPagamento: body.dataPagamento ? new Date(body.dataPagamento) : null,
      observacao: body.observacao,
    },
  });
  return ok({ despesa });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.despesaFamilia.delete({ where: { id } });
  return ok({ success: true });
}
