import { AlunoStatus, MensalidadeStatus, Prisma, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { currentCompetencia, toCompetencia } from "@/lib/competencia";
import {
  buildVencimentoDate,
  cancelarMensalidadesFuturasDoAluno,
  generateMensalidadesAteCompetencia
} from "@/lib/services/mensalidades";
import { isModalidadePersonalizada } from "@/lib/services/modalidades";

const MENSALIDADE_STATUS_VALUES = new Set<MensalidadeStatus>(Object.values(MensalidadeStatus));

function toDateInputValue(date: Date | null | undefined) {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

function parseOptionalDate(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} inválida`);
  }
  return parsed;
}

function parseOptionalNumber(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`${fieldName} inválido`);
  }
  return parsed;
}

function parseOptionalMensalidadeStatus(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = String(value).toUpperCase() as MensalidadeStatus;
  if (!MENSALIDADE_STATUS_VALUES.has(parsed)) {
    throw new Error("status da mensalidade inválido");
  }
  return parsed;
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, UserRole.RECEPCAO);
  if (auth instanceof Response) return auth;

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const status = request.nextUrl.searchParams.get("status") ?? "";
  const modalidadeId = request.nextUrl.searchParams.get("modalidadeId") ?? "";

  const where: Prisma.AlunoWhereInput = {
    ...(status
      ? { status: status as never }
      : {
          OR: [
            { status: { in: [AlunoStatus.ATIVO, AlunoStatus.INATIVO] } },
            {
              status: { in: [AlunoStatus.CANCELADO, AlunoStatus.TRANCADO] },
              dataSaidaCancelamento: {
                gte: (() => {
                  const d = new Date();
                  d.setHours(0, 0, 0, 0);
                  d.setDate(1);
                  return d;
                })()
              }
            }
          ]
        }),
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
        dataInicio: toDateInputValue(aluno.dataInicio),
        dataSaidaCancelamento: toDateInputValue(aluno.dataSaidaCancelamento),
        modalidadeNome: aluno.modalidade?.nome ?? "",
        valorPlano: Number(aluno.modalidade?.valorPadrao ?? 0),
        inadimplente: inadimplencia > 0,
        mensalidadeAtual: aluno.mensalidades[0] ?? null,
        mensalidadeValor: aluno.mensalidades[0] ? Number(aluno.mensalidades[0].valor) : "",
        mensalidadeStatus: aluno.mensalidades[0]?.status ?? "",
        mensalidadeDataPagamento: aluno.mensalidades[0]?.dataPagamento
          ? toDateInputValue(aluno.mensalidades[0].dataPagamento)
          : "",
        mensalidadeFormaPagamento: aluno.mensalidades[0]?.formaPagamento ?? "",
        mensalidadeObservacao: aluno.mensalidades[0]?.observacao ?? "",
        proximoVencimento: (() => {
          const hoje = new Date();
          const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
          return new Date(hoje.getFullYear(), hoje.getMonth(), Math.min(ultimoDia, aluno.vencimentoDia));
        })()
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

  const vencimentoDia = Math.min(31, Math.max(1, Number(body.vencimentoDia)));
  const statusInformado = body.status ? (String(body.status) as AlunoStatus) : AlunoStatus.ATIVO;
  let mensalidadeValor: number | null = null;
  let mensalidadeDataPagamento: Date | null = null;
  let mensalidadeStatus: MensalidadeStatus | null = null;
  let dataSaidaCancelamento: Date | null = null;

  try {
    mensalidadeValor = parseOptionalNumber(body.mensalidadeValor, "valor da mensalidade");
    mensalidadeDataPagamento = parseOptionalDate(body.mensalidadeDataPagamento, "data de pagamento da mensalidade");
    mensalidadeStatus = parseOptionalMensalidadeStatus(body.mensalidadeStatus);
    dataSaidaCancelamento = parseOptionalDate(body.dataSaidaCancelamento, "data de saída/cancelamento");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Dados de mensalidade inválidos", 400);
  }
  const inicioMesAtual = new Date();
  inicioMesAtual.setHours(0, 0, 0, 0);
  inicioMesAtual.setDate(1);
  const status = dataSaidaCancelamento ? AlunoStatus.CANCELADO : statusInformado;
  const dataSaidaFinal =
    dataSaidaCancelamento ??
    (status === AlunoStatus.CANCELADO || status === AlunoStatus.TRANCADO ? inicioMesAtual : null);

  const created = await prisma.$transaction(async (tx) => {
    const aluno = await tx.aluno.create({
      data: {
        nomeCompleto: String(body.nomeCompleto),
        telefone: String(body.telefone),
        modalidadeId: body.modalidadeId ? String(body.modalidadeId) : null,
        vencimentoDia,
        status,
        dataInicio: new Date(String(body.dataInicio)),
        dataSaidaCancelamento: dataSaidaFinal,
        observacoes: body.observacoes ? String(body.observacoes) : null
      }
    });

    if (aluno.status === AlunoStatus.ATIVO) {
      const competencia = toCompetencia(new Date());

      const modalidade = aluno.modalidadeId
        ? await tx.modalidade.findUnique({
            where: { id: aluno.modalidadeId },
            select: { nome: true, valorPadrao: true }
          })
        : null;
      const valorPadrao = Number(modalidade?.valorPadrao ?? 0);
      const modalidadePersonalizada = isModalidadePersonalizada(modalidade?.nome);

      const competenciaMensalidade = competencia;
      const vencimentoPadrao = buildVencimentoDate(competenciaMensalidade, aluno.vencimentoDia);
      const statusMensalidade = mensalidadeStatus ?? MensalidadeStatus.PENDENTE;
      const dataPagamento =
        mensalidadeDataPagamento ??
        ((statusMensalidade === MensalidadeStatus.PAGO || statusMensalidade === MensalidadeStatus.PARCIAL) ? new Date() : null);
      const valorMensalidade = modalidadePersonalizada ? mensalidadeValor ?? valorPadrao : valorPadrao;
      const vencimentoMensalidade = vencimentoPadrao;

      await tx.mensalidade.upsert({
        where: {
          alunoId_competencia: {
            alunoId: aluno.id,
            competencia: competenciaMensalidade
          }
        },
        create: {
          alunoId: aluno.id,
          competencia: competenciaMensalidade,
          valor: valorMensalidade,
          vencimento: vencimentoMensalidade,
          status: statusMensalidade,
          dataPagamento,
          formaPagamento: body.mensalidadeFormaPagamento ? String(body.mensalidadeFormaPagamento) : null,
          observacao: body.mensalidadeObservacao ? String(body.mensalidadeObservacao) : null
        },
        update: {
          valor: valorMensalidade,
          vencimento: vencimentoMensalidade,
          status: statusMensalidade,
          dataPagamento,
          formaPagamento: body.mensalidadeFormaPagamento === "" ? null : (body.mensalidadeFormaPagamento as string | undefined),
          observacao: body.mensalidadeObservacao === "" ? null : (body.mensalidadeObservacao as string | undefined)
        }
      });
    }

    return aluno;
  });

  if (created.status === AlunoStatus.ATIVO) {
    await generateMensalidadesAteCompetencia(currentCompetencia(), [created.id]);
  }

  if (created.dataSaidaCancelamento || created.status === AlunoStatus.TRANCADO) {
    await cancelarMensalidadesFuturasDoAluno(created.id, created.dataSaidaCancelamento ?? inicioMesAtual);
  }

  return ok({ item: created }, 201);
}
