-- Migration aditiva: nenhum lançamento histórico recebe backfill de origem.
CREATE TYPE "MovimentacaoCaixaOrigem" AS ENUM (
  'MANUAL',
  'PAGAMENTO_MENSALIDADE',
  'DESPESA',
  'PEDIDO',
  'IMPORTACAO',
  'AJUSTE'
);

ALTER TYPE "DespesaStatus" ADD VALUE IF NOT EXISTS 'ATRASADO';

ALTER TABLE "MovimentacaoCaixa"
ADD COLUMN "origem" "MovimentacaoCaixaOrigem",
ADD COLUMN "despesaAcademiaId" TEXT,
ADD COLUMN "pedidoProdutoId" TEXT;

CREATE UNIQUE INDEX "MovimentacaoCaixa_despesaAcademiaId_key"
ON "MovimentacaoCaixa"("despesaAcademiaId");

CREATE UNIQUE INDEX "MovimentacaoCaixa_pedidoProdutoId_key"
ON "MovimentacaoCaixa"("pedidoProdutoId");

CREATE INDEX "MovimentacaoCaixa_origem_idx"
ON "MovimentacaoCaixa"("origem");

ALTER TABLE "MovimentacaoCaixa"
ADD CONSTRAINT "MovimentacaoCaixa_despesaAcademiaId_fkey"
FOREIGN KEY ("despesaAcademiaId") REFERENCES "DespesaAcademia"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MovimentacaoCaixa"
ADD CONSTRAINT "MovimentacaoCaixa_pedidoProdutoId_fkey"
FOREIGN KEY ("pedidoProdutoId") REFERENCES "PedidoProduto"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
