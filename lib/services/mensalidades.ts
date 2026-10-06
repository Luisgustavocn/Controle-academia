import { MensalidadeStatus, Prisma, type PrismaClient } from "@prisma/client";
import { endOfMonth, format, startOfDay, startOfMonth } from "date-fns";
import { currentCompetencia } from "@/lib/competencia";
import { prisma } from "@/lib/prisma";
import { civilMonthRange } from "@/lib/attendance-date";
import { findEnrollmentForCompetence } from "@/lib/services/enrollment-periods";

type DbClient = PrismaClient | Prisma.TransactionClient;

export function buildVencimentoDate(competencia: string, vencimentoDia: number) {
  const [year, month] = competencia.split("-").map(Number);
  const ultimoDiaDoMes = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, Math.min(ultimoDiaDoMes, Math.max(1, vencimentoDia)));
}

export function competenciaFromUtcDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function resolveFutureMonthlyValue(input: {
  individualValue?: number | null;
  useModalityDefault: boolean;
  modalityDefaultValue?: number | null;
}) {
  if (input.individualValue !== null && input.individualValue !== undefined && input.individualValue > 0) {
    return input.individualValue;
  }
  if (input.useModalityDefault && input.modalityDefaultValue !== null && input.modalityDefaultValue !== undefined && input.modalityDefaultValue > 0) {
    return input.modalityDefaultValue;
  }
  return null;
}

export async function ensureMensalidadeForActivity(
  client: DbClient,
  alunoId: string,
  competencia: string,
  referenceDate = new Date()
) {
  const existing = await client.mensalidade.findUnique({
    where: { alunoId_competencia: { alunoId, competencia } }
  });
  if (existing) return { mensalidade: existing, created: false };

  const period = await findEnrollmentForCompetence(client, alunoId, competencia);
  if (!period) return { mensalidade: null, created: false };
  const valor = resolveFutureMonthlyValue({
    individualValue: period.valorMensal === null ? null : Number(period.valorMensal),
    useModalityDefault: period.usarValorPadrao,
    modalityDefaultValue: period.modalidade?.valorPadrao === null || period.modalidade?.valorPadrao === undefined
      ? null
      : Number(period.modalidade.valorPadrao)
  });
  if (valor === null) return { mensalidade: null, created: false };

  const vencimento = buildVencimentoDate(competencia, period.diaVencimento);
  const status = vencimento < startOfDay(referenceDate) ? MensalidadeStatus.ATRASADO : MensalidadeStatus.PENDENTE;
  const mensalidade = await client.mensalidade.upsert({
    where: { alunoId_competencia: { alunoId, competencia } },
    create: { alunoId, competencia, valor, vencimento, status },
    update: {}
  });
  return { mensalidade, created: true };
}

export async function generateMensalidadesCompetencia(competencia: string, referenceDate = new Date()) {
  const { start, end } = civilMonthRange(competencia);
  const activeStudents = await prisma.presenca.groupBy({
    by: ["alunoId"],
    where: { presente: true, data: { gte: start, lt: end } }
  });
  let totalGerado = 0;
  for (const { alunoId } of activeStudents) {
    const result = await ensureMensalidadeForActivity(prisma, alunoId, competencia, referenceDate);
    if (result.created) totalGerado += 1;
  }
  return { competencia, totalGerado };
}

export async function generateMensalidadesAteCompetencia(
  competenciaLimite = currentCompetencia(),
  alunoIds?: string[]
) {
  const presencas = await prisma.presenca.findMany({
    where: {
      presente: true,
      data: { lt: civilMonthRange(competenciaLimite).end },
      ...(alunoIds && alunoIds.length > 0 ? { alunoId: { in: alunoIds } } : {})
    },
    select: { alunoId: true, data: true }
  });
  const activityKeys = new Map<string, { alunoId: string; competencia: string }>();
  for (const presence of presencas) {
    const competencia = competenciaFromUtcDate(presence.data);
    activityKeys.set(`${presence.alunoId}:${competencia}`, { alunoId: presence.alunoId, competencia });
  }
  let totalGerado = 0;
  for (const activity of activityKeys.values()) {
    const result = await ensureMensalidadeForActivity(prisma, activity.alunoId, activity.competencia);
    if (result.created) totalGerado += 1;
  }
  return { competenciaLimite, totalGerado };
}

