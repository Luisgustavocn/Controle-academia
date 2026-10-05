import { AlunoStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { currentCompetencia } from "@/lib/competencia";
import { generateMensalidadesAteCompetencia } from "@/lib/services/mensalidades";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireCapability(request, "students.status");
  if (auth instanceof Response) return auth;

  const { id } = await context.params;

  const origem = await prisma.aluno.findUnique({
    where: { id },
    include: {
      modalidade: true
    }
  });

  if (!origem) {
    return fail("Aluno não encontrado", 404);
  }

  if (origem.status !== AlunoStatus.CANCELADO && origem.status !== AlunoStatus.TRANCADO) {
    return fail("Só é possível reativar como novo cadastro alunos cancelados ou trancados", 400);
  }

  const hoje = new Date();

  const novoCadastro = await prisma.aluno.create({
    data: {
      nomeCompleto: origem.nomeCompleto,
      telefone: origem.telefone,
      modalidadeId: origem.modalidadeId,
      vencimentoDia: origem.vencimentoDia,
      status: AlunoStatus.ATIVO,
      dataInicio: hoje,
      dataSaidaCancelamento: null,
      observacoes: origem.observacoes
        ? `${origem.observacoes}\n\nReativado como novo cadastro em ${hoje.toLocaleDateString("pt-BR")} (origem: ${origem.id})`
        : `Reativado como novo cadastro em ${hoje.toLocaleDateString("pt-BR")} (origem: ${origem.id})`
    }
  });

  await generateMensalidadesAteCompetencia(currentCompetencia(), [novoCadastro.id]);

  return ok({
    item: novoCadastro,
    origemId: origem.id
  });
}
