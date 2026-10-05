import { MensalidadeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDashboardKpis } from "@/lib/services/dashboard";

export type MensalidadesResumo = {
  pagas: number;
  pendentes: number;
  atrasadas: number;
  totalPagoMes: number;
  totalPendenteMes: number;
  totalAtrasado: number;
};

export function previousCompetencia(competencia: string) {
  const [year, month] = competencia.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  date.setUTCMonth(date.getUTCMonth() - 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function competenciaRange(competencia: string) {
  const start = new Date(`${competencia}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

export async function getReportComparison(competencia: string) {
  const anterior = previousCompetencia(competencia);
  const currentRange = competenciaRange(competencia);
  const previousRange = competenciaRange(anterior);

  const [kpisAtual, kpisAnterior, mensalidades] = await Promise.all([
    getDashboardKpis(competencia),
    getDashboardKpis(anterior),
    prisma.mensalidade.findMany({
      where: {
        OR: [
          { competencia: { in: [competencia, anterior] } },
          { status: MensalidadeStatus.ATRASADO },
          {
            status: { in: [MensalidadeStatus.PAGO, MensalidadeStatus.PARCIAL] },
            dataPagamento: { gte: previousRange.start, lt: currentRange.end }
          }
        ]
      },
      select: {
        competencia: true,
        status: true,
        valor: true,
        dataPagamento: true
      }
    })
  ]);

  const atrasadas = mensalidades.filter((item) => item.status === MensalidadeStatus.ATRASADO);
  const totalAtrasado = atrasadas.reduce((total, item) => total + Number(item.valor), 0);

  function buildResumo(reference: string, range: { start: Date; end: Date }): MensalidadesResumo {
    const referenceRows = mensalidades.filter((item) => item.competencia === reference);
    const pagas = referenceRows.filter((item) => item.status === MensalidadeStatus.PAGO);
    const pendentes = referenceRows.filter((item) => item.status === MensalidadeStatus.PENDENTE);
    const recebidasNoMes = mensalidades.filter(
      (item) =>
        (item.status === MensalidadeStatus.PAGO || item.status === MensalidadeStatus.PARCIAL) &&
        item.dataPagamento &&
        item.dataPagamento >= range.start &&
        item.dataPagamento < range.end
    );

    return {
      pagas: pagas.length,
      pendentes: pendentes.length,
      atrasadas: atrasadas.length,
      totalPagoMes: recebidasNoMes.reduce((total, item) => total + Number(item.valor), 0),
      totalPendenteMes: pendentes.reduce((total, item) => total + Number(item.valor), 0),
      totalAtrasado
    };
  }

  return {
    atual: {
      competencia,
      kpis: kpisAtual,
      resumo: buildResumo(competencia, currentRange)
    },
    anterior: {
      competencia: anterior,
      kpis: kpisAnterior,
      resumo: buildResumo(anterior, previousRange)
    }
  };
}