export async function atualizarStatusMensalidadesAtrasadas() {
  const inicioDoDia = startOfDay(new Date());
  const voltaramPendentes = await prisma.mensalidade.updateMany({
    where: {
      status: MensalidadeStatus.ATRASADO,
      dataPagamento: null,
      vencimento: {
        gte: inicioDoDia
      }
    },
    data: {
      status: MensalidadeStatus.PENDENTE
    }
  });

  const ficaramAtrasadas = await prisma.mensalidade.updateMany({
    where: {
      status: MensalidadeStatus.PENDENTE,
      vencimento: {
        lt: inicioDoDia
      }
    },
    data: {
      status: MensalidadeStatus.ATRASADO
    }
  });

  return ficaramAtrasadas.count + voltaramPendentes.count;
}

export async function garantirMensalidadesDoMesAtual(competencia = currentCompetencia()) {
  const atualizadasAtrasadas = await atualizarStatusMensalidadesAtrasadas();

  return {
    competencia,
    // Leituras não materializam cobranças. Presença ou pagamento explícito fazem isso.
    totalGerado: 0,
    // Mensalidades emitidas são snapshots. Mudanças cadastrais não recalculam vencimentos existentes.
    totalVencimentosSincronizados: 0,
    totalAtrasadasAtualizadas: atualizadasAtrasadas
  };
}

export async function totalsMensalidadesPorMes(competencia: string) {
  const start = new Date(`${competencia}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  const [mensalidadesCompetencia, mensalidadesRecebidasNoMes] = await Promise.all([
    prisma.mensalidade.findMany({
      where: { competencia }
    }),
    prisma.mensalidade.findMany({
      where: {
        status: {
          in: [MensalidadeStatus.PAGO, MensalidadeStatus.PARCIAL]
        },
        dataPagamento: {
          gte: start,
          lt: end
        }
      },
      select: {
        valor: true
      }
    })
  ]);

  // Regime de caixa: total recebido no mês é somado por data de pagamento.
  const totalRecebido = mensalidadesRecebidasNoMes.reduce((acc, item) => acc + Number(item.valor), 0);

  const inadimplentes = mensalidadesCompetencia.filter(
    (item) => item.status === MensalidadeStatus.PENDENTE || item.status === MensalidadeStatus.ATRASADO
  ).length;

  return {
    competencia,
    totalRecebido,
    inadimplentes
  };
}

export async function buildMonthlyStudentControl(competencia: string) {
  const date = new Date(`${competencia}-01T00:00:00.000Z`);
  const ini = startOfMonth(date);
  const fim = endOfMonth(date);

  const inicioMes = await prisma.aluno.count({
    where: {
      periodosMatricula: { some: {
        AND: [
          { OR: [{ dataInicio: null }, { dataInicio: { lte: ini } }] },
          { OR: [{ dataSaida: null }, { dataSaida: { gte: ini } }] }
        ]
      } }
    }
  });

  const entrou = await prisma.periodoMatricula.count({
    where: {
      dataInicio: {
        gte: ini,
        lte: fim
      }
    }
  });

  const saiu = await prisma.periodoMatricula.count({
    where: {
      dataSaida: {
        gte: ini,
        lte: fim
      }
    }
  });

  const totalFinal = await prisma.aluno.count({
    where: {
      periodosMatricula: { some: {
        AND: [
          { OR: [{ dataInicio: null }, { dataInicio: { lte: fim } }] },
          { OR: [{ dataSaida: null }, { dataSaida: { gte: fim } }] }
        ]
      } }
    }
  });

  const saved = await prisma.controleMensalAlunos.upsert({
    where: { competencia },
    create: {
      competencia,
      inicioMes,
      entrou,
      saiu,
      totalFinal,
      ajusteManual: false
    },
    update: {
      inicioMes,
      entrou,
      saiu,
      totalFinal,
      ajusteManual: false
    }
  });

  return saved;
}

export function monthRange(reference = new Date(), size = 12): string[] {
  return Array.from({ length: size }, (_, index) => {
    const month = new Date(reference.getFullYear(), reference.getMonth() - (size - 1 - index), 1);
    return format(month, "yyyy-MM");
  });
}
