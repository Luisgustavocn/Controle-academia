import { AlunoStatus, MensalidadeStatus, TipoMovimentacao } from "@prisma/client";
import { monthRange } from "@/lib/services/mensalidades";
import { prisma } from "@/lib/prisma";
import { currentCompetencia } from "@/lib/competencia";
import type { SessionRole } from "@/lib/auth/jwt-payload";
import {
  academyMonthRange,
  academyCompetencia,
  getAcademyDateContext,
  recentCompetencias,
  type AcademyDateContext
} from "@/lib/timezone";
import { addCivilDays, civilDateToPrisma, civilMonthRange, prismaDateToCivil } from "@/lib/attendance-date";
import { enrollmentCoversCompetenceWhere, studentActiveOnDateWhere } from "@/lib/services/enrollment-periods";

export const NO_ATTENDANCE_ALERT_DAYS = 10;

export type DashboardKpis = {
  alunos_ativos: number;
  alunos_inadimplentes: number;
  receita_mes: number;
  despesa_mes: number;
  saldo_mes: number;
  novas_matriculas_mes: number;
  cancelamentos_mes: number;
  frequencia_total_mes: number;
  ticket_medio: number;
  taxa_inadimplencia: number;
  taxa_retencao: number;
};

export type FinanceSeriesItem = {
  competencia: string;
  receita: number;
  despesa: number;
  saldo: number;
};

type FinanceSeriesRows = {
  mensalidades: Array<{ dataPagamento: Date | null; valor: unknown }>;
  despesas: Array<{ competencia: string; valorPrevisto: unknown; valorPago: unknown }>;
  pedidos: Array<{ dataPedido: Date; pago: unknown }>;
};

