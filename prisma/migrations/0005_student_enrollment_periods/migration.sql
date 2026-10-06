-- The student is the permanent person; enrollment periods are immutable historical links.
CREATE TABLE "PeriodoMatricula" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "dataInicio" DATE,
    "dataSaida" DATE,
    "modalidadeId" TEXT,
    "valorMensal" DECIMAL(10,2),
    "usarValorPadrao" BOOLEAN NOT NULL DEFAULT true,
    "diaVencimento" INTEGER NOT NULL,
    "motivoSaida" TEXT,
    "createdBy" TEXT,
    "encerradoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PeriodoMatricula_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PeriodoMatricula_alunoId_dataInicio_dataSaida_idx"
ON "PeriodoMatricula"("alunoId", "dataInicio", "dataSaida");
CREATE INDEX "PeriodoMatricula_dataSaida_idx" ON "PeriodoMatricula"("dataSaida");

-- PostgreSQL partial uniqueness prevents two simultaneously open links for one student.
CREATE UNIQUE INDEX "PeriodoMatricula_um_periodo_aberto_por_aluno"
ON "PeriodoMatricula"("alunoId") WHERE "dataSaida" IS NULL;

ALTER TABLE "PeriodoMatricula"
ADD CONSTRAINT "PeriodoMatricula_alunoId_fkey"
FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PeriodoMatricula"
ADD CONSTRAINT "PeriodoMatricula_modalidadeId_fkey"
FOREIGN KEY ("modalidadeId") REFERENCES "Modalidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill only facts already persisted. NULL remains an explicit unknown historical start.
INSERT INTO "PeriodoMatricula" (
  "id", "alunoId", "dataInicio", "dataSaida", "modalidadeId", "valorMensal",
  "usarValorPadrao", "diaVencimento", "createdAt", "updatedAt"
)
SELECT
  'backfill_' || "id", "id", "dataInicio"::date, "dataSaidaCancelamento"::date,
  "modalidadeId", "valorMensal", "usarValorPadrao", "vencimentoDia", "createdAt", CURRENT_TIMESTAMP
FROM "Aluno"
WHERE "dataInicio" IS NOT NULL
   OR "dataSaidaCancelamento" IS NOT NULL
   OR "status" = 'ATIVO';
