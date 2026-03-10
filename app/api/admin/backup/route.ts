import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = requireRole(request, UserRole.ADMIN);
  if (auth instanceof Response) return auth;

  const [alunos, mensalidades, caixa, despesasA, despesasF, presencas, agenda, produtos, pedidos] = await Promise.all([
    prisma.aluno.findMany(),
    prisma.mensalidade.findMany(),
    prisma.movimentacaoCaixa.findMany(),
    prisma.despesaAcademia.findMany(),
    prisma.despesaFamilia.findMany(),
    prisma.presenca.findMany(),
    prisma.agendaPersonal.findMany(),
    prisma.produto.findMany(),
    prisma.pedidoProduto.findMany({ include: { itens: true } })
  ]);

  const payload = {
    generatedAt: new Date().toISOString(),
    alunos,
    mensalidades,
    caixa,
    despesasAcademia: despesasA,
    despesasFamilia: despesasF,
    presencas,
    agendaPersonal: agenda,
    produtos,
    pedidos
  };

  return new NextResponse(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename=backup-academia-${new Date().toISOString().slice(0, 10)}.json`
    }
  });
}
