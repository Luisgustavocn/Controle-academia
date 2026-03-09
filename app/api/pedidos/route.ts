import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";

export async function GET() {
  const pedidos = await prisma.pedidoProduto.findMany({ include: { aluno: true, itens: { include: { produto: true } } }, orderBy: { dataPedido: "desc" } });
  return ok({ pedidos });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const pedido = await prisma.pedidoProduto.create({
    data: {
      clienteNome: body.clienteNome,
      alunoId: body.alunoId || null,
      valorTotal: body.valorTotal || 0,
      valorPago: body.valorPago || 0,
      pago: body.pago || false,
      dataPedido: body.dataPedido ? new Date(body.dataPedido) : new Date(),
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

  return ok({ pedido }, 201);
}
