import assert from "node:assert/strict";
import fs from "node:fs";
import test, { afterEach } from "node:test";
import React from "react";
import "./setup-dom";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { PaymentMethodField, withHistoricalPaymentMethod } from "../components/monthlies/payment-method-field";
import {
  expenseRequiresPaymentMethod,
  normalizePaymentMethodName,
  paymentMethodApplies
} from "../lib/services/payment-methods";

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

test("payment method names reject obvious case and accent duplicates through one normalized key", () => {
  assert.equal(normalizePaymentMethodName("  Cartão   de Crédito "), "cartao de credito");
  assert.equal(normalizePaymentMethodName("CARTAO DE CREDITO"), "cartao de credito");
  assert.equal(normalizePaymentMethodName("Pix"), normalizePaymentMethodName("PIX"));
});

test("application rules separate receipts, expenses and shared methods", () => {
  assert.equal(paymentMethodApplies("RECEBIMENTO", "RECEBIMENTO"), true);
  assert.equal(paymentMethodApplies("RECEBIMENTO", "DESPESA"), false);
  assert.equal(paymentMethodApplies("DESPESA", "RECEBIMENTO"), false);
  assert.equal(paymentMethodApplies("AMBOS", "RECEBIMENTO"), true);
  assert.equal(paymentMethodApplies("AMBOS", "DESPESA"), true);
});

test("paid and partial expenses require a method while open expenses do not", () => {
  assert.equal(expenseRequiresPaymentMethod("PENDENTE", 0), false);
  assert.equal(expenseRequiresPaymentMethod("PAGO", 100), true);
  assert.equal(expenseRequiresPaymentMethod("PARCIAL", 10), true);
  assert.equal(expenseRequiresPaymentMethod("PENDENTE", 10), true);
});

test("inactive or unregistered historical text remains visible only as the current value", () => {
  const active = [{ id: "pix", nome: "PIX", ativo: true }];
  assert.deepEqual(withHistoricalPaymentMethod(active, "Dinheiro antigo"), [
    { id: "historical:Dinheiro antigo", nome: "Dinheiro antigo", ativo: false },
    ...active
  ]);
  assert.equal(withHistoricalPaymentMethod(active, "PIX").length, 1);
});

test("monthly payment field is a dynamic accessible select and keeps historical value", async () => {
  globalThis.fetch = (async (input: string | URL | Request) => {
    assert.match(String(input), /ativo=true&aplicacao=RECEBIMENTO/);
    return new Response(JSON.stringify({ items: [{ id: "pix", nome: "PIX", ativo: true }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  render(<PaymentMethodField id="method" value="Legado" error="Forma de pagamento é obrigatória" onChange={() => undefined} />);
  const select = screen.getByLabelText(/Forma de pagamento/);
  assert.equal(select.tagName, "SELECT");
  assert.equal(select.getAttribute("aria-invalid"), "true");
  assert.equal(select.getAttribute("aria-describedby"), "method-error");
  assert.ok(screen.getByRole("alert"));
  await waitFor(() => assert.ok(screen.getByRole("option", { name: "PIX" })));
  assert.ok(screen.getByRole("option", { name: /Legado.*histórica\/inativa/ }));
});

test("migration is structural and does not rewrite operational history", () => {
  const migration = fs.readFileSync("prisma/migrations/0006_configurable_payment_methods/migration.sql", "utf8");
  assert.match(migration, /CREATE TABLE "FormaPagamento"/);
  assert.match(migration, /ADD COLUMN "formaPagamento" TEXT/);
  assert.doesNotMatch(migration, /\b(?:UPDATE|INSERT|DELETE)\b/i);

  const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
  assert.match(schema, /model Mensalidade[\s\S]*formaPagamento String\?/);
  assert.match(schema, /model Pagamento[\s\S]*formaPagamento String/);
  assert.match(schema, /model MovimentacaoCaixa[\s\S]*formaPagamento String\?/);
});

test("configuration and financial flows share the centralized endpoint", () => {
  const settings = fs.readFileSync("app/configuracoes/page.tsx", "utf8");
  const expenses = fs.readFileSync("app/despesas-academia/page.tsx", "utf8");
  const crud = fs.readFileSync("components/forms/crud-module.tsx", "utf8");
  const monthly = fs.readFileSync("app/mensalidades/page.tsx", "utf8");
  const paymentDialog = fs.readFileSync("components/monthlies/monthly-payment-dialog.tsx", "utf8");
  const backup = fs.readFileSync("lib/services/backup.ts", "utf8");
  assert.match(settings, /endpoint="\/api\/formas-pagamento"/);
  assert.match(expenses, /aplicacao=DESPESA/);
  assert.match(crud, /\/api\/formas-pagamento\?ativo=true&aplicacao=/);
  assert.equal((monthly.match(/<PaymentMethodField/g)?.length ?? 0) + (paymentDialog.match(/<PaymentMethodField/g)?.length ?? 0), 2);
  assert.match(backup, /formasPagamento/);
  assert.match(backup, /prisma\.formaPagamento\.findMany/);
});
