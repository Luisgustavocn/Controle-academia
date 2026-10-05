import assert from "node:assert/strict";
import test from "node:test";
import { AlunoStatus, MensalidadeStatus } from "@prisma/client";
import {
  buildFinanceSeriesFromRows,
  buildOperationalDashboardFromRows,
  dashboardDtoForRole,
  NO_ATTENDANCE_ALERT_DAYS,
  type OperationalDashboardSource
} from "../lib/services/dashboard";
import { getAcademyDateContext, recentCompetencias } from "../lib/timezone";

test("batched finance series preserves the legacy month-by-month totals", () => {
  const competencias = ["2026-01", "2026-02", "2026-03"];
  const rows = {
    mensalidades: [
      { dataPagamento: new Date("2026-01-10T12:00:00.000Z"), valor: 100 },
      { dataPagamento: new Date("2026-02-10T12:00:00.000Z"), valor: 150 },
      { dataPagamento: new Date("2026-02-20T12:00:00.000Z"), valor: 50 },
      { dataPagamento: null, valor: 999 }
    ],
    despesas: [
      { competencia: "2026-01", valorPrevisto: 90, valorPago: 80 },
      { competencia: "2026-02", valorPrevisto: 40, valorPago: 40 },
      { competencia: "2026-03", valorPrevisto: 70, valorPago: 0 }
    ],
    pedidos: [
      { dataPedido: new Date("2026-01-05T12:00:00.000Z"), pago: 25 },
      { dataPedido: new Date("2026-03-05T12:00:00.000Z"), pago: 60 }
    ]
  };

  const legacyResult = competencias.map((competencia) => {
    const receitaMensalidades = rows.mensalidades
      .filter((item) => item.dataPagamento?.toISOString().startsWith(competencia))
      .reduce((total, item) => total + Number(item.valor), 0);
    const receitaPedidos = rows.pedidos
      .filter((item) => item.dataPedido.toISOString().startsWith(competencia))
      .reduce((total, item) => total + Number(item.pago), 0);
    const despesa = rows.despesas
      .filter((item) => item.competencia === competencia)
      .reduce((total, item) => total + Number(item.valorPago || item.valorPrevisto), 0);
    const receita = receitaMensalidades + receitaPedidos;

    return { competencia, receita, despesa, saldo: receita - despesa };
  });

  assert.deepEqual(buildFinanceSeriesFromRows(competencias, rows), legacyResult);
});

function emptySource(): OperationalDashboardSource {
  return {
    activeStudents: 0,
    openMensalidades: [],
    paidMensalidades: [],
    orders: [],
    expenses: [],
    attendancesToday: 0,
    appointmentsToday: 0,
    lastAttendances: [],
    newStudents: []
  };
}

test("operational dashboard calculates real overview and today metrics without duplicate debtors", () => {
  const now = new Date("2026-10-05T15:00:00.000Z");
  const context = getAcademyDateContext(now);
  const source: OperationalDashboardSource = {
    ...emptySource(),
    activeStudents: 3,
    attendancesToday: 4,
    appointmentsToday: 2,
    openMensalidades: [
      { id: "m1", alunoId: "a1", competencia: "2026-10", valor: 100, vencimento: new Date("2026-10-05T13:00:00Z"), dataPagamento: null, status: MensalidadeStatus.PENDENTE, aluno: { nomeCompleto: "Ana" } },
      { id: "m2", alunoId: "a2", competencia: "2026-10", valor: 80, vencimento: new Date("2026-10-03T13:00:00Z"), dataPagamento: null, status: MensalidadeStatus.ATRASADO, aluno: { nomeCompleto: "Bia" } },
      { id: "m3", alunoId: "a2", competencia: "2026-09", valor: 50, vencimento: new Date("2026-09-03T13:00:00Z"), dataPagamento: null, status: MensalidadeStatus.ATRASADO, aluno: { nomeCompleto: "Bia" } }
    ],
    paidMensalidades: [
      { id: "p1", alunoId: "a1", competencia: "2026-10", valor: 120, dataPagamento: new Date("2026-10-05T14:00:00Z"), status: MensalidadeStatus.PAGO, aluno: { nomeCompleto: "Ana" } },
      { id: "p2", alunoId: "a3", competencia: "2026-09", valor: 90, dataPagamento: new Date("2026-09-20T14:00:00Z"), status: MensalidadeStatus.PAGO, aluno: { nomeCompleto: "Caio" } }
    ],
    orders: [{ id: "o1", clienteNome: "Ana", dataPedido: new Date("2026-10-05T16:00:00Z"), pago: 30, aluno: { nomeCompleto: "Ana" } }],
    expenses: [],
    lastAttendances: [
      { alunoId: "a1", _max: { data: new Date("2026-09-20T14:00:00Z") } },
      { alunoId: "a2", _max: { data: new Date("2026-10-01T14:00:00Z") } }
    ],
    newStudents: [{ id: "a3", nomeCompleto: "Caio", createdAt: new Date("2026-10-04T14:00:00Z"), status: AlunoStatus.ATIVO }]
  };

  const result = buildOperationalDashboardFromRows(context, recentCompetencias(now), source);
  assert.deepEqual(result.overview, {
    activeStudents: 3,
    receivedMonth: 150,
    receivableCurrent: 180,
    delinquentStudents: 1
  });
  assert.deepEqual(result.today, {
    attendances: 4,
    appointments: 2,
    due: { count: 1, amount: 100 },
    received: 150
  });
  assert.deepEqual(result.attention.overdue, { students: 1, amount: 130 });
  assert.deepEqual(result.attention.noRecentAttendance, { students: 1, thresholdDays: NO_ATTENDANCE_ALERT_DAYS });
  assert.equal(result.recent.payments.length, 3);
  assert.equal(result.recent.students[0]?.title, "Caio");
});

