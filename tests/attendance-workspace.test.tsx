import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import React from "react";
import "./setup-dom";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import FrequenciaPage from "../app/frequencia/page";
import { GET as getTodayRoster } from "../app/api/frequencia/hoje/route";
import { GET as getAttendanceHistory } from "../app/api/frequencia/historico/route";
import { CapabilityProvider } from "../components/capability-provider";
import { getCapabilitiesForRole } from "../lib/auth/capabilities";
import { signSessionToken } from "../lib/auth/session";
import { academyToday } from "../lib/attendance-date";
import { parseAttendanceHistoryParams, parseAttendanceRosterParams } from "../lib/services/attendance-workspace";

const originalFetch = global.fetch;
process.env.JWT_SECRET = "attendance-workspace-test-secret-with-enough-entropy";

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});

function authenticatedRequest(path: string, role: UserRole | null) {
  const headers: Record<string, string> = {};
  if (role) {
    const token = signSessionToken({ id: `workspace-${role}`, name: role, email: `${role.toLowerCase()}@test.local`, role });
    headers.cookie = `academy_session=${token}`;
  }
  return new NextRequest(`http://localhost${path}`, { headers });
}

test("attendance workspace parses bounded roster and paginated history filters", () => {
  const reference = new Date("2026-10-05T15:00:00.000Z");
  assert.deepEqual(parseAttendanceRosterParams(new URLSearchParams({ data: "2026-10-05", q: "  Ana  ", page: "2", pageSize: "24" }), reference), {
    date: "2026-10-05",
    q: "Ana",
    page: 2,
    pageSize: 24
  });
  assert.throws(() => parseAttendanceRosterParams(new URLSearchParams({ data: "2026-10-06" }), reference));

  const history = parseAttendanceHistoryParams(new URLSearchParams({ competencia: "2026-10", q: " 1199 ", pageSize: "50" }), reference);
  assert.deepEqual(history, { from: "2026-10-01", to: "2026-10-31", q: "1199", alunoId: "", page: 1, pageSize: 50 });
  assert.throws(() => parseAttendanceHistoryParams(new URLSearchParams({ de: "2026-10-05", ate: "2026-10-04" }), reference));
});

test("retroactive roster and invalid history are rejected before database access", async () => {
  const noSession = await getTodayRoster(authenticatedRequest("/api/frequencia/hoje", null));
  assert.equal(noSession.status, 401);

  const retroactive = await getTodayRoster(authenticatedRequest("/api/frequencia/hoje?data=2020-01-01", UserRole.RECEPCAO));
  assert.equal(retroactive.status, 403);

  const future = await getTodayRoster(authenticatedRequest("/api/frequencia/hoje?data=2999-01-01", UserRole.ADMIN));
  assert.equal(future.status, 400);

  const invalidPeriod = await getAttendanceHistory(authenticatedRequest("/api/frequencia/historico?de=2026-10-05&ate=2026-10-04", UserRole.ADMIN));
  assert.equal(invalidPeriod.status, 400);
});

test("frequency page starts in Today and keeps the monthly grid compact and contained", async () => {
  const today = academyToday();
  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/api/frequencia/hoje")) {
      return new Response(JSON.stringify({
        date: today,
        summary: { activeStudents: 2, presentStudents: 1, attendanceRate: 50 },
        items: [{ id: "student-1", name: "João Silva", phone: "11999990000", modality: "Musculação", attendance: null }],
        pagination: { page: 1, pageSize: 12, totalItems: 1, totalPages: 1 }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/api/frequencia/matriz")) {
      return new Response(JSON.stringify({ items: { alunos: [{ id: "student-1", nomeCompleto: "João Silva", status: "ATIVO", modalidade: { nome: "Musculação" } }], presencas: [] } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const user = userEvent.setup({ document });
  render(<CapabilityProvider capabilities={getCapabilitiesForRole(UserRole.ADMIN)}><FrequenciaPage /></CapabilityProvider>);

  assert.equal(screen.getByRole("tab", { name: /Hoje/ }).getAttribute("aria-selected"), "true");
  assert.ok(screen.getByRole("tab", { name: /Histórico/ }));
  assert.ok(screen.getByRole("tab", { name: /Visão mensal/ }));
  await screen.findByText("João Silva");
  assert.ok(screen.getByRole("button", { name: "Marcar presença" }));
  assert.ok(screen.getByText("50%"));

  await user.click(screen.getByRole("tab", { name: /Visão mensal/ }));
  await waitFor(() => assert.ok(screen.getByRole("table")));
  const studentColumn = screen.getByRole("table").querySelector("col");
  assert.match(studentColumn?.className ?? "", /w-\[160px\]/);
  assert.match(studentColumn?.className ?? "", /sm:w-\[176px\]/);
  assert.ok(screen.getByRole("table").parentElement?.className.includes("overflow-x-auto"));
});
