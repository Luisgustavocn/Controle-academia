import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const item = await prisma.agendaPersonal.update({
    where: { id },
    data: {
      professor: body.professor,
      diaSemana: Number(body.diaSemana),
      horario: body.horario,
      alunoId: body.alunoId || null,
      alunoNome: body.alunoNome || null,
      tipoAula: body.tipoAula,
      observacao: body.observacao,
      ativo: body.ativo,
    },
  });
  return ok({ item });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.agendaPersonal.delete({ where: { id } });
  return ok({ success: true });
}
