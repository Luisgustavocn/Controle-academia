import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MensalidadeStatus, PagamentoStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { initialMonthlyStatus, MonthlyPaymentError, registerMonthlyPayment } from "../lib/services/monthly-payments";

type Row = Record<string, unknown>;

function fakeTransaction(original = 110) {
  const payments: Row[] = [];
  const cash: Row[] = [];
  const monthly: Row = {
    id: "monthly-1", alunoId: "student-1", competencia: "2026-10", valor: new Prisma.Decimal(original),
    valorFinal: null, motivoAjuste: null, vencimento: new Date("2026-10-10T00:00:00Z"),
    dataPagamento: null, formaPagamento: null, status: MensalidadeStatus.PENDENTE,
    aluno: { nomeCompleto: "Ana" }, pagamentos: payments
  };
  const tx = {
    $queryRaw: async () => [{ id: "monthly-1" }],
    pagamento: {
      findUnique: async ({ where }: { where: { id: string } }) => payments.find((item) => item.id === where.id) ?? null,
      create: async ({ data }: { data: Row }) => { const row = { ...data }; payments.push(row); return row; }
    },
    mensalidade: {
      findUnique: async () => ({ ...monthly, pagamentos: payments }),
      update: async ({ data }: { data: Row }) => { Object.assign(monthly, data); return { ...monthly }; }
    },
    categoriaFinanceira: {
      findFirst: async () => ({ id: "category-1", tipo: "ENTRADA" }),
      create: async () => ({ id: "category-1" })
    },
    movimentacaoCaixa: {
      create: async ({ data }: { data: Row }) => { if (cash.some((item) => item.id === data.id)) throw new Error("duplicate cash"); const row = { ...data }; cash.push(row); return row; }
    },
    user: { findUnique: async () => ({ id: "user-1" }) },
    logAuditoria: { create: async ({ data }: { data: Row }) => data }
  };
  return { tx: tx as never, monthly, payments, cash };
}

const paymentMethodDelegate = (prisma as unknown as { formaPagamento: { findUnique: (args: unknown) => Promise<unknown> } }).formaPagamento;
const originalFindMethod = paymentMethodDelegate.findUnique;
test.before(() => { paymentMethodDelegate.findUnique = async () => ({ nome: "PIX", ativo: true, aplicacao: "RECEBIMENTO" }); });
test.after(() => { paymentMethodDelegate.findUnique = originalFindMethod; });

function input(overrides: Record<string, unknown> = {}) {
  return {
    mensalidadeId: "monthly-1", valor: "110.00", formaPagamento: "PIX", dataPagamento: "2026-10-18",
    idempotencyKey: "payment-key-0001", actor: { id: "user-1", name: "Admin" }, ...overrides
  };
}

test("exact payment creates Pagamento and Caixa with the received value and closes monthly", async () => {
  const fixture = fakeTransaction();
  const result = await registerMonthlyPayment(input(), { tx: fixture.tx });
  assert.equal(fixture.payments.length, 1);
  assert.equal(Number(fixture.payments[0]?.valor), 110);
  assert.equal(fixture.cash.length, 1);
  assert.equal(Number(fixture.cash[0]?.valor), 110);
  assert.equal(result.monthly.status, MensalidadeStatus.PAGO);
});

test("negotiated value preserves original and Caixa receives only Pagamento.valor", async () => {
  const fixture = fakeTransaction();
  const result = await registerMonthlyPayment(input({ valor: "100", valorFinal: "100", motivoAjuste: "Desconto acordado" }), { tx: fixture.tx });
  assert.equal(Number(fixture.monthly.valor), 110);
  assert.equal(Number(fixture.monthly.valorFinal), 100);
  assert.equal(Number(fixture.payments[0]?.valor), 100);
  assert.equal(Number(fixture.cash[0]?.valor), 100);
  assert.equal(result.monthly.status, MensalidadeStatus.PAGO);
});

test("multiple partial payments preserve balance and create one cash entry per payment", async () => {
  const fixture = fakeTransaction();
  const first = await registerMonthlyPayment(input({ valor: "60", valorFinal: "100", motivoAjuste: "Desconto", idempotencyKey: "partial-key-0001" }), { tx: fixture.tx });
  assert.equal(first.monthly.status, MensalidadeStatus.PARCIAL);
  assert.equal(Number(first.amounts.balance), 40);
  const second = await registerMonthlyPayment(input({ valor: "40", valorFinal: "100", motivoAjuste: "Desconto", idempotencyKey: "partial-key-0002" }), { tx: fixture.tx });
  assert.equal(second.monthly.status, MensalidadeStatus.PAGO);
  assert.equal(fixture.payments.length, 2);
  assert.equal(fixture.cash.length, 2);
  assert.equal(fixture.cash.reduce((sum, item) => sum + Number(item.valor), 0), 100);
});

