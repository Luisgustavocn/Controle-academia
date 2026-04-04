import { AlunoStatus, MensalidadeStatus } from "@prisma/client";
import { endOfMonth, format, startOfDay, startOfMonth } from "date-fns";
import { currentCompetencia } from "@/lib/competencia";
import { prisma } from "@/lib/prisma";
import { isModalidadePersonalizada } from "@/lib/services/modalidades";

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

function isSameLocalDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function competenciaFromUtcDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export async function generateMensalidadesCompetencia(competencia: string) {
  const alunos = await prisma.aluno.findMany({
    where: {
      status: AlunoStatus.ATIVO,
      dataSaidaCancelamento: null
    },
    include: { modalidade: true }
  });

  if (alunos.length === 0) {
    return {
      competencia,
      totalGerado: 0
    };
  }

  const alunoIds = alunos.map((aluno) => aluno.id);
  const [existingCurrent, existingHistory] = await Promise.all([
    prisma.mensalidade.findMany({
      where: {
        alunoId: { in: alunoIds },
        competencia
      },
      select: {
        alunoId: true
      }
    }),
    prisma.mensalidade.findMany({
      where: {
        alunoId: { in: alunoIds },
        competencia: { lt: competencia }
      },
      select: {
        alunoId: true,
        competencia: true,
        valor: true
      },
      orderBy: [{ alunoId: "asc" }, { competencia: "desc" }]
    })
  ]);

  const existingCurrentSet = new Set(existingCurrent.map((item) => item.alunoId));
  const latestValueByAluno = new Map<string, number>();
  for (const item of existingHistory) {
    if (!latestValueByAluno.has(item.alunoId)) {
      latestValueByAluno.set(item.alunoId, Number(item.valor));
    }
  }

  const created: string[] = [];
  const createData: Array<{
    alunoId: string;
    competencia: string;
    valor: number;
    vencimento: Date;
    status: MensalidadeStatus;
  }> = [];

  for (const aluno of alunos) {
    if (existingCurrentSet.has(aluno.id)) continue;

    const vencimento = buildVencimentoDate(competencia, aluno.vencimentoDia);
    const valorPadrao = Number(aluno.modalidade?.valorPadrao ?? 0);
    const usarUltimoValor = isModalidadePersonalizada(aluno.modalidade?.nome);
    const valor = usarUltimoValor ? latestValueByAluno.get(aluno.id) ?? valorPadrao : valorPadrao;

    createData.push({
      alunoId: aluno.id,
      competencia,
      valor,
      vencimento,
      status: MensalidadeStatus.PENDENTE
    });
    created.push(aluno.id);
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
  const alunos = await prisma.aluno.findMany({
    where: {
      status: AlunoStatus.ATIVO,
      dataSaidaCancelamento: null,
      ...(alunoIds && alunoIds.length > 0 ? { id: { in: alunoIds } } : {})
    },
    include: {
      modalidade: true
    }
  });

  if (alunos.length === 0) {
    return {
      competenciaLimite,
      totalGerado: 0
    };
  }

  const existentes = await prisma.mensalidade.findMany({
    where: {
      alunoId: { in: alunos.map((aluno) => aluno.id) },
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

  for (const aluno of alunos) {
    const competenciaInicio = competenciaFromUtcDate(aluno.dataInicio);
    if (competenciaInicio > competenciaLimite) {
      continue;
    }

    const existingForAluno = existentesByAluno.get(aluno.id) ?? new Map<string, number>();
    const valorPadrao = Number(aluno.modalidade?.valorPadrao ?? 0);
    const usarUltimoValor = isModalidadePersonalizada(aluno.modalidade?.nome);
    let valorAtual = valorPadrao;
    const competencias = competenciasBetween(competenciaInicio, competenciaLimite);

    for (const competencia of competencias) {
      const valorExistente = existingForAluno.get(competencia);
      if (valorExistente !== undefined) {
        if (usarUltimoValor) {
          valorAtual = valorExistente;
        }
        continue;
      }

      novosRegistros.push({
        alunoId: aluno.id,
        competencia,
        valor: usarUltimoValor ? valorAtual : valorPadrao,
        vencimento: buildVencimentoDate(competencia, aluno.vencimentoDia),
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

export async function sincronizarVencimentoMensalidadesPorAluno(alunoId?: string) {
  const mensalidades = await prisma.mensalidade.findMany({
    where: alunoId ? { alunoId } : undefined,
    include: {
      aluno: {
        select: {
          vencimentoDia: true
        }
      }
    }
  });

  let atualizadas = 0;
  for (const mensalidade of mensalidades) {
    const vencimentoCorreto = buildVencimentoDate(mensalidade.competencia, mensalidade.aluno.vencimentoDia);
    if (isSameLocalDate(vencimentoCorreto, mensalidade.vencimento)) {
      continue;
    }

    await prisma.mensalidade.update({
      where: { id: mensalidade.id },
      data: { vencimento: vencimentoCorreto }
    });
    atualizadas += 1;
  }

  return atualizadas;
}

export async function sincronizarMensalidadesComDataInicio(alunoId: string, dataInicio: Date) {
  const competenciaInicio = competenciaFromUtcDate(dataInicio);

  const ajustadas = await prisma.mensalidade.updateMany({
    where: {
      alunoId,
      competencia: {
        lt: competenciaInicio
      },
      status: {
        in: [MensalidadeStatus.PENDENTE, MensalidadeStatus.ATRASADO]
      }
    },
    data: {
      status: MensalidadeStatus.ISENTO,
      observacao: `Competência anterior à data de início (${competenciaInicio}) preservada por segurança em vez de removida automaticamente.`
    }
  });

  return {
    competenciaInicio,
    ajustadas: ajustadas.count
  };
}

export async function garantirMensalidadesDoMesAtual(competencia = currentCompetencia()) {
  const geracao = await generateMensalidadesAteCompetencia(competencia);
  const sincronizadas = await sincronizarVencimentoMensalidadesPorAluno();
  const atualizadasAtrasadas = await atualizarStatusMensalidadesAtrasadas();

  return {
    competencia,
    totalGerado: geracao.totalGerado,
    totalVencimentosSincronizados: sincronizadas,
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

export async function cancelarMensalidadesFuturasDoAluno(alunoId: string, dataSaidaCancelamento: Date) {
  const competenciaSaida = competenciaFromUtcDate(dataSaidaCancelamento);

  const result = await prisma.mensalidade.updateMany({
    where: {
      alunoId,
      competencia: {
        gt: competenciaSaida
      },
      status: {
        in: [MensalidadeStatus.PENDENTE, MensalidadeStatus.ATRASADO]
      }
    },
    data: {
      status: MensalidadeStatus.ISENTO,
      dataPagamento: null,
      formaPagamento: null,
      observacao: "Mensalidade isenta por cancelamento do aluno"
    }
  });

  return result.count;
}

export async function buildMonthlyStudentControl(competencia: string) {
  const date = new Date(`${competencia}-01T00:00:00.000Z`);
  const ini = startOfMonth(date);
  const fim = endOfMonth(date);

  const inicioMes = await prisma.aluno.count({
    where: {
      status: AlunoStatus.ATIVO,
      dataInicio: { lt: ini },
      OR: [{ dataSaidaCancelamento: null }, { dataSaidaCancelamento: { gte: ini } }]
    }
  });

  const entrou = await prisma.aluno.count({
    where: {
      status: AlunoStatus.ATIVO,
      dataInicio: {
        gte: ini,
        lte: fim
      }
    }
  });

  const saiu = await prisma.aluno.count({
    where: {
      dataSaidaCancelamento: {
        gte: ini,
        lte: fim
      }
    }
  });

  const totalFinal = inicioMes + entrou - saiu;

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
