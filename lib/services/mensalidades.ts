import { AlunoStatus, MensalidadeStatus } from "@prisma/client";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { prisma } from "@/lib/prisma";

export async function generateMensalidadesCompetencia(competencia: string) {
  const [year, month] = competencia.split("-").map(Number);

  const alunos = await prisma.aluno.findMany({
    where: { status: AlunoStatus.ATIVO },
    include: { modalidade: true }
  });

  const created: string[] = [];

  for (const aluno of alunos) {
    const exists = await prisma.mensalidade.findUnique({
      where: {
        alunoId_competencia: {
          alunoId: aluno.id,
          competencia
        }
      }
    });

    if (exists) continue;

    const vencimento = new Date(year, month - 1, Math.min(28, aluno.vencimentoDia));
    const valor = aluno.modalidade?.valorPadrao ?? 0;

    await prisma.mensalidade.create({
      data: {
        alunoId: aluno.id,
        competencia,
        valor,
        vencimento,
        status: MensalidadeStatus.PENDENTE
      }
    });

    created.push(aluno.id);
  }

  return {
    competencia,
    totalGerado: created.length
  };
}

export async function atualizarStatusMensalidadesAtrasadas() {
  const now = new Date();
  const result = await prisma.mensalidade.updateMany({
    where: {
      status: MensalidadeStatus.PENDENTE,
      vencimento: {
        lt: now
      }
    },
    data: {
      status: MensalidadeStatus.ATRASADO
    }
  });

  return result.count;
}

export async function totalsMensalidadesPorMes(competencia: string) {
  const mensalidades = await prisma.mensalidade.findMany({
    where: { competencia }
  });

  const totalPrevisto = mensalidades.reduce((acc, item) => acc + Number(item.valor), 0);
  const totalRecebido = mensalidades
    .filter((item) => item.status === MensalidadeStatus.PAGO || item.status === MensalidadeStatus.PARCIAL)
    .reduce((acc, item) => acc + Number(item.valor), 0);

  const inadimplentes = mensalidades.filter(
    (item) => item.status === MensalidadeStatus.PENDENTE || item.status === MensalidadeStatus.ATRASADO
  ).length;

  return {
    competencia,
    totalPrevisto,
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
