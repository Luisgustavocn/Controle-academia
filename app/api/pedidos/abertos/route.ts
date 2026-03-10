import { Prisma, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

function toMoney(value: Prisma.Decimal | number) {
  return Number(value);
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, UserRole.RECEPCAO);
  if (auth instanceof Response) return auth;

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const where: Prisma.PedidoProdutoWhereInput = {
    alunoId: { not: null }
  };

  if (q) {
    where.OR = [
      { id: { contains: q, mode: Prisma.QueryMode.insensitive } },
      { clienteNome: { contains: q, mode: Prisma.QueryMode.insensitive } },
      { aluno: { nomeCompleto: { contains: q, mode: Prisma.QueryMode.insensitive } } },
      { aluno: { telefone: { contains: q, mode: Prisma.QueryMode.insensitive } } },
      { alunoId: { contains: q, mode: Prisma.QueryMode.insensitive } }
    ];
  }

  const items = await prisma.pedidoProduto.findMany({
    where,
    include: {
      aluno: {
        select: {
          id: true,
          nomeCompleto: true,
          telefone: true
        }
      }
    },
    orderBy: [{ dataPedido: "desc" }, { createdAt: "desc" }]
  });

  const abertos = items
    .map((item) => {
      const valorTotal = toMoney(item.valorTotal);
      const pago = toMoney(item.pago);
      const valorAberto = Math.max(0, valorTotal - pago);
      const alunoId = item.alunoId ?? "";

      return {
        id: item.id,
        alunoId,
        alunoNome: item.aluno?.nomeCompleto ?? item.clienteNome,
        telefone: item.aluno?.telefone ?? "",
        dataPedido: item.dataPedido,
        produto: item.modelo ?? "",
        quantidade: item.quantidade,
        valorTotal,
        pago,
        valorAberto
      };
    })
    .filter((item) => item.valorAberto > 0.0001);

  const byAluno = new Map<string, { alunoId: string; alunoNome: string; telefone: string; totalAberto: number; pedidos: number }>();
  for (const item of abertos) {
    const key = item.alunoId;
    const current = byAluno.get(key) ?? {
      alunoId: item.alunoId,
      alunoNome: item.alunoNome,
      telefone: item.telefone,
      totalAberto: 0,
      pedidos: 0
    };

    current.totalAberto += item.valorAberto;
    current.pedidos += 1;
    byAluno.set(key, current);
  }

  const resumoPorAluno = Array.from(byAluno.values()).sort((a, b) => b.totalAberto - a.totalAberto);
  const totalAberto = abertos.reduce((acc, item) => acc + item.valorAberto, 0);

  return ok({
    items: abertos,
    resumoPorAluno,
    totalAberto,
    totalItens: abertos.length
  });
}
