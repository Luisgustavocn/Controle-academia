import { MensalidadeStatus, Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { currentCompetencia } from "@/lib/competencia";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { syncAutomaticEntriesInCaixa } from "@/lib/services/caixa";
import { buildVencimentoDate, garantirMensalidadesDoMesAtual, resolveFutureMonthlyValue } from "@/lib/services/mensalidades";
import { findEnrollmentForCompetence } from "@/lib/services/enrollment-periods";

const MENSALIDADE_STATUS_VALUES = new Set<MensalidadeStatus>(Object.values(MensalidadeStatus));

function formatMonthDay(date: Date | null | undefined) {
  if (!date) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

function parseMonthDayOrDate(value: unknown, competenciaRef: string, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`${fieldName} inválida`);
    }
    return parsed;
  }

  const match = /^(\d{1,2})[-/](\d{1,2})$/.exec(raw);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) {
      throw new Error(`${fieldName} inválida`);
    }
    const [competenciaYearRaw, competenciaMonthRaw] = competenciaRef.split("-").map(Number);
    const competenciaYear = Number.isInteger(competenciaYearRaw) ? competenciaYearRaw : new Date().getFullYear();
    const competenciaMonth = Number.isInteger(competenciaMonthRaw) ? competenciaMonthRaw : new Date().getMonth() + 1;
    const resolvedYear = month > competenciaMonth ? competenciaYear - 1 : competenciaYear;
    return new Date(resolvedYear, month - 1, day);
  }

  throw new Error(`${fieldName} inválida. Use MM-DD`);
}

function parseStatus(value: unknown, fallback: MensalidadeStatus) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).toUpperCase() as MensalidadeStatus;
  if (!MENSALIDADE_STATUS_VALUES.has(normalized)) {
    throw new Error("Status de mensalidade inválido");
  }
  return normalized;
}

function toCompetenciaIfValid(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  const raw = String(value);
  return /^\d{4}-\d{2}$/.test(raw) ? raw : "";
}

export async function GET(request: NextRequest) {
  const auth = requireCapability(request, "finance.monthlies.read");
  if (auth instanceof Response) return auth;

  await garantirMensalidadesDoMesAtual();

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const competencia = request.nextUrl.searchParams.get("competencia") ?? "";
  const status = request.nextUrl.searchParams.get("status") ?? "";

  const where: Prisma.MensalidadeWhereInput = {
    ...(competencia ? { competencia } : {}),
    ...(status && MENSALIDADE_STATUS_VALUES.has(status as MensalidadeStatus)
      ? { status: status as MensalidadeStatus }
      : {}),
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

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const items = mensalidades.map((mensalidade) => {
    const vencimento = new Date(mensalidade.vencimento);
    vencimento.setHours(0, 0, 0, 0);
    const avisoNaoPago =
      (mensalidade.status === MensalidadeStatus.PENDENTE || mensalidade.status === MensalidadeStatus.ATRASADO) &&
      vencimento.getTime() < hoje.getTime();

    return {
      ...mensalidade,
      valor: Number(mensalidade.valor),
      vencimento: formatMonthDay(mensalidade.vencimento),
      dataPagamento: formatMonthDay(mensalidade.dataPagamento),
      avisoPagamento: avisoNaoPago ? "Não pago" : "",
      nome: mensalidade.aluno.nomeCompleto,
      telefone: mensalidade.aluno.telefone,
      modalidade: mensalidade.aluno.modalidade?.nome ?? ""
    };
  });

  const resumo = {
    competenciaAtual: currentCompetencia(),
    pagas: items.filter((item) => item.status === MensalidadeStatus.PAGO).length,
    pendentes: items.filter((item) => item.status === MensalidadeStatus.PENDENTE).length,
    atrasadas: items.filter((item) => item.status === MensalidadeStatus.ATRASADO).length
  };

  return ok({ items, resumo });
}

export async function POST(request: NextRequest) {
  const auth = requireCapability(request, "finance.monthlies.manage");
  if (auth instanceof Response) return auth;

  const body = (await request.json()) as Record<string, unknown>;
  const alunoId = String(body.alunoId ?? "").trim();
  if (!alunoId) {
    return fail("alunoId é obrigatório", 400);
  }

  const aluno = await prisma.aluno.findUnique({
    where: { id: alunoId },
    include: { modalidade: true }
  });

  if (!aluno) {
    return fail("Aluno não encontrado", 404);
  }

  const competenciaInformada = toCompetenciaIfValid(body.competencia);
  const competencia = competenciaInformada || currentCompetencia();
  const period = await findEnrollmentForCompetence(prisma, alunoId, competencia);

  let dataPagamento: Date | null = null;
  try {
    dataPagamento = parseMonthDayOrDate(body.dataPagamento, competencia, "dataPagamento");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Data inválida", 400);
  }

  const vencimentoPadrao = buildVencimentoDate(competencia, period?.diaVencimento ?? aluno.vencimentoDia);

  const valorInformado = body.valor === undefined || body.valor === null || body.valor === ""
    ? resolveFutureMonthlyValue({
        individualValue: period?.valorMensal === null || period?.valorMensal === undefined ? null : Number(period.valorMensal),
        useModalityDefault: period?.usarValorPadrao ?? aluno.usarValorPadrao,
        modalityDefaultValue: period?.modalidade?.valorPadrao === null || period?.modalidade?.valorPadrao === undefined
          ? null
          : Number(period.modalidade.valorPadrao)
      })
    : Number(body.valor);

  if (valorInformado === null) {
    return fail("Informe um valor: o aluno não possui cobrança automática configurada", 400);
  }
  if (!Number.isFinite(valorInformado) || valorInformado <= 0) {
    return fail("valor inválido", 400);
  }

  let status: MensalidadeStatus;
  try {
    status = parseStatus(body.status, MensalidadeStatus.PENDENTE);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Status inválido", 400);
  }

  if (status === MensalidadeStatus.PAGO && !dataPagamento) {
    dataPagamento = new Date();
  }

  const mensalidade = await prisma.mensalidade.upsert({
    where: {
      alunoId_competencia: {
        alunoId,
        competencia
      }
    },
    create: {
      alunoId,
      competencia,
      valor: valorInformado,
      vencimento: vencimentoPadrao,
      dataPagamento,
      formaPagamento: body.formaPagamento ? String(body.formaPagamento) : null,
      status,
      observacao: body.observacao ? String(body.observacao) : null
    },
    update: {
      dataPagamento,
      formaPagamento: body.formaPagamento === "" ? null : (body.formaPagamento as string | undefined),
      status,
      observacao: body.observacao === "" ? null : (body.observacao as string | undefined)
    }
  });

  await logAudit({
    userId: auth.id,
    modulo: "mensalidades",
    entidade: "Mensalidade",
    entidadeId: mensalidade.id,
    acao: "UPSERT",
    depois: mensalidade
  });

  await syncAutomaticEntriesInCaixa(true);

  return ok({ item: mensalidade }, 201);
}
