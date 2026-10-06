import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import { POST as postAttendance } from "../app/api/presencas/route";
import { signSessionToken } from "../lib/auth/session";
import { SESSION_COOKIE_NAME } from "../lib/auth/jwt-payload";
import { academyToday, addCivilDays } from "../lib/attendance-date";
import { prisma } from "../lib/prisma";
import { getOperationalDashboard } from "../lib/services/dashboard";
import { listStudents } from "../lib/services/student-listing";
import { getStudentProfileAttendance, getStudentProfileOverview } from "../lib/services/student-profile";
import {
  AttendancePermissionError,
  AttendanceValidationError,
  confirmAttendance,
  confirmAttendanceById,
  removeAttendance
} from "../lib/services/attendance";
import { inspectAttendanceMigration } from "../lib/services/attendance-preflight";
import { getAttendanceHistory, getAttendanceRoster } from "../lib/services/attendance-workspace";

process.env.JWT_SECRET = "attendance-integration-test-secret-with-enough-entropy";
const reference = new Date("2026-10-05T15:00:00.000Z");

function requestFor(role: UserRole | null, body: Record<string, unknown>) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (role) {
    const token = signSessionToken({ id: `api-${role}`, name: role, email: `${role.toLowerCase()}@test.local`, role });
    headers.cookie = `${SESSION_COOKIE_NAME}=${token}`;
  }
  return new NextRequest("http://localhost/api/presencas", { method: "POST", headers, body: JSON.stringify(body) });
}

