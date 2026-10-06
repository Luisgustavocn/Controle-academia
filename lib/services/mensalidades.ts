import { MensalidadeStatus } from "@prisma/client";
import { endOfMonth, format, startOfDay, startOfMonth } from "date-fns";
import { currentCompetencia } from "@/lib/competencia";
import { prisma } from "@/lib/prisma";
import { enrollmentCoversCompetenceWhere } from "@/lib/services/enrollment-periods";

export function buildVencimentoDate(competencia: string, vencimentoDia: number) {
  const [year, month] = competencia.split("-").map(Number);
  const ultimoDiaDoMes = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, Math.min(ultimoDiaDoMes, Math.max(1, vencimentoDia)));
}

function competenciasBetween(startCompetencia: string, endCompetencia: string) {
  const [startYear, startMonth] = startCompetencia.split("-").map(Number);
  const [endYear, endMonth] = endCompetencia.split("-").map(Number);
  const start = new Date(startYear, startMonth - 1, 1);
  const end = new Date(endYear, endMonth - 1, 1);
  const competencias: string[] = [];
  const cursor = new Date(start);

  while (cursor.getTime() <= end.getTime()) {
    competencias.push(format(cursor, "yyyy-MM"));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return competencias;
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

export async function generateMensalidadesCompetencia(competencia: string) {
  const periods = await prisma.periodoMatricula.findMany({
    where: enrollmentCoversCompetenceWhere(competencia),
    include: { aluno: true, modalidade: true },
    orderBy: [{ dataInicio: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }]
  });
  const alunos = Array.from(new Map(periods.map((period) => [period.alunoId, period])).values());

  if (alunos.length === 0) {
    return {
      competencia,
      totalGerado: 0
    };
  }

  const alunoIds = alunos.map((period) => period.alunoId);
  const existingCurrent = await prisma.mensalidade.findMany({
    where: {
      alunoId: { in: alunoIds },
      competencia
    },
    select: {
      alunoId: true
    }
  });

  const existingCurrentSet = new Set(existingCurrent.map((item) => item.alunoId));

  const created: string[] = [];
  const createData: Array<{
    alunoId: string;
    competencia: string;
    valor: number;
    vencimento: Date;
    status: MensalidadeStatus;
  }> = [];

  for (const period of alunos) {
    if (existingCurrentSet.has(period.alunoId)) continue;

    const vencimento = buildVencimentoDate(competencia, period.diaVencimento);
    const valor = resolveFutureMonthlyValue({
      individualValue: period.valorMensal === null ? null : Number(period.valorMensal),
      useModalityDefault: period.usarValorPadrao,
      modalityDefaultValue: period.modalidade?.valorPadrao === null || period.modalidade?.valorPadrao === undefined
        ? null
        : Number(period.modalidade.valorPadrao)
    });
    if (valor === null) continue;

    createData.push({
      alunoId: period.alunoId,
      competencia,
      valor,
      vencimento,
      status: MensalidadeStatus.PENDENTE
    });
    created.push(period.alunoId);
  }

  if (createData.length > 0) {
    await prisma.mensalidade.createMany({
      data: createData,
      skipDuplicates: true
    });
  }

  return {
    competencia,
    totalGerado: created.length
  };
}

export async function generateMensalidadesAteCompetencia(
  competenciaLimite = currentCompetencia(),
  alunoIds?: string[]
) {
  const periods = await prisma.periodoMatricula.findMany({
    where: {
      dataInicio: { not: null },
      ...(alunoIds && alunoIds.length > 0 ? { alunoId: { in: alunoIds } } : {})
    },
    include: {
      modalidade: true
    }
  });

  if (periods.length === 0) {
    return {
      competenciaLimite,
      totalGerado: 0
    };
  }

  const existentes = await prisma.mensalidade.findMany({
    where: {
      alunoId: { in: Array.from(new Set(periods.map((period) => period.alunoId))) },
      competencia: { lte: competenciaLimite }
    },
    select: {
      alunoId: true,
      competencia: true,
      valor: true
    }
  });

  const existentesByAluno = new Map<string, Map<string, number>>();
  for (const item of existentes) {
    const byCompetencia = existentesByAluno.get(item.alunoId) ?? new Map<string, number>();
    byCompetencia.set(item.competencia, Number(item.valor));
    existentesByAluno.set(item.alunoId, byCompetencia);
  }

  const novosRegistros: Array<{
    alunoId: string;
    competencia: string;
    valor: number;
    vencimento: Date;
    status: MensalidadeStatus;
  }> = [];

  for (const period of periods) {
    if (!period.dataInicio) continue;
    const competenciaInicio = competenciaFromUtcDate(period.dataInicio);
    if (competenciaInicio > competenciaLimite) {
      continue;
    }

    const existingForAluno = existentesByAluno.get(period.alunoId) ?? new Map<string, number>();
    const valor = resolveFutureMonthlyValue({
      individualValue: period.valorMensal === null ? null : Number(period.valorMensal),
      useModalityDefault: period.usarValorPadrao,
      modalityDefaultValue: period.modalidade?.valorPadrao === null || period.modalidade?.valorPadrao === undefined
        ? null
        : Number(period.modalidade.valorPadrao)
    });
    if (valor === null) continue;
    const competenciaFim = period.dataSaida
      ? [competenciaFromUtcDate(period.dataSaida), competenciaLimite].sort()[0]
      : competenciaLimite;
    const competencias = competenciasBetween(competenciaInicio, competenciaFim);

    for (const competencia of competencias) {
      const valorExistente = existingForAluno.get(competencia);
      if (valorExistente !== undefined) {
        continue;
      }

      novosRegistros.push({
        alunoId: period.alunoId,
        competencia,
        valor,
        vencimento: buildVencimentoDate(competencia, period.diaVencimento),
        status: MensalidadeStatus.PENDENTE
      });
    }
  }

  if (novosRegistros.length > 0) {
    await prisma.mensalidade.createMany({
      data: novosRegistros,
      skipDuplicates: true
    });
  }

  return {
    competenciaLimite,
    totalGerado: novosRegistros.length
  };
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
  const geracao = await generateMensalidadesAteCompetencia(competencia);
  const atualizadasAtrasadas = await atualizarStatusMensalidadesAtrasadas();

  return {
    competencia,
    totalGerado: geracao.totalGerado,
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
