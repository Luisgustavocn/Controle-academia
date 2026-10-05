import assert from "node:assert/strict";
import test from "node:test";
import { AlunoStatus, MensalidadeStatus, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { GET as getProfile } from "../app/api/alunos/[id]/perfil/route";
import { signSessionToken } from "../lib/auth/session";
import { SESSION_COOKIE_NAME } from "../lib/auth/jwt-payload";
import { prisma } from "../lib/prisma";
import {
  financialStatusFromOpenCount,
  getStudentProfileAttendance,
  getStudentProfileFinancial,
  getStudentProfileHistory,
  getStudentProfileOverview,
  StudentProfileNotFoundError,
  studentProfileCapabilities
} from "../lib/services/student-profile";

type MockMethod = (...args: unknown[]) => Promise<unknown>;
type MockDb = {
  aluno: { findUnique: MockMethod };
  presenca: { findFirst: MockMethod; count: MockMethod; findMany: MockMethod };
  mensalidade: { findUnique: MockMethod; count: MockMethod; findFirst: MockMethod; findMany: MockMethod };
  pagamento: { findMany: MockMethod };
  historicoPlano: { findMany: MockMethod };
};

const db = prisma as unknown as MockDb;
const originals = {
  alunoFindUnique: db.aluno.findUnique,
  presencaFindFirst: db.presenca.findFirst,
  presencaCount: db.presenca.count,
  presencaFindMany: db.presenca.findMany,
  mensalidadeFindUnique: db.mensalidade.findUnique,
  mensalidadeCount: db.mensalidade.count,
  mensalidadeFindFirst: db.mensalidade.findFirst,
  mensalidadeFindMany: db.mensalidade.findMany,
  pagamentoFindMany: db.pagamento.findMany,
  historicoPlanoFindMany: db.historicoPlano.findMany
};

const student = {
  id: "student-1",
  nomeCompleto: "Ana Teste",
  telefone: "11999999999",
  status: AlunoStatus.ATIVO,
  vencimentoDia: 10,
  dataInicio: new Date("2026-01-10T12:00:00.000Z"),
  dataSaidaCancelamento: null,
  createdAt: new Date("2026-01-09T12:00:00.000Z"),
  observacoes: "Observação confiável",
  modalidade: { id: "mod-1", nome: "Musculação" }
};

function installDefaults() {
  db.aluno.findUnique = async () => student;
  db.presenca.findFirst = async () => ({ data: new Date("2026-10-05T13:00:00.000Z") });
  let countCall = 0;
  db.presenca.count = async () => (++countCall === 1 ? 4 : 7);
  db.presenca.findMany = async () => [];
  db.mensalidade.findUnique = async () => ({ competencia: "2026-10", valor: 120, vencimento: new Date("2026-10-10T03:00:00.000Z"), dataPagamento: null, status: MensalidadeStatus.PENDENTE });
  db.mensalidade.count = async () => 2;
  db.mensalidade.findFirst = async () => ({ dataPagamento: new Date("2026-09-10T13:00:00.000Z") });
  db.mensalidade.findMany = async () => [];
  db.pagamento.findMany = async () => [];
  db.historicoPlano.findMany = async () => [];
}

test.beforeEach(installDefaults);
test.after(() => {
  db.aluno.findUnique = originals.alunoFindUnique;
  db.presenca.findFirst = originals.presencaFindFirst;
  db.presenca.count = originals.presencaCount;
  db.presenca.findMany = originals.presencaFindMany;
  db.mensalidade.findUnique = originals.mensalidadeFindUnique;
  db.mensalidade.count = originals.mensalidadeCount;
  db.mensalidade.findFirst = originals.mensalidadeFindFirst;
  db.mensalidade.findMany = originals.mensalidadeFindMany;
  db.pagamento.findMany = originals.pagamentoFindMany;
  db.historicoPlano.findMany = originals.historicoPlanoFindMany;
});

test("profile overview consolidates reliable student, finance and attendance data", async () => {
  const result = await getStudentProfileOverview("student-1", UserRole.ADMIN, new Date("2026-10-05T15:00:00.000Z"));
  assert.equal(result.student.name, "Ana Teste");
  assert.equal(result.student.modality?.name, "Musculação");
  assert.equal(result.student.status, AlunoStatus.ATIVO);
  assert.equal(result.summary.attendance?.thisMonth, 4);
  assert.equal(result.summary.attendance?.last30Days, 7);
  assert.equal(result.summary.financial?.status, "INADIMPLENTE");
  assert.equal(result.summary.financial?.currentMonthly?.value, 120);
  assert.equal(result.summary.financial?.openCount, 2);
});

test("profile throws a dedicated not-found error", async () => {
  db.aluno.findUnique = async () => null;
  await assert.rejects(() => getStudentProfileOverview("missing", UserRole.ADMIN), StudentProfileNotFoundError);
});

test("PERSONAL DTO never queries or returns financial data", async () => {
  let financialCalls = 0;
  db.mensalidade.findUnique = async () => { financialCalls++; return null; };
  db.mensalidade.count = async () => { financialCalls++; return 0; };
  db.mensalidade.findFirst = async () => { financialCalls++; return null; };
  const result = await getStudentProfileOverview("student-1", UserRole.PERSONAL);
  assert.equal(result.summary.financial, undefined);
  assert.equal(result.capabilities.viewFinancial, false);
  assert.equal(financialCalls, 0);
});

test("FINANCEIRO receives finance but no attendance or administrative actions", async () => {
  let attendanceCalls = 0;
  db.presenca.findFirst = async () => { attendanceCalls++; return null; };
  db.presenca.count = async () => { attendanceCalls++; return 0; };
  const result = await getStudentProfileOverview("student-1", UserRole.FINANCEIRO);
  assert.ok(result.summary.financial);
  assert.equal(result.summary.attendance, undefined);
  assert.equal(result.capabilities.edit, false);
  assert.equal(result.capabilities.changeStatus, false);
  assert.equal(attendanceCalls, 0);
});

test("capability actions preserve the current role matrix and status rules", () => {
  assert.equal(studentProfileCapabilities(UserRole.ADMIN, AlunoStatus.CANCELADO).reactivate, true);
  assert.equal(studentProfileCapabilities(UserRole.RECEPCAO, AlunoStatus.ATIVO).edit, true);
  assert.equal(studentProfileCapabilities(UserRole.FINANCEIRO, AlunoStatus.ATIVO).changeStatus, false);
  assert.equal(studentProfileCapabilities(UserRole.PERSONAL, AlunoStatus.ATIVO).writeAttendance, true);
  assert.equal(financialStatusFromOpenCount(0), "EM_DIA");
  assert.equal(financialStatusFromOpenCount(1), "INADIMPLENTE");
});

test("financial section limits and maps monthly and explicit payment history", async () => {
  db.mensalidade.findMany = async () => [{ id: "m1", competencia: "2026-10", valor: 120, vencimento: new Date("2026-10-10T03:00:00Z"), dataPagamento: null, formaPagamento: null, status: MensalidadeStatus.PENDENTE }];
  db.pagamento.findMany = async () => [{ id: "p1", valor: 120, dataPagamento: new Date("2026-09-10T13:00:00Z"), formaPagamento: "PIX", status: "CONFIRMADO", mensalidade: { competencia: "2026-09" } }];
  const result = await getStudentProfileFinancial("student-1");
  assert.equal(result.limits.monthly, 12);
  assert.equal(result.monthly[0]?.value, 120);
  assert.equal(result.payments[0]?.competence, "2026-09");
});

test("attendance section returns recent confirmed attendance in descending source order", async () => {
  db.presenca.findMany = async () => [
    { id: "a2", data: new Date("2026-10-05T13:00:00Z"), horario: "10:00", tipoAula: "musculacao" },
    { id: "a1", data: new Date("2026-10-04T13:00:00Z"), horario: null, tipoAula: "musculacao" }
  ];
  const result = await getStudentProfileAttendance("student-1", new Date("2026-10-05T15:00:00Z"));
  assert.equal(result.periodDays, 60);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]?.time, "10:00");
  assert.equal(result.hasMore, false);
});

