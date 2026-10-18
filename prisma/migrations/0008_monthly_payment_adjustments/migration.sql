-- Estrutura aditiva: nenhum valor historico e recalculado ou preenchido.
ALTER TABLE "Mensalidade"
ADD COLUMN "valorFinal" DECIMAL(10,2),
ADD COLUMN "motivoAjuste" TEXT;
