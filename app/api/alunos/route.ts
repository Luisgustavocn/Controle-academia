import { AlunoStatus, MensalidadeStatus, Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { hasCapability } from "@/lib/auth/capabilities";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { academyToday } from "@/lib/attendance-date";
import { studentActiveOnDateWhere } from "@/lib/services/enrollment-periods";
import { currentCompetencia, toCompetencia } from "@/lib/competencia";
import {
  buildVencimentoDate,
  generateMensalidadesAteCompetencia,
  resolveFutureMonthlyValue
} from "@/lib/services/mensalidades";

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
  if (!Number.isFinite(parsed) || parsed <= 0) {
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

function parseBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("regra de valor padrão inválida");
}

export async function GET(request: NextRequest) {
  const auth = requireCapability(request, "students.read");
  if (auth instanceof Response) return auth;
  const showFinancial = hasCapability(auth.role, "finance.monthlies.read");

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const status = request.nextUrl.searchParams.get("status") ?? "";
  const modalidadeId = request.nextUrl.searchParams.get("modalidadeId") ?? "";
  const onlyActiveEnrollment = request.nextUrl.searchParams.get("matriculaAtiva") === "true";

  const where: Prisma.AlunoWhereInput = {
    ...(onlyActiveEnrollment ? studentActiveOnDateWhere(academyToday()) : {}),
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
      _count: {
        select: {
          mensalidades: {
            where: {
              status: { in: [MensalidadeStatus.PENDENTE, MensalidadeStatus.ATRASADO] }
            }
          }
        }
      },
      mensalidades: {
        where: {
          competencia: competenciaAtual
        }
      },
      periodosMatricula: {
        include: { modalidade: true },
        orderBy: [{ dataInicio: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }]
      }
    },
    orderBy: { nomeCompleto: "asc" }
  });

  const items = alunos.map((aluno) => {
    const { _count, mensalidades, periodosMatricula, ...alunoData } = aluno;
    const today = new Date(`${academyToday()}T00:00:00.000Z`);
    const activePeriod = periodosMatricula.find((periodo) =>
      (!periodo.dataInicio || periodo.dataInicio <= today) && (!periodo.dataSaida || periodo.dataSaida >= today)
    );
    const displayPeriod = activePeriod ?? periodosMatricula[0];
    return {
      ...alunoData,
      dataInicio: toDateInputValue(aluno.dataInicio),
      dataSaidaCancelamento: toDateInputValue(aluno.dataSaidaCancelamento),
      modalidadeNome: displayPeriod?.modalidade?.nome ?? aluno.modalidade?.nome ?? "",
      valorPlano: resolveFutureMonthlyValue({
        individualValue: displayPeriod?.valorMensal === null || displayPeriod?.valorMensal === undefined ? null : Number(displayPeriod.valorMensal),
        useModalityDefault: displayPeriod?.usarValorPadrao ?? aluno.usarValorPadrao,
        modalityDefaultValue: displayPeriod?.modalidade?.valorPadrao === null || displayPeriod?.modalidade?.valorPadrao === undefined
          ? null
          : Number(displayPeriod.modalidade.valorPadrao)
      }),
      ...(showFinancial ? {
        inadimplente: _count.mensalidades > 0,
        mensalidadeAtual: mensalidades[0] ?? null,
        mensalidadeValor: mensalidades[0] ? Number(mensalidades[0].valor) : "",
        mensalidadeStatus: mensalidades[0]?.status ?? "",
        mensalidadeDataPagamento: mensalidades[0]?.dataPagamento
          ? toDateInputValue(mensalidades[0].dataPagamento)
          : "",
        mensalidadeFormaPagamento: mensalidades[0]?.formaPagamento ?? "",
        mensalidadeObservacao: mensalidades[0]?.observacao ?? ""
      } : {}),
      proximoVencimento: activePeriod ? (() => {
        const hoje = new Date();
        const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
        return new Date(hoje.getFullYear(), hoje.getMonth(), Math.min(ultimoDia, activePeriod.diaVencimento));
      })() : null
    };
  });

  return ok({ items });
}

