import { Prisma, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, UserRole.RECEPCAO);
  if (auth instanceof Response) return auth;

  const q = request.nextUrl.searchParams.get("q") ?? "";

  const items = await prisma.pedidoProduto.findMany({
    where: q
      ? {
          OR: [
            { clienteNome: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { modelo: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { cor: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { tamanho: { contains: q, mode: Prisma.QueryMode.insensitive } }
          ]
        }
      : undefined,
    include: {
      aluno: { select: { nomeCompleto: true } },
      itens: { include: { produto: { select: { nome: true } } } }
    },
    orderBy: { dataPedido: "desc" }
  });

  return ok({ items });
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, UserRole.RECEPCAO);
  if (auth instanceof Response) return auth;

  const body = (await request.json()) as Record<string, unknown>;
  const itens = Array.isArray(body.itens) ? (body.itens as Array<Record<string, unknown>>) : [];

  const quantidade = Math.max(1, Math.trunc(toNumber(body.quantidade, 1)));
  const valorUnitario = toNumber(body.valorUnitario, 0);
  const valorTotal = toNumber(body.valorTotal, quantidade * valorUnitario);

  if (!body.clienteNome) {
    return fail("clienteNome é obrigatório", 400);
  }

  const created = await prisma.$transaction(async (trx) => {
    const pedido = await trx.pedidoProduto.create({
      data: {
        clienteNome: String(body.clienteNome),
        alunoId: body.alunoId ? String(body.alunoId) : null,
        modelo: body.modelo ? String(body.modelo) : null,
        cor: body.cor ? String(body.cor) : null,
        tamanho: body.tamanho ? String(body.tamanho) : null,
        quantidade,
        valorUnitario,
        valorTotal,
        pago: toNumber(body.pago, 0),
        dataPedido: body.dataPedido ? new Date(String(body.dataPedido)) : new Date(),
        observacao: body.observacao ? String(body.observacao) : null,
        itens: {
          create: itens.map((item) => ({
            produtoId: item.produtoId ? String(item.produtoId) : null,
            descricaoManual: item.descricaoManual ? String(item.descricaoManual) : null,
            modelo: item.modelo ? String(item.modelo) : null,
            cor: item.cor ? String(item.cor) : null,
            tamanho: item.tamanho ? String(item.tamanho) : null,
            quantidade: Math.max(1, Math.trunc(toNumber(item.quantidade, 1))),
            valorUnitario: toNumber(item.valorUnitario, 0),
            valorTotal: toNumber(item.valorTotal, toNumber(item.quantidade, 1) * toNumber(item.valorUnitario, 0))
          }))
        }
      },
      include: {
        itens: true
      }
    });

    for (const item of pedido.itens) {
      if (item.produtoId) {
        await trx.produto.update({
          where: { id: item.produtoId },
          data: {
            estoque: {
              decrement: item.quantidade
            }
          }
        });
      }
    }

    return pedido;
  });

  return ok({ item: created }, 201);
}