async function main() {
  const suffix = Date.now().toString(36);
  const admin = await prisma.user.create({
    data: { id: `attendance-admin-${suffix}`, name: "Attendance Admin", email: `attendance-${suffix}@test.local`, passwordHash: "not-used", role: UserRole.ADMIN }
  });
  const student = await prisma.aluno.create({
    data: { id: `attendance-student-${suffix}`, nomeCompleto: "Attendance Test", telefone: `primary-${suffix}`, vencimentoDia: 10, status: "ATIVO", dataInicio: new Date("2026-01-01T00:00:00.000Z") }
  });
  const apiStudent = await prisma.aluno.create({
    data: { id: `attendance-api-${suffix}`, nomeCompleto: "Attendance API Test", telefone: `api-${suffix}`, vencimentoDia: 10, status: "ATIVO", dataInicio: new Date("2026-01-01T00:00:00.000Z") }
  });
  await prisma.periodoMatricula.createMany({ data: [student.id, apiStudent.id].map((alunoId) => ({
    alunoId, dataInicio: new Date("2026-01-01T00:00:00.000Z"), diaVencimento: 10, usarValorPadrao: true
  })) });

  const input = { alunoId: student.id, data: "2026-10-05", horario: null, tipoAula: "musculacao" };
  const concurrent = await Promise.all(
    Array.from({ length: 8 }, () => confirmAttendance(input, { id: admin.id, role: UserRole.ADMIN }, reference))
  );
  assert.equal(concurrent.filter((result) => result.created).length, 1);
  assert.equal(new Set(concurrent.map((result) => result.item.id)).size, 1);
  assert.equal(await prisma.presenca.count({ where: { alunoId: student.id, data: new Date("2026-10-05T00:00:00.000Z") } }), 1);
  assert.equal(concurrent[0]?.item.data, "2026-10-05");

  const duplicateWithTime = await confirmAttendance(
    { ...input, horario: "18:30" },
    { id: admin.id, role: UserRole.ADMIN },
    reference
  );
  assert.equal(duplicateWithTime.created, false);
  assert.equal(duplicateWithTime.item.horario, null);

  const anotherDay = await confirmAttendance(
    { ...input, data: "2026-10-04", horario: "07:00" },
    { id: admin.id, role: UserRole.ADMIN },
    reference
  );
  assert.equal(anotherDay.created, true);
  assert.equal(anotherDay.item.data, "2026-10-04");

  await assert.rejects(
    () => confirmAttendance({ ...input, data: "2026-10-04" }, { id: admin.id, role: UserRole.RECEPCAO }, reference),
    AttendancePermissionError
  );
  await assert.rejects(
    () => confirmAttendance({ ...input, data: "2026-10-06" }, { id: admin.id, role: UserRole.ADMIN }, reference),
    AttendanceValidationError
  );

  const falseRecord = await prisma.presenca.create({
    data: { alunoId: student.id, data: new Date("2026-10-03T00:00:00.000Z"), horario: null, tipoAula: "personal", presente: false }
  });
  const confirmed = await confirmAttendanceById(falseRecord.id, { id: admin.id, role: UserRole.ADMIN }, reference);
  assert.equal(confirmed.presente, true);
  await removeAttendance(falseRecord.id, { id: admin.id, role: UserRole.ADMIN }, reference);
  assert.equal(await prisma.presenca.count({ where: { id: falseRecord.id } }), 0);

  const noSession = await postAttendance(requestFor(null, input));
  assert.equal(noSession.status, 401);
  const forbidden = await postAttendance(requestFor(UserRole.FINANCEIRO, input));
  assert.equal(forbidden.status, 403);
  const invalid = await postAttendance(requestFor(UserRole.ADMIN, { ...input, data: "05/10/2026" }));
  assert.equal(invalid.status, 400);
  const missing = await postAttendance(requestFor(UserRole.ADMIN, { ...input, alunoId: "missing" }));
  assert.equal(missing.status, 404);
  const apiToday = academyToday();
  const apiInput = { alunoId: apiStudent.id, data: apiToday, horario: "09:15", tipoAula: "personal" };
  const apiCreated = await postAttendance(requestFor(UserRole.ADMIN, apiInput));
  assert.equal(apiCreated.status, 201);
  const apiDuplicate = await postAttendance(requestFor(UserRole.ADMIN, apiInput));
  assert.equal(apiDuplicate.status, 200);
  const apiRetroactiveDenied = await postAttendance(
    requestFor(UserRole.RECEPCAO, { ...apiInput, data: addCivilDays(apiToday, -10) })
  );
  assert.equal(apiRetroactiveDenied.status, 403);
  const apiFuture = await postAttendance(
    requestFor(UserRole.ADMIN, { ...apiInput, data: addCivilDays(apiToday, 1) })
  );
  assert.equal(apiFuture.status, 400);

  const expectedToday = await prisma.presenca.count({
    where: { presente: true, data: new Date("2026-10-05T00:00:00.000Z") }
  });
  const dashboard = await getOperationalDashboard(UserRole.ADMIN, reference);
  assert.equal(dashboard.today?.attendances, expectedToday);
  const profile = await getStudentProfileOverview(student.id, UserRole.ADMIN, reference);
  assert.equal(profile.summary.attendance?.lastAttendanceAt, "2026-10-05");
  const history = await getStudentProfileAttendance(student.id, reference);
  assert.equal(history.items[0]?.date, "2026-10-05");
  const listing = await listStudents({
    page: 1,
    pageSize: 20,
    q: `primary-${suffix}`,
    status: "",
    modalidadeId: "",
    financial: "",
    sort: "name.asc"
  }, UserRole.ADMIN);
  assert.equal(listing.items[0]?.lastAttendanceAt, "2026-10-05");

  const roster = await getAttendanceRoster({ date: "2026-10-05", q: `primary-${suffix}`, page: 1, pageSize: 12 });
  assert.equal(roster.items.length, 1);
  assert.equal(roster.items[0]?.attendance?.id, concurrent[0]?.item.id);
  const workspaceHistory = await getAttendanceHistory({
    from: "2026-10-01",
    to: "2026-10-31",
    q: `primary-${suffix}`,
    alunoId: "",
    page: 1,
    pageSize: 20
  });
  assert.equal(workspaceHistory.items.some((item) => item.date === "2026-10-05"), true);
  assert.equal(workspaceHistory.pagination.totalItems, 2);

  const migratedSchemaPreflight = await inspectAttendanceMigration(prisma);
  assert.equal(migratedSchemaPreflight.safe, true);
  assert.equal(migratedSchemaPreflight.nonMidnightDates, 0);

  const auditActions = await prisma.logAuditoria.groupBy({
    by: ["acao"],
    where: { modulo: "presencas", entidadeId: { in: [falseRecord.id, concurrent[0]!.item.id, anotherDay.item.id] } },
    _count: { _all: true }
  });
  assert.equal(auditActions.some((item) => item.acao === "CREATE"), true);
  assert.equal(auditActions.some((item) => item.acao === "UPDATE"), true);
  assert.equal(auditActions.some((item) => item.acao === "DELETE"), true);

  console.log(JSON.stringify({ status: "ok", concurrentAttempts: concurrent.length, rowsForSameDay: 1 }));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
