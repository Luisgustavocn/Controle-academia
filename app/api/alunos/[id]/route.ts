import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const aluno = await prisma.aluno.findUnique({ where: { id }, include: { modalidade: true } });
  if (!aluno) return fail("Aluno nao encontrado", 404);
  return ok({ aluno });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const aluno = await prisma.aluno.update({
    where: { id },
    data: {
      nomeCompleto: body.nomeCompleto,
      telefone: body.telefone,
      modalidadeId: body.modalidadeId,
      vencimentoDia: Number(body.vencimentoDia || 10),
      status: body.status,
      dataInicio: body.dataInicio ? new Date(body.dataInicio) : undefined,
      dataSaida: body.dataSaida ? new Date(body.dataSaida) : null,
      observacoes: body.observacoes,
    },
  });

  return ok({ aluno });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.aluno.delete({ where: { id } });
  return ok({ success: true });
}
