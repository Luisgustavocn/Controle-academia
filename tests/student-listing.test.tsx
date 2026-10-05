import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import React from "react";
import "./setup-dom";
import { cleanup, render, screen } from "@testing-library/react";
import { AlunoStatus, UserRole } from "@prisma/client";
import { formatStudentAttendance } from "../components/students/student-listing";
import { CapabilityProvider } from "../components/capability-provider";
import { ResponsiveList } from "../components/ui/responsive-list";
import { StatusBadge } from "../components/ui/badge";
import {
  buildStudentOrderBy,
  buildStudentWhere,
  canViewStudentFinancial,
  parseStudentListParams,
  StudentListValidationError
} from "../lib/services/student-listing";
import { getCapabilitiesForRole } from "../lib/auth/capabilities";

afterEach(() => cleanup());

test("student listing validates pagination, filters and sort whitelist", () => {
  const params = parseStudentListParams(new URLSearchParams({
    page: "2",
    pageSize: "10",
    q: " Ana ",
    status: "ativo",
    modalidadeId: "mod-1",
    financial: "inadimplente",
    sort: "dueDay.desc"
  }));
  assert.deepEqual(params, {
    page: 2,
    pageSize: 10,
    q: "Ana",
    status: AlunoStatus.ATIVO,
    modalidadeId: "mod-1",
    financial: "INADIMPLENTE",
    sort: "dueDay.desc"
  });
  assert.throws(() => parseStudentListParams(new URLSearchParams({ pageSize: "500" })), StudentListValidationError);
  assert.throws(() => parseStudentListParams(new URLSearchParams({ sort: "createdAt.desc" })), StudentListValidationError);
  assert.throws(() => parseStudentListParams(new URLSearchParams({ status: "EXCLUIDO" })), StudentListValidationError);
});

test("student listing builds combined search, status, modality and financial filters", () => {
  const params = parseStudentListParams(new URLSearchParams({
    q: "1199",
    status: "INATIVO",
    modalidadeId: "musculacao",
    financial: "EM_DIA"
  }));
  const where = buildStudentWhere(params);
  assert.ok(Array.isArray(where.AND));
  assert.equal(where.AND?.length, 4);
  assert.deepEqual(buildStudentOrderBy("name.asc")[0], { nomeCompleto: "asc" });
  assert.deepEqual(buildStudentOrderBy("dueDay.desc")[0], { vencimentoDia: "desc" });
});

test("financial visibility follows role capabilities and protects personal DTO contract", () => {
  assert.equal(canViewStudentFinancial(UserRole.ADMIN), true);
  assert.equal(canViewStudentFinancial(UserRole.FINANCEIRO), true);
  assert.equal(canViewStudentFinancial(UserRole.RECEPCAO), true);
  assert.equal(canViewStudentFinancial(UserRole.PERSONAL), false);
  assert.equal(getCapabilitiesForRole(UserRole.PERSONAL).includes("finance.monthlies.read"), false);
});

test("attendance civil DATE is rendered as today, yesterday, date or empty", () => {
  const now = new Date("2026-10-05T15:00:00.000Z");
  assert.equal(formatStudentAttendance(null, now), "Sem presença");
  assert.equal(formatStudentAttendance("2026-10-05", now), "Hoje");
  assert.equal(formatStudentAttendance("2026-10-04", now), "Ontem");
  assert.equal(formatStudentAttendance("2026-09-20", now), "20/09/2026");
});

test("responsive student primitives expose desktop, mobile and semantic status", () => {
  render(
    <CapabilityProvider capabilities={getCapabilitiesForRole(UserRole.ADMIN)}>
      <ResponsiveList desktop={<table aria-label="Alunos desktop"><tbody><tr><td>Ana</td></tr></tbody></table>} mobile={<article aria-label="Aluno mobile">Ana</article>} />
      <StatusBadge status="Ativo" />
    </CapabilityProvider>
  );
  assert.ok(screen.getByRole("table", { name: "Alunos desktop" }));
  assert.ok(screen.getByRole("article", { name: "Aluno mobile" }));
  assert.equal(screen.getByText("Ativo").getAttribute("data-status"), "ativo");
});
