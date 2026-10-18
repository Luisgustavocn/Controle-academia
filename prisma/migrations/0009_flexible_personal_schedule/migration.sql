-- Migration aditiva: registros legados permanecem inalterados.
ALTER TABLE "AgendaPersonal"
ADD COLUMN "data" DATE,
ADD COLUMN "horarioFim" TEXT;

CREATE INDEX "AgendaPersonal_professor_data_ativo_idx"
ON "AgendaPersonal"("professor", "data", "ativo");
