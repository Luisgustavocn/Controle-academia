-- Estrutura apenas: nenhum valor financeiro historico e transformado.
CREATE TYPE "FormaPagamentoAplicacao" AS ENUM ('RECEBIMENTO', 'DESPESA', 'AMBOS');

ALTER TABLE "DespesaAcademia" ADD COLUMN "formaPagamento" TEXT;

CREATE TABLE "FormaPagamento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeNormalizado" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "aplicacao" "FormaPagamentoAplicacao" NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormaPagamento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FormaPagamento_nomeNormalizado_key" ON "FormaPagamento"("nomeNormalizado");
CREATE INDEX "FormaPagamento_ativo_aplicacao_ordem_idx" ON "FormaPagamento"("ativo", "aplicacao", "ordem");