test("history includes only persisted registration, current exit and plan changes", async () => {
  db.aluno.findUnique = async () => ({ id: "student-1", createdAt: new Date("2026-01-09T12:00:00Z"), status: AlunoStatus.CANCELADO, dataSaidaCancelamento: new Date("2026-10-01T12:00:00Z") });
  db.historicoPlano.findMany = async () => [{ id: "h1", modalidadeAnterior: "A", modalidadeNova: "B", dataMudanca: new Date("2026-05-01T12:00:00Z"), observacao: null }];
  const result = await getStudentProfileHistory("student-1");
  assert.equal(result.registration.type, "REGISTRATION");
  assert.equal(result.currentExit?.status, AlunoStatus.CANCELADO);
  assert.equal(result.planChanges[0]?.newModality, "B");
});

const previousSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = "student-profile-tests-secret-with-enough-entropy";
function requestFor(role: UserRole, section: string) {
  const token = signSessionToken({ id: `u-${role}`, name: role, email: `${role.toLowerCase()}@test.local`, role });
  return new NextRequest(`http://localhost/api/alunos/student-1/perfil?section=${section}`, { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } });
}

test("profile API rejects financial data for PERSONAL before database access", async () => {
  const response = await getProfile(requestFor(UserRole.PERSONAL, "financial"), { params: Promise.resolve({ id: "student-1" }) });
  assert.equal(response.status, 403);
});

test("profile API rejects arbitrary sections and returns 404 for missing student", async () => {
  const invalid = await getProfile(requestFor(UserRole.ADMIN, "private-data"), { params: Promise.resolve({ id: "student-1" }) });
  assert.equal(invalid.status, 400);
  db.aluno.findUnique = async () => null;
  const missing = await getProfile(requestFor(UserRole.ADMIN, "overview"), { params: Promise.resolve({ id: "missing" }) });
  assert.equal(missing.status, 404);
});

test.after(() => {
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});
