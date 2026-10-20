import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("migration de origem do caixa é aditiva e sem backfill", () => {
  const sql = read("prisma/migrations/0012_cash_movement_origins/migration.sql");
  assert.match(sql, /CREATE TYPE "MovimentacaoCaixaOrigem"/);
  assert.match(sql, /ADD COLUMN "origem"/);
  assert.match(sql, /ADD COLUMN "despesaAcademiaId"/);
  assert.match(sql, /ADD COLUMN "pedidoProdutoId"/);
  assert.match(sql, /ON DELETE RESTRICT/g);
  assert.doesNotMatch(sql, /^\s*(?:UPDATE|DELETE FROM|INSERT INTO|TRUNCATE|DROP)\b/im);
});

test("novas origens recebem vínculos estruturais", () => {
  const manual = read("app/api/caixa/route.ts");
  const payments = read("lib/services/monthly-payments.ts");
  const automatic = read("lib/services/caixa.ts");
  const expenses = read("lib/services/expense-payments.ts");
  assert.match(manual, /MovimentacaoCaixaOrigem\.MANUAL/);
  assert.match(payments, /MovimentacaoCaixaOrigem\.PAGAMENTO_MENSALIDADE/);
  assert.match(payments, /pagamentoId: payment\.id/);
  assert.match(payments, /mensalidadeId: monthly\.id/);
  assert.match(automatic, /MovimentacaoCaixaOrigem\.PEDIDO/);
  assert.match(automatic, /pedidoProdutoId: pedido\.id/);
  assert.match(expenses, /MovimentacaoCaixaOrigem\.DESPESA/);
  assert.match(expenses, /despesaAcademiaId: expense\.id/);
});

test("dispatcher permite somente origens seguras e exige motivo", () => {
  const service = read("lib/services/cash-deletion.ts");
  assert.match(service, /case MovimentacaoCaixaOrigem\.MANUAL/);
  assert.match(service, /case MovimentacaoCaixaOrigem\.AJUSTE/);
  assert.match(service, /case MovimentacaoCaixaOrigem\.PAGAMENTO_MENSALIDADE/);
  assert.match(service, /case MovimentacaoCaixaOrigem\.DESPESA/);
  assert.match(service, /case MovimentacaoCaixaOrigem\.PEDIDO/);
  assert.match(service, /case MovimentacaoCaixaOrigem\.IMPORTACAO/);
  assert.match(service, /Motivo é obrigatório/);
  assert.match(service, /anterior ao rastreamento de origem/);
  assert.doesNotMatch(service, /descricao.*(?:find|where)|valor.*(?:find|where)|observacao.*(?:find|where)/i);
});

test("pagamentos são revertidos atomicamente e mensalidade é recalculada", () => {
  const service = read("lib/services/cash-deletion.ts");
  assert.match(service, /FOR UPDATE/);
  assert.match(service, /TransactionIsolationLevel\.Serializable/);
  assert.match(service, /tx\.movimentacaoCaixa\.delete/);
  assert.match(service, /tx\.pagamento\.delete/);
  assert.match(service, /MensalidadeStatus\.PAGO/);
  assert.match(service, /MensalidadeStatus\.ATRASADO/);
  assert.match(service, /MensalidadeStatus\.PENDENTE/);
  assert.match(service, /monthly\.valorFinal \?\? monthly\.valor/);
  assert.match(service, /filter\(\(item\) => item\.id !== payment\.id\)/);
});

test("despesa e pedido permanecem existentes ao desfazer a baixa", () => {
  const service = read("lib/services/cash-deletion.ts");
  assert.match(service, /despesaAcademia\.update/);
  assert.match(service, /valorPago: 0/);
  assert.match(service, /DespesaStatus\.ATRASADO/);
  assert.match(service, /DespesaStatus\.PENDENTE/);
  assert.match(service, /pedidoProduto\.update/);
  assert.match(service, /data: \{ pago: 0 \}/);
  assert.doesNotMatch(service, /despesaAcademia\.delete/);
  assert.doesNotMatch(service, /pedidoProduto\.delete/);
});

test("legado usa apenas ids determinísticos autorizados", () => {
  const service = read("lib/services/cash-deletion.ts");
  assert.match(service, /auto_pagamento_/);
  assert.match(service, /auto_mensalidade_/);
  assert.match(service, /auto_pedido_/);
});

test("auditoria e interface contextual substituem o bloqueio genérico", () => {
  const service = read("lib/services/cash-deletion.ts");
  const route = read("app/api/caixa/[id]/route.ts");
  const page = read("app/caixa/page.tsx");
  const crud = read("components/forms/crud-module.tsx");
  assert.match(service, /logAudit/g);
  assert.match(route, /finance\.cash\.manage/);
  assert.match(page, /Desfazer pagamento da despesa/);
  assert.match(page, /Desfazer pagamento da venda/);
  assert.match(page, /Excluir lançamento/);
  assert.match(crud, /deleteReasonRequired/);
  assert.doesNotMatch(route, /ajuste compensatório/i);
});

test("exclusão administrativa de legado exige intenção forte e capability exclusiva", () => {
  const service = read("lib/services/cash-deletion.ts");
  const route = read("app/api/caixa/[id]/route.ts");
  const page = read("app/caixa/page.tsx");
  const crud = read("components/forms/crud-module.tsx");
  const capabilities = read("lib/auth/capabilities.ts");
  assert.match(service, /DELETE_LEGACY_CASH/);
  assert.match(service, /origemAnterior: null/);
  assert.match(service, /removidoSomenteDoCaixa: true/);
  assert.match(route, /forceLegacy/);
  assert.match(route, /finance\.cash\.legacy\.delete/);
  assert.match(route, /Confirmação explícita é obrigatória/);
  assert.match(page, /legacyDeleteCapability="finance\.cash\.legacy\.delete"/);
  assert.match(crud, /Entendo que somente o lançamento do Caixa será removido/);
  assert.match(crud, /Motivo da exclusão/);
  assert.match(capabilities, /"finance\.cash\.legacy\.delete"/);
  const financeiroBlock = capabilities.match(/FINANCEIRO:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
  assert.doesNotMatch(financeiroBlock, /finance\.cash\.legacy\.delete/);
});