test("operational dashboard remains numeric with zero data", () => {
  const now = new Date("2026-10-05T15:00:00.000Z");
  const result = buildOperationalDashboardFromRows(getAcademyDateContext(now), recentCompetencias(now), emptySource());
  assert.deepEqual(result.overview, { activeStudents: 0, receivedMonth: 0, receivableCurrent: 0, delinquentStudents: 0 });
  assert.deepEqual(result.today, { attendances: 0, appointments: 0, due: { count: 0, amount: 0 }, received: 0 });
  assert.equal(result.financialSeries.length, 12);
  assert.equal(result.financialSeries.every((item) => item.receita === 0 && item.despesa === 0 && item.saldo === 0), true);
});

test("role DTO removes blocks that the role must not receive", () => {
  const now = new Date("2026-10-05T15:00:00.000Z");
  const full = buildOperationalDashboardFromRows(getAcademyDateContext(now), recentCompetencias(now), emptySource());
  const admin = dashboardDtoForRole(full, "ADMIN");
  const financeiro = dashboardDtoForRole(full, "FINANCEIRO");
  const recepcao = dashboardDtoForRole(full, "RECEPCAO");
  const personal = dashboardDtoForRole(full, "PERSONAL");

  assert.ok(admin.financialSeries);
  assert.equal(financeiro.today?.attendances, undefined);
  assert.equal(financeiro.attention?.noRecentAttendance, undefined);
  assert.equal(financeiro.recent?.students, undefined);
  assert.ok(financeiro.financialSeries);
  assert.equal(recepcao.financialSeries, undefined);
  assert.equal(recepcao.today?.attendances, 0);
  assert.equal(personal.today, undefined);
  assert.equal(personal.recent, undefined);
  assert.equal(personal.financialSeries, undefined);
});

test("academy date boundaries switch at midnight in Sao Paulo", () => {
  const beforeMidnight = getAcademyDateContext(new Date("2026-10-05T02:59:59.000Z"));
  const afterMidnight = getAcademyDateContext(new Date("2026-10-05T03:00:00.000Z"));

  assert.equal(beforeMidnight.dateKey, "2026-10-04");
  assert.equal(afterMidnight.dateKey, "2026-10-05");
  assert.equal(afterMidnight.dayStart.toISOString(), "2026-10-05T03:00:00.000Z");
  assert.equal(afterMidnight.dayEnd.toISOString(), "2026-10-06T03:00:00.000Z");
  assert.equal(afterMidnight.competencia, "2026-10");
});

test("financial series assigns an instant to the Sao Paulo civil month", () => {
  const result = buildFinanceSeriesFromRows(["2026-09", "2026-10"], {
    mensalidades: [{ dataPagamento: new Date("2026-10-01T02:30:00.000Z"), valor: 100 }],
    despesas: [],
    pedidos: []
  });

  assert.equal(result[0]?.receita, 100);
  assert.equal(result[1]?.receita, 0);
});
