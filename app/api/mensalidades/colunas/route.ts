import { MensalidadeStatus, Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { currentCompetencia } from "@/lib/competencia";
import { ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { garantirMensalidadesDoMesAtual } from "@/lib/services/mensalidades";

const MONTH_SHORT_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

function formatMonthDay(date: Date | null | undefined) {
  if (!date) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = MONTH_SHORT_PT[date.getMonth()] ?? String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

function formatCompetenciaLabel(competencia: string) {
  const [year, month] = competencia.split("-");
  return `${month}/${year}`;
}

function toValidCompetencia(value: string | null) {
  if (!value) return "";
  return /^\d{4}-\d{2}$/.test(value) ? value : "";
}

function competenciaRange(competencia: string) {
  const start = new Date(`${competencia}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

function buildAlunoSearch(q: string): Prisma.MensalidadeWhereInput {
  if (!q) return {};

  return {
    aluno: {
      OR: [
        { nomeCompleto: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { telefone: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { id: { contains: q, mode: Prisma.QueryMode.insensitive } }
      ]
    }
  };
}

function serializeItem(item: {
  id: string;
  alunoId: string;
  competencia: string;
  valor: Prisma.Decimal;
  vencimento: Date;
  dataPagamento: Date | null;
  formaPagamento: string | null;
  status: MensalidadeStatus;
  observacao: string | null;
  aluno: {
    nomeCompleto: string;
    telefone: string;
    modalidade: { nome: string } | null;
  };
}) {
  return {
    id: item.id,
    alunoId: item.alunoId,
    alunoNome: item.aluno.nomeCompleto,
    telefone: item.aluno.telefone,
    modalidade: item.aluno.modalidade?.nome ?? "",
    competencia: item.competencia,
    mesPendente: formatCompetenciaLabel(item.competencia),
    valor: Number(item.valor),
    vencimento: formatMonthDay(item.vencimento),
    vencimentoDia: item.vencimento.getDate(),
    dataPagamento: formatMonthDay(item.dataPagamento),
    formaPagamento: item.formaPagamento ?? "",
    observacao: item.observacao ?? "",
    status: item.status
  };
}

export async function GET(request: NextRequest) {
  const auth = requireCapability(request, "finance.monthlies.read");
  if (auth instanceof Response) return auth;

  await garantirMensalidadesDoMesAtual();

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const referencia = toValidCompetencia(request.nextUrl.searchParams.get("competencia")) || currentCompetencia();
  const { start, end } = competenciaRange(referencia);

  const includeAluno = {
    aluno: {
      include: {
        modalidade: true
      }
    }
  } satisfies Prisma.MensalidadeInclude;

  const alunoSearch = buildAlunoSearch(q);

  const [pagas, pendentes, atrasadas, recebidasNoMes] = await Promise.all([
    prisma.mensalidade.findMany({
      where: {
        competencia: referencia,
        status: MensalidadeStatus.PAGO,
        ...alunoSearch
      },
      include: includeAluno,
      orderBy: [{ aluno: { nomeCompleto: "asc" } }]
    }),
    prisma.mensalidade.findMany({
      where: {
        competencia: referencia,
        status: MensalidadeStatus.PENDENTE,
        ...alunoSearch
      },
      include: includeAluno,
      orderBy: [{ vencimento: "asc" }, { aluno: { nomeCompleto: "asc" } }]
    }),
    prisma.mensalidade.findMany({
      where: {
        status: MensalidadeStatus.ATRASADO,
        ...alunoSearch
      },
      include: includeAluno,
      orderBy: [{ vencimento: "asc" }, { competencia: "asc" }, { aluno: { nomeCompleto: "asc" } }]
    }),
    prisma.mensalidade.findMany({
      where: {
        status: {
          in: [MensalidadeStatus.PAGO, MensalidadeStatus.PARCIAL]
        },
        dataPagamento: {
          gte: start,
          lt: end
        },
        ...alunoSearch
      },
      select: {
        valor: true
      }
    })
  ]);

  const pagasSerialized = pagas.map(serializeItem);
  const pendentesSerialized = pendentes.map(serializeItem);
  const atrasadasSerialized = atrasadas.map(serializeItem);

  // Regime de caixa: recebido no mês é baseado na data de pagamento, não na competência.
  const totalPagoMes = recebidasNoMes.reduce((acc, item) => acc + Number(item.valor), 0);
  const totalPendenteMes = pendentesSerialized.reduce((acc, item) => acc + item.valor, 0);
  const totalAtrasado = atrasadasSerialized.reduce((acc, item) => acc + item.valor, 0);

  return ok({
    referencia,
    referenciaLabel: formatCompetenciaLabel(referencia),
    colunas: {
      pagas: pagasSerialized,
      pendentes: pendentesSerialized,
      atrasadas: atrasadasSerialized
    },
    resumo: {
      pagas: pagasSerialized.length,
      pendentes: pendentesSerialized.length,
      atrasadas: atrasadasSerialized.length,
      totalPagoMes,
      totalPendenteMes,
      totalAtrasado
    }
  });
}
