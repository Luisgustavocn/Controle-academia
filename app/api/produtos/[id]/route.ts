import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const produto = await prisma.produto.update({
    where: { id },
    data: {
      nome: body.nome,
      categoria: body.categoria,
      tamanho: body.tamanho,
      cor: body.cor,
      preco: body.preco,
      estoque: Number(body.estoque || 0),
      ativo: body.ativo,
    },
  });
  return ok({ produto });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.produto.delete({ where: { id } });
  return ok({ success: true });
}