test("overpayment, final below paid and adjustment without reason write nothing", async () => {
  const over = fakeTransaction(100);
  await assert.rejects(() => registerMonthlyPayment(input({ valor: "101" }), { tx: over.tx }), MonthlyPaymentError);
  assert.equal(over.payments.length, 0);
  assert.equal(over.cash.length, 0);

  const noReason = fakeTransaction();
  await assert.rejects(() => registerMonthlyPayment(input({ valor: "100", valorFinal: "100" }), { tx: noReason.tx }), /Motivo/);
  assert.equal(noReason.payments.length, 0);

  const below = fakeTransaction();
  await registerMonthlyPayment(input({ valor: "60", idempotencyKey: "below-key-0001" }), { tx: below.tx });
  await assert.rejects(() => registerMonthlyPayment(input({ valor: "1", valorFinal: "50", motivoAjuste: "Inválido", idempotencyKey: "below-key-0002" }), { tx: below.tx }), /menor que o total já pago/);
  assert.equal(below.payments.length, 1);
});

test("idempotency returns the existing payment without duplicating Caixa", async () => {
  const fixture = fakeTransaction();
  await registerMonthlyPayment(input(), { tx: fixture.tx });
  const repeated = await registerMonthlyPayment(input(), { tx: fixture.tx });
  assert.equal(repeated.alreadyProcessed, true);
  assert.equal(fixture.payments.length, 1);
  assert.equal(fixture.cash.length, 1);
});

test("historical paid monthly is rejected without reconstructing payment or cash", async () => {
  const fixture = fakeTransaction();
  fixture.monthly.status = MensalidadeStatus.PAGO;
  await assert.rejects(() => registerMonthlyPayment(input(), { tx: fixture.tx }), /já está paga/);
  assert.equal(fixture.payments.length, 0);
  assert.equal(fixture.cash.length, 0);
});

test("initial monthly status follows the civil due date", () => {
  const reference = new Date("2026-10-18T12:00:00-03:00");
  assert.equal(initialMonthlyStatus(new Date("2026-10-17T00:00:00Z"), reference), MensalidadeStatus.ATRASADO);
  assert.equal(initialMonthlyStatus(new Date("2026-10-18T00:00:00Z"), reference), MensalidadeStatus.PENDENTE);
  assert.equal(initialMonthlyStatus(new Date("2026-10-19T00:00:00Z"), reference), MensalidadeStatus.PENDENTE);
});

test("migration and transaction strategy are additive, locked and serializable", () => {
  const migration = readFileSync("prisma/migrations/0008_monthly_payment_adjustments/migration.sql", "utf8");
  const service = readFileSync("lib/services/monthly-payments.ts", "utf8");
  assert.doesNotMatch(migration, /\b(?:UPDATE|DELETE|INSERT|TRUNCATE)\b/i);
  assert.match(service, /FOR UPDATE/);
  assert.match(service, /TransactionIsolationLevel\.Serializable/);
  assert.match(service, /AUTO_PAGAMENTO_PREFIX/);
});

test("new enrollment uses one deterministic student/monthly and central payment flow", () => {
  const route = readFileSync("app/api/alunos/route.ts", "utf8");
  assert.match(route, /student_\$\{createHash/);
  assert.match(route, /alunoId_competencia/);
  assert.match(route, /initialMonthlyStatus\(vencimentoMensalidade\)/);
  assert.match(route, /if \(payNow\)[\s\S]*registerMonthlyPayment/);
  assert.match(route, /update: \{\}/);
  assert.match(route, /payNow && !hasCapability\(auth\.role, "finance\.monthlies\.manage"\)/);
  assert.match(route, /if \(payNow\)[\s\S]*registerMonthlyPayment[\s\S]*\}, \{ tx \}\)/);
});

test("reporting uses confirmed receipts and preserves only legacy paid fees as fallback", () => {
  const dashboard = readFileSync("lib/services/dashboard.ts", "utf8");
  const columns = readFileSync("app/api/mensalidades/colunas/route.ts", "utf8");
  assert.match(dashboard, /prisma\.pagamento\.findMany/);
  assert.match(dashboard, /pagamentos: \{ none: \{ status: "CONFIRMADO" \} \}/);
  assert.match(columns, /pagamentosNoMes/);
  assert.match(columns, /mensalidadesLegadasNoMes/);
  assert.match(columns, /item\.saldo/);
});

test("payment flow rejects direct paid writes and protects concurrent balance", () => {
  const monthlyRoute = readFileSync("app/api/mensalidades/[id]/route.ts", "utf8");
  const paymentService = readFileSync("lib/services/monthly-payments.ts", "utf8");
  assert.match(monthlyRoute, /Use o fluxo de pagamento/);
  assert.match(paymentService, /SELECT "id" FROM "Mensalidade"[\s\S]*FOR UPDATE/);
  assert.match(paymentService, /amount\.gt\(balanceBefore\)/);
  assert.match(paymentService, /P2034/);
});
