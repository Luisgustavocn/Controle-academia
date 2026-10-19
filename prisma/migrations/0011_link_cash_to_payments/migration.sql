-- Migration aditiva: vínculos históricos permanecem nulos e não recebem backfill.
ALTER TABLE "MovimentacaoCaixa"
ADD COLUMN "pagamentoId" TEXT,
ADD COLUMN "mensalidadeId" TEXT;

CREATE UNIQUE INDEX "MovimentacaoCaixa_pagamentoId_key" ON "MovimentacaoCaixa"("pagamentoId");
CREATE INDEX "MovimentacaoCaixa_mensalidadeId_idx" ON "MovimentacaoCaixa"("mensalidadeId");

ALTER TABLE "MovimentacaoCaixa"
ADD CONSTRAINT "MovimentacaoCaixa_pagamentoId_fkey"
FOREIGN KEY ("pagamentoId") REFERENCES "Pagamento"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MovimentacaoCaixa"
ADD CONSTRAINT "MovimentacaoCaixa_mensalidadeId_fkey"
FOREIGN KEY ("mensalidadeId") REFERENCES "Mensalidade"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
