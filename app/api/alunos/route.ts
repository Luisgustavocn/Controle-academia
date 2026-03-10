import { AlunoStatus, Prisma, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { toCompetencia } from "@/lib/competencia";

export async function GET(request: NextRequest) {
  const auth = requireRole(request, UserRole.RECEPCAO);
  if (auth instanceof Response) return auth;

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const status = request.nextUrl.searchParams.get("status") ?? "";
  const modalidadeId = request.nextUrl.searchParams.get("modalidadeId") ?? "";

  const where: Prisma.AlunoWhereInput = {
    ...(status ? { status: status as never } : {}),
    ...(modalidadeId ? { modalidadeId } : {}),
    ...(q
      ? {
          OR: [
            { nomeCompleto: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { telefone: { contains: q, mode: Prisma.QueryMode.insensitive } }
          ]
        }
      : {})
  };

  const competenciaAtual = toCompetencia(new Date());

  const alunos = await prisma.aluno.findMany({
    where,
    include: {
      modalidade: true,
      mensalidades: {
        where: {
          competencia: competenciaAtual
        }
      }
    },
    orderBy: { nomeCompleto: "asc" }
  });

  const items = await Promise.all(
    alunos.map(async (aluno) => {
      const inadimplencia = await prisma.mensalidade.count({
        where: {
          alunoId: aluno.id,
          status: { in: ["PENDENTE", "ATRASADO"] }
        }
      });

      return {
        ...aluno,
        modalidadeNome: aluno.modalidade?.nome ?? "",
        valorPlano: Number(aluno.modalidade?.valorPadrao ?? 0),
        inadimplente: inadimplencia > 0,
        mensalidadeAtual: aluno.mensalidades[0] ?? null,
        proximoVencimento: new Date(new Date().getFullYear(), new Date().getMonth(), Math.min(28, aluno.vencimentoDia))
      };
    })
  );

  return ok({ items });
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, UserRole.RECEPCAO);
  if (auth instanceof Response) return auth;

  const body = (await request.json()) as Record<string, unknown>;

  if (!body.nomeCompleto || !body.telefone || !body.vencimentoDia || !body.dataInicio) {
    return fail("Campos obrigatórios: nomeCompleto, telefone, vencimentoDia, dataInicio", 400);
  }

  const created = await prisma.aluno.create({
    data: {
      nomeCompleto: String(body.nomeCompleto),
      telefone: String(body.telefone),
      modalidadeId: body.modalidadeId ? String(body.modalidadeId) : null,
      vencimentoDia: Math.min(31, Math.max(1, Number(body.vencimentoDia))),
      status: body.status ? (String(body.status) as AlunoStatus) : AlunoStatus.ATIVO,
      dataInicio: new Date(String(body.dataInicio)),
      dataSaidaCancelamento: body.dataSaidaCancelamento ? new Date(String(body.dataSaidaCancelamento)) : null,
      observacoes: body.observacoes ? String(body.observacoes) : null
    }
  });

  return ok({ item: created }, 201);
}
