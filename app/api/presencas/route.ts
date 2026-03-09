import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";

export async function GET(req: NextRequest) {
  const competencia = req.nextUrl.searchParams.get("competencia");
  const from = competencia ? new Date(`${competencia}-01T00:00:00`) : new Date(new Date().setDate(1));
  const to = new Date(from);
  to.setMonth(to.getMonth() + 1);

  const presencas = await prisma.presenca.findMany({
    where: {
      data: {
        gte: from,
        lt: to,
      },
    },
    include: { aluno: true },
    orderBy: [{ data: "asc" }],
  });

  return ok({ presencas });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const presenca = await prisma.presenca.upsert({
    where: {
      alunoId_data_tipoAula: {
        alunoId: body.alunoId,
        data: new Date(body.data),
        tipoAula: body.tipoAula,
      },
    },
    create: {
      alunoId: body.alunoId,
      data: new Date(body.data),
      horario: body.horario,
      tipoAula: body.tipoAula,
      presente: body.presente ?? true,
      observacao: body.observacao,
    },
    update: {
      horario: body.horario,
      presente: body.presente,
      observacao: body.observacao,
    },
  });

  return ok({ presenca }, 201);
}
