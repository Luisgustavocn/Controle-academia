-- Presenca.data is a civil date. Existing timestamp values are intentionally
-- converted with data::date, without applying a timezone offset.
BEGIN;

-- Keep the checks and schema conversion atomic; no writer can create a new
-- incompatible row between the preflight block and the unique index.
LOCK TABLE "Presenca" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Presenca"
    WHERE "presente" = false
  ) THEN
    RAISE EXCEPTION 'Attendance migration blocked: presente=false records require manual review';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Presenca"
    WHERE "data"::time <> TIME '00:00:00'
  ) THEN
    RAISE EXCEPTION 'Attendance migration blocked: data values with a non-midnight time require manual review';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Presenca"
    GROUP BY "alunoId", "data"::date
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Attendance migration blocked: duplicate alunoId/data records require manual review';
  END IF;
END $$;

DROP INDEX "Presenca_alunoId_data_horario_key";

UPDATE "Presenca"
SET "horario" = NULL
WHERE BTRIM("horario") = '';

ALTER TABLE "Presenca"
ALTER COLUMN "data" TYPE DATE USING "data"::date;

CREATE UNIQUE INDEX "Presenca_alunoId_data_key"
ON "Presenca"("alunoId", "data");

COMMIT;
