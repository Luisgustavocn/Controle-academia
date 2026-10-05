import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import React from "react";
import "./setup-dom";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AlunoStatus, MensalidadeStatus } from "@prisma/client";
import { StudentProfile } from "../components/students/student-profile";
import type { StudentProfileOverview } from "../lib/services/student-profile";

const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

const router: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch: async () => undefined
};

function overview(role: "ADMIN" | "FINANCEIRO" | "RECEPCAO" | "PERSONAL"): StudentProfileOverview {
  const financial = role !== "PERSONAL";
  const attendance = role !== "FINANCEIRO";
  const operational = role === "ADMIN" || role === "RECEPCAO";
  return {
    student: {
      id: "student-1",
      name: "Ana Teste",
      phone: "11999999999",
      status: AlunoStatus.ATIVO,
      dueDay: 10,
      startDate: "2026-01-10T12:00:00.000Z",
      exitDate: null,
      createdAt: "2026-01-09T12:00:00.000Z",
      notes: null,
      modality: { id: "mod-1", name: "Musculação" }
    },
    summary: {
      ...(attendance ? { attendance: { lastAttendanceAt: null, thisMonth: 0, last30Days: 0 } } : {}),
      ...(financial ? { financial: { status: "EM_DIA" as const, currentMonthly: { competence: "2026-10", value: 120, status: MensalidadeStatus.PENDENTE, dueAt: "2026-10-10T03:00:00.000Z", paidAt: null }, openCount: 0, lastPaymentAt: null, nextDueAt: "2026-10-10T03:00:00.000Z" } } : {})
    },
    capabilities: {
      edit: operational,
      changeStatus: operational,
      reactivate: false,
      viewFinancial: financial,
      manageFinancial: role === "ADMIN" || role === "FINANCEIRO",
      viewAttendance: attendance,
      writeAttendance: role === "ADMIN" || role === "RECEPCAO" || role === "PERSONAL"
    }
  };
}

function renderProfile(data: StudentProfileOverview) {
  return render(<AppRouterContext.Provider value={router}><StudentProfile initialOverview={data} returnTo="/alunos?q=ana&page=2" /></AppRouterContext.Provider>);
}

test("student profile renders reliable overview and preserved list return", () => {
  renderProfile(overview("ADMIN"));
  assert.ok(screen.getByRole("heading", { level: 1, name: "Ana Teste" }));
  assert.ok(screen.getAllByText("Musculação").length >= 1);
  assert.ok(screen.getByText("Nenhuma observação cadastrada."));
  assert.equal(screen.getByRole("link", { name: /Alunos/ }).getAttribute("href"), "/alunos?q=ana&page=2");
  assert.equal(screen.queryByRole("table"), null);
});

test("PERSONAL profile does not render or request financial data", () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(); };
  renderProfile(overview("PERSONAL"));
  assert.equal(screen.queryByRole("tab", { name: "Financeiro" }), null);
  assert.equal(screen.queryByText("Em dia"), null);
  assert.equal(screen.queryByText(/Mensalidade atual/), null);
  assert.equal(calls, 0);
});

test("FINANCEIRO sees finance without editing or attendance controls", async () => {
  const user = userEvent.setup({ document });
  renderProfile(overview("FINANCEIRO"));
  assert.ok(screen.getByRole("tab", { name: "Financeiro" }));
  assert.equal(screen.queryByRole("tab", { name: "Frequência" }), null);
  await user.click(screen.getByRole("button", { name: /Ações de Ana Teste/ }));
  const actions = screen.getAllByRole("menuitem").map((item) => item.textContent);
  assert.equal(actions.some((item) => item?.includes("Editar")), false);
  assert.equal(actions.some((item) => item?.includes("Cancelar")), false);
  assert.equal(actions.some((item) => item?.includes("Registrar pagamento")), true);
});

test("financial tab exposes loading and empty states with lazy single request", async () => {
  const user = userEvent.setup({ document });
  let resolveFetch: ((response: Response) => void) | undefined;
  let calls = 0;
  globalThis.fetch = () => {
    calls++;
    return new Promise<Response>((resolve) => { resolveFetch = resolve; });
  };
  renderProfile(overview("ADMIN"));
  await user.click(screen.getByRole("tab", { name: "Financeiro" }));
  assert.ok(screen.getByLabelText("Carregando seção"));
  resolveFetch?.(new Response(JSON.stringify({ data: { monthly: [], payments: [], limits: { monthly: 12, payments: 12 } } }), { status: 200, headers: { "Content-Type": "application/json" } }));
  await waitFor(() => assert.ok(screen.getByText("Sem mensalidades")));
  assert.ok(screen.getByText("Sem pagamentos separados"));
  assert.equal(calls, 1);
});

test("lazy tab failure renders ErrorState", async () => {
  const user = userEvent.setup({ document });
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "Falha controlada" }), { status: 500, headers: { "Content-Type": "application/json" } });
  renderProfile(overview("ADMIN"));
  await user.click(screen.getByRole("tab", { name: "Histórico" }));
  await waitFor(() => assert.ok(screen.getByRole("alert")));
  assert.ok(screen.getByText("Falha controlada"));
});

test("tabs remain keyboard accessible", async () => {
  const user = userEvent.setup({ document });
  globalThis.fetch = async () => new Response(JSON.stringify({ data: { monthly: [], payments: [], limits: { monthly: 12, payments: 12 } } }), { status: 200, headers: { "Content-Type": "application/json" } });
  renderProfile(overview("ADMIN"));
  const general = screen.getByRole("tab", { name: "Visão geral" });
  general.focus();
  await user.keyboard("{ArrowRight}");
  assert.equal(screen.getByRole("tab", { name: "Financeiro" }).getAttribute("aria-selected"), "true");
});
