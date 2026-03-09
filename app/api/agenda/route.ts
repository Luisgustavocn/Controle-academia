import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";

export async function GET() {
  const itens = await prisma.agendaPersonal.findMany({ include: { aluno: true }, orderBy: [{ professor: "asc" }, { diaSemana: "asc" }, { horario: "asc" }] });
  return ok({ itens });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const item = await prisma.agendaPersonal.create({
    data: {
      professor: body.professor,
      diaSemana: Number(body.diaSemana),
      horario: body.horario,
      alunoId: body.alunoId || null,
      alunoNome: body.alunoNome || null,
      tipoAula: body.tipoAula,
      observacao: body.observacao,
      ativo: body.ativo ?? true,
    },
  });
  return ok({ item }, 201);
}
