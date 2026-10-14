import assert from "node:assert/strict";
import fs from "node:fs";
import test, { afterEach } from "node:test";
import React from "react";
import "./setup-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AlunoStatus, MensalidadeStatus } from "@prisma/client";
import { CapabilityProvider } from "../components/capability-provider";
import { CrudModule } from "../components/forms/crud-module";
import { PaymentMethodField } from "../components/monthlies/payment-method-field";
import { ACTIVE_STUDENT_DASHBOARD_WHERE } from "../lib/services/dashboard";
import { filterNavigationByCapabilities } from "../lib/navigation";
import { validatePaymentTransition } from "../lib/services/mensalidade-payment";

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

test("dashboard filter counts current ATIVO records and does not depend on enrollment joins", () => {
  assert.deepEqual(ACTIVE_STUDENT_DASHBOARD_WHERE, { status: AlunoStatus.ATIVO });
  assert.equal(Object.keys(ACTIVE_STUDENT_DASHBOARD_WHERE).length, 1);
});

test("student listing removes only the redundant end-enrollment action", () => {
  const listing = fs.readFileSync("components/students/student-listing.tsx", "utf8");
  const profile = fs.readFileSync("components/students/student-profile.tsx", "utf8");
  assert.equal(listing.includes("Encerrar matrícula"), false);
  assert.equal(listing.includes("Ver aluno"), true);
  assert.equal(listing.includes("Editar cadastro"), true);
  assert.equal(listing.includes("Retomar matrícula"), true);
  assert.equal(profile.includes("Encerrar matrícula"), true);
});

test("payment transition requires a method only when becoming paid", () => {
  assert.equal(validatePaymentTransition(MensalidadeStatus.PENDENTE, MensalidadeStatus.PAGO, ""), "Forma de pagamento é obrigatória");
  assert.equal(validatePaymentTransition(MensalidadeStatus.ATRASADO, MensalidadeStatus.PAGO, "PIX"), null);
  assert.equal(validatePaymentTransition(MensalidadeStatus.PAGO, MensalidadeStatus.PAGO, ""), null);
  assert.equal(validatePaymentTransition(MensalidadeStatus.PENDENTE, MensalidadeStatus.PENDENTE, ""), null);
});

test("shared payment method field exposes inline accessible invalid state", () => {
  render(<PaymentMethodField id="method" value="" error="Forma de pagamento é obrigatória" onChange={() => undefined} />);
  const input = screen.getByLabelText(/Forma de pagamento/);
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.match(input.className, /border-danger/);
  assert.ok(screen.getByRole("alert"));
});

test("shared CRUD blocks an empty required field and clears its visual error after correction", async () => {
  let writeRequests = 0;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    if (init?.method) writeRequests += 1;
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  render(
    <CapabilityProvider capabilities={["students.update"]}>
      <CrudModule endpoint="/api/modalidades" title="Modalidades" createLabel="Nova modalidade" listFields={["nome"]} fields={[{ key: "nome", label: "Nome da modalidade", required: true }]} createCapability="students.update" />
    </CapabilityProvider>
  );

  fireEvent.click(screen.getByRole("button", { name: "Nova modalidade" }));
  fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
  const input = screen.getByLabelText(/Nome da modalidade/);
  assert.equal(writeRequests, 0);
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.ok(screen.getByText("Nome da modalidade é obrigatório."));

  fireEvent.change(input, { target: { value: "Musculação" } });
  await waitFor(() => assert.notEqual(screen.getByLabelText(/Nome da modalidade/).getAttribute("aria-invalid"), "true"));
});

test("modalities has its own capability-controlled navigation entry", () => {
  const manager = filterNavigationByCapabilities(["students.read", "students.update"])
    .flatMap((group) => group.items)
    .find((item) => item.href === "/modalidades");
  const reader = filterNavigationByCapabilities(["students.read"])
    .flatMap((group) => group.items)
    .find((item) => item.href === "/modalidades");
  assert.equal(manager?.label, "Modalidades");
  assert.equal(reader, undefined);
});