export async function POST(request: NextRequest) {
  const auth = requireCapability(request, "students.create");
  if (auth instanceof Response) return auth;

  const body = (await request.json()) as Record<string, unknown>;

  if (!body.nomeCompleto || !body.telefone || !body.vencimentoDia) {
    return fail("Campos obrigatórios: nomeCompleto, telefone, vencimentoDia", 400);
  }

  const vencimentoDia = Math.min(31, Math.max(1, Number(body.vencimentoDia)));
  const statusInformado = body.status ? (String(body.status) as AlunoStatus) : AlunoStatus.ATIVO;
  let mensalidadeValor: number | null = null;
  let mensalidadeDataPagamento: Date | null = null;
  let mensalidadeStatus: MensalidadeStatus | null = null;
  let dataSaidaCancelamento: Date | null = null;
  let dataInicio: Date | null = null;
  let usarValorPadrao = true;

  try {
    mensalidadeValor = parseOptionalNumber(body.valorMensal ?? body.mensalidadeValor, "valor mensal");
    mensalidadeDataPagamento = parseOptionalDate(body.mensalidadeDataPagamento, "data de pagamento da mensalidade");
    mensalidadeStatus = parseOptionalMensalidadeStatus(body.mensalidadeStatus);
    dataSaidaCancelamento = parseOptionalDate(body.dataSaidaCancelamento, "data de saída/cancelamento");
    dataInicio = parseOptionalDate(body.dataInicio, "data de início");
    usarValorPadrao = parseBoolean(body.usarValorPadrao, true);
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
        dataInicio,
        valorMensal: mensalidadeValor,
        usarValorPadrao,
        dataSaidaCancelamento: dataSaidaFinal,
        observacoes: body.observacoes ? String(body.observacoes) : null
      }
    });

    if (aluno.status === AlunoStatus.ATIVO) {
      await tx.periodoMatricula.create({
        data: {
          alunoId: aluno.id,
          dataInicio: aluno.dataInicio,
          modalidadeId: aluno.modalidadeId,
          valorMensal: aluno.valorMensal,
          usarValorPadrao: aluno.usarValorPadrao,
          diaVencimento: aluno.vencimentoDia,
          createdBy: auth.id
        }
      });
    }

    if (aluno.status === AlunoStatus.ATIVO && aluno.dataInicio) {
      const competencia = toCompetencia(new Date());

      const modalidade = aluno.modalidadeId
        ? await tx.modalidade.findUnique({
            where: { id: aluno.modalidadeId },
            select: { nome: true, valorPadrao: true }
          })
        : null;
      const valorPadrao = modalidade?.valorPadrao === null || modalidade?.valorPadrao === undefined
        ? null
        : Number(modalidade.valorPadrao);

      const competenciaMensalidade = competencia;
      const vencimentoPadrao = buildVencimentoDate(competenciaMensalidade, aluno.vencimentoDia);
      const statusMensalidade = mensalidadeStatus ?? MensalidadeStatus.PENDENTE;
      const dataPagamento =
        mensalidadeDataPagamento ??
        ((statusMensalidade === MensalidadeStatus.PAGO || statusMensalidade === MensalidadeStatus.PARCIAL) ? new Date() : null);
      const valorMensalidade = resolveFutureMonthlyValue({
        individualValue: mensalidadeValor,
        useModalityDefault: usarValorPadrao,
        modalityDefaultValue: valorPadrao
      });
      const vencimentoMensalidade = vencimentoPadrao;

      if (valorMensalidade !== null) await tx.mensalidade.upsert({
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

  if (created.status === AlunoStatus.ATIVO && created.dataInicio) {
    await generateMensalidadesAteCompetencia(currentCompetencia(), [created.id]);
  }

  return ok({ item: created }, 201);
}
