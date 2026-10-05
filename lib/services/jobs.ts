import { DespesaStatus, MensalidadeStatus, TipoMovimentacao } from "@prisma/client";
import { addDays } from "date-fns";
import { currentCompetencia } from "@/lib/competencia";
import { prisma } from "@/lib/prisma";
import { createBackupFile } from "@/lib/services/backup";
import { syncAutomaticEntriesInCaixa } from "@/lib/services/caixa";
import { buildMonthlyStudentControl, generateMensalidadesCompetencia } from "@/lib/services/mensalidades";
export { dispatchWhatsAppBillingReminders, getWhatsAppReminderPreview } from "@/lib/services/whatsapp";

export async function runMonthlyGeneration(competencia = currentCompetencia()) {
  const mensalidades = await generateMensalidadesCompetencia(competencia);
  const controle = await buildMonthlyStudentControl(competencia);

  return {
    mensalidades,
    controle
  };
}

export async function runCashClosing(competencia = currentCompetencia()) {
  await syncAutomaticEntriesInCaixa(true);

  const movimentos = await prisma.movimentacaoCaixa.findMany({
    where: { competencia }
  });

  const entradas = movimentos
    .filter((item) => item.tipo === TipoMovimentacao.ENTRADA)
    .reduce((acc, item) => acc + Number(item.valor), 0);

  const saidas = movimentos
    .filter((item) => item.tipo === TipoMovimentacao.SAIDA)
    .reduce((acc, item) => acc + Number(item.valor), 0);

  const saldo = entradas - saidas;

  await prisma.configuracao.upsert({
    where: { chave: `fechamento:${competencia}` },
    create: {
      chave: `fechamento:${competencia}`,
      valor: JSON.stringify({ entradas, saidas, saldo, fechadoEm: new Date().toISOString() }),
      descricao: "Resumo automático de fechamento mensal do caixa"
    },
    update: {
      valor: JSON.stringify({ entradas, saidas, saldo, fechadoEm: new Date().toISOString() })
    }
  });

  try {
    const backup = await createBackupFile();

    return {
      competencia,
      entradas,
      saidas,
      saldo,
      backupSaved: true,
      backupFilePath: backup.filePath,
      backupGeneratedAt: backup.generatedAt
    };
  } catch (error) {
    return {
      competencia,
      entradas,
      saidas,
      saldo,
      backupSaved: false,
      backupError: error instanceof Error ? error.message : "Falha ao salvar backup automatico"
    };
  }
}

export async function getAlerts(referenceDate = new Date()) {
  const limiteVencimento = addDays(referenceDate, 3);

  const [mensalidadesProximas, mensalidadesAtrasadas, despesasPendentes] = await Promise.all([
    prisma.mensalidade.findMany({
      where: {
        status: MensalidadeStatus.PENDENTE,
        vencimento: {
          gte: referenceDate,
          lte: limiteVencimento
        }
      },
      include: { aluno: { select: { nomeCompleto: true } } },
      orderBy: { vencimento: "asc" }
    }),
    prisma.mensalidade.findMany({
      where: {
        status: {
          in: [MensalidadeStatus.PENDENTE, MensalidadeStatus.ATRASADO]
        },
        vencimento: {
          lt: referenceDate
        }
      },
      include: { aluno: { select: { nomeCompleto: true } } },
      orderBy: { vencimento: "asc" }
    }),
    prisma.despesaAcademia.findMany({
      where: {
        status: {
          in: [DespesaStatus.PENDENTE, DespesaStatus.PARCIAL]
        }
      },
      include: { categoria: true },
      orderBy: { dataVencimento: "asc" }
    })
  ]);

  return {
    mensalidadesProximas,
    mensalidadesAtrasadas,
    despesasPendentes
  };
}
