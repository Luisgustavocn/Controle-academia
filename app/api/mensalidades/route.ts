import { MensalidadeStatus, Prisma, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { currentCompetencia } from "@/lib/competencia";
import { logAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const auth = requireRole(request, UserRole.RECEPCAO);
  if (auth instanceof Response) return auth;

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const competencia = request.nextUrl.searchParams.get("competencia") ?? currentCompetencia();
  const status = request.nextUrl.searchParams.get("status") ?? "";

  const where: Prisma.MensalidadeWhereInput = {
    competencia,
    ...(status ? { status: status as MensalidadeStatus } : {}),
    ...(q
      ? {
          aluno: {
            OR: [
              { nomeCompleto: { contains: q, mode: Prisma.QueryMode.insensitive } },
              { telefone: { contains: q, mode: Prisma.QueryMode.insensitive } }
            ]
          }
        }
      : {})
  };

  const mensalidades = await prisma.mensalidade.findMany({
    where,
    include: {
      aluno: {
        include: {
          modalidade: true
        }
      }
    },
    orderBy: [{ competencia: "desc" }, { aluno: { nomeCompleto: "asc" } }]
  });

  const totalPagoAno = await prisma.mensalidade.groupBy({
    by: ["alunoId"],
    where: {
      competencia: {
        startsWith: competencia.slice(0, 4)
      },
      status: { in: [MensalidadeStatus.PAGO, MensalidadeStatus.PARCIAL] }
    },
    _sum: {
      valor: true
    }
  });

  const paidMap = new Map(totalPagoAno.map((item) => [item.alunoId, Number(item._sum.valor || 0)]));

  const items = mensalidades.map((mensalidade) => ({
    ...mensalidade,
    totalPagoAno: paidMap.get(mensalidade.alunoId) ?? 0,
    nome: mensalidade.aluno.nomeCompleto,
    telefone: mensalidade.aluno.telefone,
    modalidade: mensalidade.aluno.modalidade?.nome ?? ""
  }));

  const totalRecebidoMes = mensalidades
    .filter((m) => m.status === MensalidadeStatus.PAGO || m.status === MensalidadeStatus.PARCIAL)
    .reduce((acc, item) => acc + Number(item.valor), 0);
  const totalPrevistoMes = mensalidades.reduce((acc, item) => acc + Number(item.valor), 0);
  const inadimplentes = mensalidades.filter((m) => m.status === MensalidadeStatus.PENDENTE || m.status === MensalidadeStatus.ATRASADO).length;

  return ok({
    items,
    resumo: {
      competencia,
      totalRecebidoMes,
      totalPrevistoMes,
      inadimplentes
    }
  });
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, UserRole.FINANCEIRO);
  if (auth instanceof Response) return auth;

  const body = (await request.json()) as Record<string, unknown>;
  const alunoId = String(body.alunoId ?? "");
  const competencia = String(body.competencia ?? "");
  const valor = Number(body.valor ?? 0);

  if (!alunoId || !competencia || !valor) {
    return fail("alunoId, competencia e valor são obrigatórios", 400);
  }

  const vencimento = body.vencimento ? new Date(String(body.vencimento)) : new Date(`${competencia}-10T00:00:00.000Z`);

  const upserted = await prisma.mensalidade.upsert({
    where: {
      alunoId_competencia: {
        alunoId,
        competencia
      }
    },
    create: {
      alunoId,
      competencia,
      valor,
      vencimento,
      status: body.status ? (String(body.status) as MensalidadeStatus) : MensalidadeStatus.PENDENTE,
      formaPagamento: body.formaPagamento ? String(body.formaPagamento) : null,
      dataPagamento: body.dataPagamento ? new Date(String(body.dataPagamento)) : null,
      observacao: body.observacao ? String(body.observacao) : null
    },
    update: {
      valor,
      vencimento,
      status: body.status ? (String(body.status) as MensalidadeStatus) : undefined,
      formaPagamento: body.formaPagamento ? String(body.formaPagamento) : undefined,
      dataPagamento: body.dataPagamento ? new Date(String(body.dataPagamento)) : undefined,
      observacao: body.observacao === "" ? null : (body.observacao as string | undefined)
    }
  });

  await logAudit({
    userId: auth.id,
    modulo: "mensalidades",
    entidade: "Mensalidade",
    entidadeId: upserted.id,
    acao: "UPSERT",
    depois: upserted
  });

  return ok({ item: upserted }, 201);
}
