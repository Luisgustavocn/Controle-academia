import assert from "node:assert/strict";
import test from "node:test";
import { buildFinanceSeriesFromRows } from "../lib/services/dashboard";

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
