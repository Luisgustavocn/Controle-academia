import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { currentCompetencia } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const competencia = req.nextUrl.searchParams.get("competencia") || currentCompetencia();
  const categoria = req.nextUrl.searchParams.get("categoria") || undefined;
  const q = req.nextUrl.searchParams.get("q") || "";

  const movimentacoes = await prisma.movimentacaoCaixa.findMany({
    where: {
      competencia,
      categoria: categoria ? { nome: categoria } : undefined,
      descricao: q ? { contains: q, mode: "insensitive" } : undefined,
    },
    include: { categoria: true, aluno: true },
    orderBy: { data: "desc" },
  });

  const totalEntradasMes = movimentacoes.filter((m) => m.tipo === "ENTRADA").reduce((acc, m) => acc + Number(m.valor), 0);
  const totalSaidasMes = movimentacoes.filter((m) => m.tipo === "SAIDA").reduce((acc, m) => acc + Number(m.valor), 0);

  return ok({
    movimentacoes,
    totalEntradasMes,
    totalSaidasMes,
    saldoMes: totalEntradasMes - totalSaidasMes,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const mov = await prisma.movimentacaoCaixa.create({
    data: {
      data: new Date(body.data),
      tipo: body.tipo,
      categoriaId: body.categoriaId || null,
      descricao: body.descricao,
      valor: body.valor,
      origemDestino: body.origemDestino,
      alunoId: body.alunoId || null,
      formaPagamento: body.formaPagamento,
      competencia: body.competencia || currentCompetencia(),
      observacao: body.observacao,
    },
  });

  return ok({ movimentacao: mov }, 201);
}
