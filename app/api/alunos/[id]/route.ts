import { AlunoStatus, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, UserRole.RECEPCAO);
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const body = (await request.json()) as Record<string, unknown>;

  const previous = await prisma.aluno.findUnique({
    where: { id },
    include: { modalidade: true }
  });

  if (!previous) {
    return fail("Aluno não encontrado", 404);
  }

  const updated = await prisma.aluno.update({
    where: { id },
    data: {
      nomeCompleto: body.nomeCompleto ? String(body.nomeCompleto) : undefined,
      telefone: body.telefone ? String(body.telefone) : undefined,
      modalidadeId: body.modalidadeId === "" ? null : (body.modalidadeId as string | undefined),
      vencimentoDia: body.vencimentoDia ? Math.min(31, Math.max(1, Number(body.vencimentoDia))) : undefined,
      status: body.status ? (String(body.status) as AlunoStatus) : undefined,
      dataInicio: body.dataInicio ? new Date(String(body.dataInicio)) : undefined,
      dataSaidaCancelamento: body.dataSaidaCancelamento === "" ? null : body.dataSaidaCancelamento ? new Date(String(body.dataSaidaCancelamento)) : undefined,
      observacoes: body.observacoes === "" ? null : (body.observacoes as string | undefined)
    },
    include: { modalidade: true }
  });

  if (previous.modalidadeId !== updated.modalidadeId) {
    await prisma.historicoPlano.create({
      data: {
        alunoId: id,
        modalidadeAnterior: previous.modalidade?.nome,
        modalidadeNova: updated.modalidade?.nome ?? "Sem modalidade",
        valorAnterior: previous.modalidade?.valorPadrao,
        valorNovo: updated.modalidade?.valorPadrao,
        observacao: `Alterado por ${auth.name}`
      }
    });
  }

  return ok({ item: updated });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, UserRole.ADMIN);
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  await prisma.aluno.delete({ where: { id } });
  return ok({ ok: true });
}
