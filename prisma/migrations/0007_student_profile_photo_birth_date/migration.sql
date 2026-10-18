-- Migration aditiva: nenhum aluno existente e alterado ou preenchido.
ALTER TABLE "Aluno"
ADD COLUMN "dataNascimento" DATE,
ADD COLUMN "fotoPath" TEXT;
