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
import { addCivilDays, civilDateToPrisma, civilMonthRange } from "@/lib/attendance-date";
import { studentActiveOnDateWhere } from "@/lib/services/enrollment-periods";
import { monthlyAmounts } from "@/lib/services/monthly-payments";
import {
  buildAbsenceAlerts,
  buildOverdueFeeAlerts,
  NO_ATTENDANCE_ALERT_DAYS,
  OVERDUE_FEE_ALERT_DAYS,
  type AbsenceAlert,
  type AlertMonthlyRow,
  type AttendanceAlertStudent,
  type OverdueFeeAlert
} from "@/lib/services/dashboard-alerts";
export { NO_ATTENDANCE_ALERT_DAYS } from "@/lib/services/dashboard-alerts";

export const ACTIVE_STUDENT_DASHBOARD_WHERE = { status: AlunoStatus.ATIVO, arquivadoEm: null } as const;

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
  pagamentos?: Array<{ dataPagamento: Date; valor: unknown }>;
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
    pagamentosRecebidosNoMes,
    mensalidadesLegadasRecebidasNoMes,
    despesasAcademia,
    caixa,
    presencas,
    pedidosPagosMes,
    controle
  ] = await Promise.all([
    prisma.aluno.count({ where: ACTIVE_STUDENT_DASHBOARD_WHERE }),
    prisma.mensalidade.count({
      where: {
        competencia: referenceCompetencia,
        status: { in: [MensalidadeStatus.PENDENTE, MensalidadeStatus.ATRASADO] }
      }
    }),
    prisma.pagamento.findMany({
      where: {
        status: "CONFIRMADO",
        dataPagamento: { gte: mesStart, lt: mesEnd }
      },
      select: { alunoId: true, valor: true }
    }),
    prisma.mensalidade.findMany({
      where: {
        status: { in: [MensalidadeStatus.PAGO, MensalidadeStatus.PARCIAL] },
        dataPagamento: { gte: mesStart, lt: mesEnd },
        pagamentos: { none: { status: "CONFIRMADO" } }
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

  const recebimentosMensalidades = [...pagamentosRecebidosNoMes, ...mensalidadesLegadasRecebidasNoMes];
  const receitaMensalidades = recebimentosMensalidades.reduce((acc, item) => acc + Number(item.valor), 0);
  const receitaProdutos = Number(pedidosPagosMes._sum.pago ?? 0);
  const receitaMes = receitaMensalidades + receitaProdutos;
  const despesaMes = despesasAcademia.reduce((acc, item) => acc + Number(item.valorPago || item.valorPrevisto), 0);
  const ajustesManuaisCaixa = caixa
    .filter((item) => !item.id.startsWith("auto_"))
    .reduce((acc, item) => {
      return item.tipo === TipoMovimentacao.ENTRADA ? acc + Number(item.valor) : acc - Number(item.valor);
    }, 0);
  const saldoMes = receitaMes - despesaMes + ajustesManuaisCaixa;
  const alunosPagantes = new Set(recebimentosMensalidades.map((item) => item.alunoId)).size || 1;
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

  for (const pagamento of rows.pagamentos ?? []) {
    const totals = byCompetencia.get(dateCompetencia(pagamento.dataPagamento));
    if (totals) totals.receita += Number(pagamento.valor);
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
  const [mensalidades, pagamentos, despesas, pedidos] = await Promise.all([
    prisma.mensalidade.findMany({
      where: {
        status: { in: [MensalidadeStatus.PAGO, MensalidadeStatus.PARCIAL] },
        dataPagamento: { gte: start, lt: end },
        pagamentos: { none: { status: "CONFIRMADO" } }
      },
      select: { dataPagamento: true, valor: true }
    }),
    prisma.pagamento.findMany({
      where: { status: "CONFIRMADO", dataPagamento: { gte: start, lt: end } },
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

  return buildFinanceSeriesFromRows(competencias, { mensalidades, pagamentos, despesas, pedidos });
}

type OperationalMensalidade = AlertMonthlyRow & {
  id: string;
  alunoId: string;
  competencia: string;
  dataPagamento: Date | null;
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
  attendancesYesterday?: number;
  appointmentsToday: number;
  attendanceStudents?: AttendanceAlertStudent[];
  /** Compatibilidade para consumidores anteriores; novas consultas usam attendanceStudents. */
  lastAttendances?: Array<{ alunoId: string; _max: { data: Date | null } }>;
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
    attendancesYesterday: number;
    appointments: number;
    due: { count: number; amount: number };
    received: number;
  };
  attention: {
    overdue: { students: number; amount: number; thresholdDays: number; items: OverdueFeeAlert[] };
    noRecentAttendance: { students: number; thresholdDays: number; items: AbsenceAlert[] };
    inconsistencies: { activeWithoutOpenPeriod: number; activeWithMultipleOpenPeriods: number };
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
      (item.status === MensalidadeStatus.PENDENTE || item.status === MensalidadeStatus.ATRASADO || item.status === MensalidadeStatus.PARCIAL)
  );
  const overdue = buildOverdueFeeAlerts(source.openMensalidades, context.dateKey);
  const attendanceStudents = source.attendanceStudents ?? (source.lastAttendances ?? []).map((item) => ({
    id: item.alunoId,
    nomeCompleto: item.alunoId,
    fotoPath: null,
    status: AlunoStatus.ATIVO,
    presencas: item._max.data ? [{ data: item._max.data }] : [],
    periodosMatricula: []
  }));
  const absence = buildAbsenceAlerts(attendanceStudents, context.dateKey);
  const delinquentIds = new Set(overdue.map((item) => item.alunoId));
  const dueToday = currentOpen.filter((item) => isWithin(item.vencimento, context.dayStart, context.dayEnd));
  const paidThisMonth = source.paidMensalidades.filter((item) =>
    isWithin(item.dataPagamento, context.monthStart, context.monthEnd)
  );
  const paidToday = paidThisMonth.filter((item) => isWithin(item.dataPagamento, context.dayStart, context.dayEnd));
  const ordersThisMonth = source.orders.filter((item) => isWithin(item.dataPedido, context.monthStart, context.monthEnd));
  const ordersToday = ordersThisMonth.filter((item) => isWithin(item.dataPedido, context.dayStart, context.dayEnd));
  const amount = (items: Array<{ valor: unknown }>) => items.reduce((total, item) => total + Number(item.valor), 0);
  const openAmount = (items: OperationalMensalidade[]) => items.reduce((total, item) => total + Number(monthlyAmounts(item).balance), 0);
  const orderAmount = (items: Array<{ pago: unknown }>) => items.reduce((total, item) => total + Number(item.pago), 0);

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
      receivableCurrent: openAmount(currentOpen),
      delinquentStudents: delinquentIds.size
    },
    today: {
      attendances: source.attendancesToday,
      attendancesYesterday: source.attendancesYesterday ?? 0,
      appointments: source.appointmentsToday,
      due: { count: dueToday.length, amount: openAmount(dueToday) },
      received: amount(paidToday) + orderAmount(ordersToday)
    },
    attention: {
      overdue: {
        students: delinquentIds.size,
        amount: overdue.reduce((total, item) => total + item.saldo, 0),
        thresholdDays: OVERDUE_FEE_ALERT_DAYS,
        items: overdue
      },
      noRecentAttendance: {
        students: absence.alerts.length,
        thresholdDays: NO_ATTENDANCE_ALERT_DAYS,
        items: absence.alerts
      },
      inconsistencies: {
        activeWithoutOpenPeriod: absence.activeWithoutOpenPeriod.length,
        activeWithMultipleOpenPeriods: absence.activeWithMultipleOpenPeriods.length
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
  const attendanceYesterday = civilDateToPrisma(addCivilDays(context.dateKey, -1));
  const overdueCutoff = civilDateToPrisma(addCivilDays(context.dateKey, -OVERDUE_FEE_ALERT_DAYS));
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
    attendancesYesterday,
    appointmentsToday,
    attendanceStudents,
    newStudents,
    paidMensalidades,
    expenses,
    orders
  ] = await Promise.all([
    prisma.aluno.count({ where: ACTIVE_STUDENT_DASHBOARD_WHERE }),
    prisma.mensalidade.findMany({
      where: {
        OR: [
          { competencia: context.competencia, status: { in: [MensalidadeStatus.PENDENTE, MensalidadeStatus.ATRASADO, MensalidadeStatus.PARCIAL] } },
          {
            status: { in: [MensalidadeStatus.PENDENTE, MensalidadeStatus.ATRASADO, MensalidadeStatus.PARCIAL] },
            vencimento: { lte: overdueCutoff }
          }
        ]
      },
      select: {
        id: true,
        alunoId: true,
        competencia: true,
        valor: true,
        valorFinal: true,
        vencimento: true,
        dataPagamento: true,
        status: true,
        pagamentos: { select: { valor: true, status: true } },
        aluno: { select: { nomeCompleto: true } }
      }
    }),
    needsOperationalData ? prisma.presenca.groupBy({
      by: ["alunoId"],
      where: { presente: true, data: attendanceToday }
    }).then((rows) => rows.length) : Promise.resolve(0),
    needsOperationalData ? prisma.presenca.groupBy({
      by: ["alunoId"],
      where: { presente: true, data: attendanceYesterday }
    }).then((rows) => rows.length) : Promise.resolve(0),
    needsOperationalData ? prisma.agendaPersonal.count({
      where: {
        ativo: true,
        diaSemana: context.weekday,
        semanaRef: { in: ["", context.weekRef] },
        OR: [{ alunoId: null }, { aluno: activeStudentWhere }]
      }
    }) : Promise.resolve(0),
    needsOperationalData ? prisma.aluno.findMany({
      where: ACTIVE_STUDENT_DASHBOARD_WHERE,
      select: {
        id: true,
        nomeCompleto: true,
        fotoPath: true,
        status: true,
        presencas: { where: { presente: true }, orderBy: { data: "desc" }, take: 1, select: { data: true } },
        periodosMatricula: {
          where: { dataSaida: null, OR: [{ dataInicio: null }, { dataInicio: { lte: attendanceToday } }] },
          select: { dataInicio: true, dataSaida: true }
        }
      }
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
    attendancesYesterday,
    appointmentsToday,
    attendanceStudents,
    newStudents
  });
  return dashboardDtoForRole(full, role);
}
