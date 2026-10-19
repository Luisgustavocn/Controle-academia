-- Migration aditiva: nenhum aluno existente é alterado.
ALTER TABLE "Aluno"
ADD COLUMN "arquivadoEm" TIMESTAMP(3),
ADD COLUMN "arquivadoPorId" TEXT;

CREATE INDEX "Aluno_arquivadoEm_idx" ON "Aluno"("arquivadoEm");

ALTER TABLE "Aluno"
ADD CONSTRAINT "Aluno_arquivadoPorId_fkey"
FOREIGN KEY ("arquivadoPorId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