function competenciaRange(competencia: string) {
  const start = new Date(`${competencia}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

export async function getDashboardSummary(referenceCompetencia = currentCompetencia()) {
  const competencias = monthRange(new Date(), 12);
  const fallback = {
    referencia: referenceCompetencia,
    kpis: {
      alunos_ativos: 0,
      alunos_inadimplentes: 0,
      receita_mes: 0,
      despesa_mes: 0,
      saldo_mes: 0,
      novas_matriculas_mes: 0,
      cancelamentos_mes: 0,
      frequencia_total_mes: 0,
      ticket_medio: 0,
      taxa_inadimplencia: 0,
      taxa_retencao: 0
    },
    series: competencias.map((competencia) => ({
      competencia,
      receita: 0,
      despesa: 0,
      saldo: 0
    }))
  };

  if (!process.env.DATABASE_URL) {
    return fallback;
  }

  try {
    const [kpis, series] = await Promise.all([
      getDashboardKpis(referenceCompetencia),
      buildFinanceSeries(competencias)
    ]);

    return {
      referencia: referenceCompetencia,
      kpis,
      series
    };
  } catch {
    return {
      ...fallback
    };
  }
}

export async function getDashboardKpis(referenceCompetencia: string): Promise<DashboardKpis> {
  const { start: mesStart, end: mesEnd } = competenciaRange(referenceCompetencia);
  const attendanceRange = civilMonthRange(referenceCompetencia);

  const [
    alunosAtivos,
    alunosInadimplentes,
    mensalidadesRecebidasNoMes,
    despesasAcademia,
    caixa,
    presencas,
    pedidosPagosMes,
    controle
  ] = await Promise.all([
    prisma.aluno.count({ where: { periodosMatricula: { some: enrollmentCoversCompetenceWhere(referenceCompetencia) } } }),
    prisma.mensalidade.count({
      where: {
        competencia: referenceCompetencia,
        status: { in: [MensalidadeStatus.PENDENTE, MensalidadeStatus.ATRASADO] }
      }
    }),
    prisma.mensalidade.findMany({
      where: {
        status: { in: [MensalidadeStatus.PAGO, MensalidadeStatus.PARCIAL] },
        dataPagamento: {
          gte: mesStart,
          lt: mesEnd
        }
      },
      select: {
        alunoId: true,
        valor: true
      }
    }),
    prisma.despesaAcademia.findMany({ where: { competencia: referenceCompetencia } }),
    prisma.movimentacaoCaixa.findMany({ where: { competencia: referenceCompetencia } }),
    prisma.presenca.count({
      where: {
        presente: true,
        data: {
          gte: attendanceRange.start,
          lt: attendanceRange.end
        }
      }
    }),
    prisma.pedidoProduto.aggregate({
      _sum: { pago: true },
      where: {
        dataPedido: {
          gte: mesStart,
          lt: mesEnd
        }
      }
    }),
    prisma.controleMensalAlunos.findUnique({ where: { competencia: referenceCompetencia } })
  ]);

  const receitaMensalidades = mensalidadesRecebidasNoMes.reduce((acc, item) => acc + Number(item.valor), 0);
  const receitaProdutos = Number(pedidosPagosMes._sum.pago ?? 0);
  const receitaMes = receitaMensalidades + receitaProdutos;
  const despesaMes = despesasAcademia.reduce((acc, item) => acc + Number(item.valorPago || item.valorPrevisto), 0);
  const ajustesManuaisCaixa = caixa
    .filter((item) => !item.id.startsWith("auto_"))
    .reduce((acc, item) => {
      return item.tipo === TipoMovimentacao.ENTRADA ? acc + Number(item.valor) : acc - Number(item.valor);
    }, 0);
  const saldoMes = receitaMes - despesaMes + ajustesManuaisCaixa;
  const alunosPagantes = new Set(mensalidadesRecebidasNoMes.map((item) => item.alunoId)).size || 1;
  const taxaInadimplencia = alunosAtivos === 0 ? 0 : alunosInadimplentes / alunosAtivos;
  const taxaRetencao = controle && controle.inicioMes > 0 ? controle.totalFinal / controle.inicioMes : 1;

  return {
    alunos_ativos: alunosAtivos,
    alunos_inadimplentes: alunosInadimplentes,
    receita_mes: receitaMes,
    despesa_mes: despesaMes,
    saldo_mes: saldoMes,
    novas_matriculas_mes: controle?.entrou ?? 0,
    cancelamentos_mes: controle?.saiu ?? 0,
    frequencia_total_mes: presencas,
    ticket_medio: receitaMes / alunosPagantes,
    taxa_inadimplencia: taxaInadimplencia,
    taxa_retencao: taxaRetencao
  };
}

function dateCompetencia(date: Date) {
  return academyCompetencia(date);
}

export function buildFinanceSeriesFromRows(
  competencias: string[],
  rows: FinanceSeriesRows
): FinanceSeriesItem[] {
  const byCompetencia = new Map(
    competencias.map((competencia) => [competencia, { receita: 0, despesa: 0 }])
  );

  for (const mensalidade of rows.mensalidades) {
    if (!mensalidade.dataPagamento) continue;
    const totals = byCompetencia.get(dateCompetencia(mensalidade.dataPagamento));
    if (totals) totals.receita += Number(mensalidade.valor);
  }

  for (const pedido of rows.pedidos) {
    const totals = byCompetencia.get(dateCompetencia(pedido.dataPedido));
    if (totals) totals.receita += Number(pedido.pago);
  }

  for (const despesa of rows.despesas) {
    const totals = byCompetencia.get(despesa.competencia);
    if (totals) totals.despesa += Number(despesa.valorPago || despesa.valorPrevisto);
  }

  return competencias.map((competencia) => {
    const totals = byCompetencia.get(competencia) ?? { receita: 0, despesa: 0 };
    return {
      competencia,
      receita: totals.receita,
      despesa: totals.despesa,
      saldo: totals.receita - totals.despesa
    };
  });
}

async function buildFinanceSeries(competencias: string[]) {
  const first = competencias[0];
  const last = competencias[competencias.length - 1];
  if (!first || !last) return [];

  const start = competenciaRange(first).start;
  const end = competenciaRange(last).end;
  const [mensalidades, despesas, pedidos] = await Promise.all([
    prisma.mensalidade.findMany({
      where: {
        status: { in: [MensalidadeStatus.PAGO, MensalidadeStatus.PARCIAL] },
        dataPagamento: { gte: start, lt: end }
      },
      select: { dataPagamento: true, valor: true }
    }),
    prisma.despesaAcademia.findMany({
      where: { competencia: { in: competencias } },
      select: { competencia: true, valorPrevisto: true, valorPago: true }
    }),
    prisma.pedidoProduto.findMany({
      where: { dataPedido: { gte: start, lt: end } },
      select: { dataPedido: true, pago: true }
    })
  ]);

  return buildFinanceSeriesFromRows(competencias, { mensalidades, despesas, pedidos });
}

type OperationalMensalidade = {
  id: string;
  alunoId: string;
  competencia: string;
  valor: unknown;
  vencimento: Date;
  dataPagamento: Date | null;
  status: MensalidadeStatus;
  aluno: { nomeCompleto: string };
};

type OperationalOrder = {
  id: string;
  clienteNome: string;
  dataPedido: Date;
  pago: unknown;
  aluno: { nomeCompleto: string } | null;
};

export type OperationalDashboardSource = {
  activeStudents: number;
  openMensalidades: OperationalMensalidade[];
  paidMensalidades: Array<Pick<OperationalMensalidade, "id" | "alunoId" | "competencia" | "valor" | "dataPagamento" | "status" | "aluno">>;
  orders: OperationalOrder[];
  expenses: Array<{ competencia: string; valorPrevisto: unknown; valorPago: unknown }>;
  attendancesToday: number;
  appointmentsToday: number;
  lastAttendances: Array<{ alunoId: string; _max: { data: Date | null } }>;
  newStudents: Array<{ id: string; nomeCompleto: string; createdAt: Date; status: AlunoStatus }>;
};

export type DashboardRecentItem = {
  id: string;
  kind: "payment" | "student";
  occurredAt: string;
  title: string;
  detail: string;
  amount?: number;
  status?: string;
};

export type OperationalDashboard = {
  asOf: { dateKey: string; label: string; competencia: string };
  overview: {
    activeStudents: number;
    receivedMonth: number;
    receivableCurrent: number;
    delinquentStudents: number;
  };
  today: {
    attendances: number;
    appointments: number;
    due: { count: number; amount: number };
    received: number;
  };
  attention: {
    overdue: { students: number; amount: number };
    noRecentAttendance: { students: number; thresholdDays: number };
  };
  recent: {
    payments: DashboardRecentItem[];
    students: DashboardRecentItem[];
  };
  financialSeries: FinanceSeriesItem[];
};

export type OperationalDashboardDto = {
  asOf: OperationalDashboard["asOf"];
  overview: Partial<OperationalDashboard["overview"]>;
  today?: Partial<OperationalDashboard["today"]>;
  attention?: Partial<OperationalDashboard["attention"]>;
  recent?: Partial<OperationalDashboard["recent"]>;
  financialSeries?: FinanceSeriesItem[];
};

function isWithin(date: Date | null, start: Date, end: Date) {
  return Boolean(date && date >= start && date < end);
}

export function buildOperationalDashboardFromRows(
  context: AcademyDateContext,
  competencias: string[],
  source: OperationalDashboardSource
): OperationalDashboard {
  const currentOpen = source.openMensalidades.filter(
    (item) => item.competencia === context.competencia &&
      (item.status === MensalidadeStatus.PENDENTE || item.status === MensalidadeStatus.ATRASADO)
  );
  const overdue = source.openMensalidades.filter((item) => item.status === MensalidadeStatus.ATRASADO);
  const delinquentIds = new Set(overdue.map((item) => item.alunoId));
  const dueToday = currentOpen.filter((item) => isWithin(item.vencimento, context.dayStart, context.dayEnd));
  const paidThisMonth = source.paidMensalidades.filter((item) =>
    isWithin(item.dataPagamento, context.monthStart, context.monthEnd)
  );
  const paidToday = paidThisMonth.filter((item) => isWithin(item.dataPagamento, context.dayStart, context.dayEnd));
  const ordersThisMonth = source.orders.filter((item) => isWithin(item.dataPedido, context.monthStart, context.monthEnd));
  const ordersToday = ordersThisMonth.filter((item) => isWithin(item.dataPedido, context.dayStart, context.dayEnd));
  const amount = (items: Array<{ valor: unknown }>) => items.reduce((total, item) => total + Number(item.valor), 0);
  const orderAmount = (items: Array<{ pago: unknown }>) => items.reduce((total, item) => total + Number(item.pago), 0);
  const staleCutoff = addCivilDays(context.dateKey, -NO_ATTENDANCE_ALERT_DAYS);

  const paymentItems: DashboardRecentItem[] = [
    ...source.paidMensalidades
      .filter((item) => item.dataPagamento)
      .map((item) => ({
        id: `mensalidade-${item.id}`,
        kind: "payment" as const,
        occurredAt: item.dataPagamento!.toISOString(),
        title: item.aluno.nomeCompleto,
        detail: `Mensalidade ${item.competencia}`,
        amount: Number(item.valor),
        status: item.status
      })),
    ...source.orders
      .filter((item) => Number(item.pago) > 0)
      .map((item) => ({
        id: `pedido-${item.id}`,
        kind: "payment" as const,
        occurredAt: item.dataPedido.toISOString(),
        title: item.aluno?.nomeCompleto ?? item.clienteNome,
        detail: "Venda de produto",
        amount: Number(item.pago),
        status: "PAGO"
      }))
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 8);

  return {
    asOf: { dateKey: context.dateKey, label: context.label, competencia: context.competencia },
    overview: {
      activeStudents: source.activeStudents,
      receivedMonth: amount(paidThisMonth) + orderAmount(ordersThisMonth),
      receivableCurrent: amount(currentOpen),
      delinquentStudents: delinquentIds.size
    },
    today: {
      attendances: source.attendancesToday,
      appointments: source.appointmentsToday,
      due: { count: dueToday.length, amount: amount(dueToday) },
      received: amount(paidToday) + orderAmount(ordersToday)
    },
    attention: {
      overdue: { students: delinquentIds.size, amount: amount(overdue) },
      noRecentAttendance: {
        students: source.lastAttendances.filter(
          (item) => item._max.data && prismaDateToCivil(item._max.data) <= staleCutoff
        ).length,
        thresholdDays: NO_ATTENDANCE_ALERT_DAYS
      }
    },
    recent: {
      payments: paymentItems,
      students: source.newStudents.map((item) => ({
        id: `aluno-${item.id}`,
        kind: "student" as const,
        occurredAt: item.createdAt.toISOString(),
        title: item.nomeCompleto,
        detail: "Novo cadastro",
        status: item.status
      }))
    },
    financialSeries: buildFinanceSeriesFromRows(competencias, {
      mensalidades: source.paidMensalidades,
      despesas: source.expenses,
      pedidos: source.orders
    })
  };
}

export function dashboardDtoForRole(data: OperationalDashboard, role: SessionRole): OperationalDashboardDto {
  if (role === "ADMIN") return data;

  if (role === "FINANCEIRO") {
    return {
      asOf: data.asOf,
      overview: data.overview,
      today: { due: data.today.due, received: data.today.received },
      attention: { overdue: data.attention.overdue },
      recent: { payments: data.recent.payments },
      financialSeries: data.financialSeries
    };
  }

  if (role === "RECEPCAO") {
    return {
      asOf: data.asOf,
      overview: data.overview,
      today: data.today,
      attention: data.attention,
      recent: data.recent
    };
  }

  return { asOf: data.asOf, overview: { activeStudents: data.overview.activeStudents } };
}

export async function getOperationalDashboard(role: SessionRole, referenceDate = new Date()) {
  const context = getAcademyDateContext(referenceDate);
  const attendanceToday = civilDateToPrisma(context.dateKey);
  const competencias = recentCompetencias(referenceDate, 12);
  const firstRange = academyMonthRange(competencias[0] ?? context.competencia);
  const lastRange = academyMonthRange(competencias[competencias.length - 1] ?? context.competencia);
  const needsOperationalData = role === "ADMIN" || role === "RECEPCAO";
  const needsFinancialSeries = role === "ADMIN" || role === "FINANCEIRO";
  const activeStudentWhere = studentActiveOnDateWhere(context.dateKey);

  const [
    activeStudents,
    openMensalidades,
    attendancesToday,
    appointmentsToday,
    lastAttendances,
    newStudents,
    paidMensalidades,
    expenses,
    orders
  ] = await Promise.all([
    prisma.aluno.count({ where: activeStudentWhere }),
    prisma.mensalidade.findMany({
      where: {
        OR: [
          { competencia: context.competencia, status: { in: [MensalidadeStatus.PENDENTE, MensalidadeStatus.ATRASADO] } },
          { status: MensalidadeStatus.ATRASADO }
        ]
      },
      select: {
        id: true,
        alunoId: true,
        competencia: true,
        valor: true,
        vencimento: true,
        dataPagamento: true,
        status: true,
        aluno: { select: { nomeCompleto: true } }
      }
    }),
    needsOperationalData ? prisma.presenca.count({
      where: { presente: true, data: attendanceToday }
    }) : Promise.resolve(0),
    needsOperationalData ? prisma.agendaPersonal.count({
      where: {
        ativo: true,
        diaSemana: context.weekday,
        semanaRef: { in: ["", context.weekRef] },
        OR: [{ alunoId: null }, { aluno: activeStudentWhere }]
      }
    }) : Promise.resolve(0),
    needsOperationalData ? prisma.presenca.groupBy({
      by: ["alunoId"],
      where: { presente: true, aluno: activeStudentWhere },
      _max: { data: true }
    }) : Promise.resolve([]),
    needsOperationalData ? prisma.aluno.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, nomeCompleto: true, createdAt: true, status: true }
    }) : Promise.resolve([]),
    prisma.mensalidade.findMany({
      where: {
        status: { in: [MensalidadeStatus.PAGO, MensalidadeStatus.PARCIAL] },
        dataPagamento: { gte: firstRange.start, lt: lastRange.end }
      },
      select: {
        id: true,
        alunoId: true,
        competencia: true,
        valor: true,
        dataPagamento: true,
        status: true,
        aluno: { select: { nomeCompleto: true } }
      }
    }),
    needsFinancialSeries ? prisma.despesaAcademia.findMany({
      where: { competencia: { in: competencias } },
      select: { competencia: true, valorPrevisto: true, valorPago: true }
    }) : Promise.resolve([]),
    prisma.pedidoProduto.findMany({
      where: { dataPedido: { gte: firstRange.start, lt: lastRange.end }, pago: { gt: 0 } },
      select: {
        id: true,
        clienteNome: true,
        dataPedido: true,
        pago: true,
        aluno: { select: { nomeCompleto: true } }
      }
    })
  ]);

  const full = buildOperationalDashboardFromRows(context, competencias, {
    activeStudents,
    openMensalidades,
    paidMensalidades,
    orders,
    expenses,
    attendancesToday,
    appointmentsToday,
    lastAttendances,
    newStudents
  });
  return dashboardDtoForRole(full, role);
}
