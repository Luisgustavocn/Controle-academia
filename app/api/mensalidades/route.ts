import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api";
import { currentCompetencia } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const competencia = req.nextUrl.searchParams.get("competencia") || currentCompetencia();

  const mensalidades = await prisma.mensalidade.findMany({
    where: { competencia },
    include: {
      aluno: {
        include: { modalidade: true },
      },
    },
    orderBy: { aluno: { nomeCompleto: "asc" } },
  });

  const totalRecebido = mensalidades.reduce((acc, m) => (["PAGO", "PARCIAL"].includes(m.status) ? acc + Number(m.valor) : acc), 0);
  const totalPrevisto = mensalidades.reduce((acc, m) => acc + Number(m.valor), 0);

  return ok({ mensalidades, totalRecebido, totalPrevisto });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.alunoId || !body.competencia) return fail("alunoId e competencia sao obrigatorios", 422);

  const mensalidade = await prisma.mensalidade.upsert({
    where: {
      alunoId_competencia: {
        alunoId: body.alunoId,
        competencia: body.competencia,
      },
    },
    create: {
      alunoId: body.alunoId,
      competencia: body.competencia,
      valor: body.valor,
      vencimento: new Date(body.vencimento),
      dataPagamento: body.dataPagamento ? new Date(body.dataPagamento) : null,
      formaPagamento: body.formaPagamento,
      status: body.status || "PENDENTE",
      observacao: body.observacao,
    },
    update: {
      valor: body.valor,
      vencimento: new Date(body.vencimento),
      dataPagamento: body.dataPagamento ? new Date(body.dataPagamento) : null,
      formaPagamento: body.formaPagamento,
      status: body.status,
      observacao: body.observacao,
    },
  });

  return ok({ mensalidade }, 201);
}
