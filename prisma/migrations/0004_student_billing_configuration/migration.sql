-- Student enrollment history may be unknown without implying a billing start date.
ALTER TABLE "Aluno"
  ALTER COLUMN "dataInicio" DROP NOT NULL,
  ADD COLUMN "valorMensal" DECIMAL(10,2),
  ADD COLUMN "usarValorPadrao" BOOLEAN NOT NULL DEFAULT true;

-- A modality may exist without an approved standard price.
ALTER TABLE "Modalidade"
  ALTER COLUMN "valorPadrao" DROP NOT NULL;
