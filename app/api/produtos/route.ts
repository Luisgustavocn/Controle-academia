import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";

export async function GET() {
  const produtos = await prisma.produto.findMany({ orderBy: { nome: "asc" } });
  return ok({ produtos });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const produto = await prisma.produto.create({
    data: {
      nome: body.nome,
      categoria: body.categoria,
      tamanho: body.tamanho,
      cor: body.cor,
      preco: body.preco,
      estoque: Number(body.estoque || 0),
      ativo: body.ativo ?? true,
    },
  });
  return ok({ produto }, 201);
}
