#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/opt/postgresql@16/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

for command_name in psql pg_dump pg_restore; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Comando obrigatório ausente: $command_name" >&2
    exit 3
  fi
done

: "${ATTENDANCE_TEST_DATABASE_URL:?Defina ATTENDANCE_TEST_DATABASE_URL para um PostgreSQL temporario}"

database_name="$(psql "$ATTENDANCE_TEST_DATABASE_URL" -X -Atc 'SELECT current_database()')"
if [[ "$database_name" != "attendance_test" ]]; then
  echo "Recusado: o banco temporario deve se chamar attendance_test" >&2
  exit 2
fi

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
base_migration="$project_dir/prisma/migrations/0001_init/migration.sql"
cleanup_migration="$project_dir/prisma/migrations/0002_remove_despesa_familia/migration.sql"
attendance_migration="$project_dir/prisma/migrations/0003_attendance_civil_date/migration.sql"
backup_file="$(mktemp "${TMPDIR:-/tmp}/attendance-migration.XXXXXX.dump")"
error_file="$(mktemp "${TMPDIR:-/tmp}/attendance-migration-error.XXXXXX.log")"
trap 'rm -f -- "$backup_file" "$error_file"' EXIT

reset_database() {
  psql "$ATTENDANCE_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
  psql "$ATTENDANCE_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -f "$base_migration"
  psql "$ATTENDANCE_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -f "$cleanup_migration"
}

insert_student() {
  psql "$ATTENDANCE_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -c \
    "INSERT INTO \"Aluno\" (id, \"nomeCompleto\", telefone, \"vencimentoDia\", status, \"dataInicio\", \"createdAt\", \"updatedAt\") VALUES ('$1', '$1', '$1', 10, 'ATIVO', TIMESTAMP '2026-01-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);"
}

expect_migration_failure() {
  local expected="$1"
  if psql "$ATTENDANCE_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -f "$attendance_migration" >"$error_file" 2>&1; then
    echo "Migration deveria ter falhado: $expected" >&2
    exit 3
  fi
  if ! grep -q "$expected" "$error_file"; then
    echo "Mensagem de bloqueio inesperada para: $expected" >&2
    tail -n 20 "$error_file" >&2
    exit 4
  fi
}

# Empty table.
reset_database
psql "$ATTENDANCE_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -f "$attendance_migration"

# Compatible data: NULL, empty time, several students in one day and one student on several days.
reset_database
insert_student student_a
insert_student student_b
psql "$ATTENDANCE_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -q <<'SQL'
INSERT INTO "Presenca" (id, "alunoId", data, horario, "tipoAula", presente, "createdAt") VALUES
  ('p1', 'student_a', TIMESTAMP '2026-10-05 00:00:00', NULL, 'musculacao', true, CURRENT_TIMESTAMP),
  ('p2', 'student_b', TIMESTAMP '2026-10-05 00:00:00', '', 'musculacao', true, CURRENT_TIMESTAMP),
  ('p3', 'student_a', TIMESTAMP '2026-10-06 00:00:00', '07:00', 'personal', true, CURRENT_TIMESTAMP);
SQL
psql "$ATTENDANCE_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -f "$attendance_migration"
test "$(psql "$ATTENDANCE_TEST_DATABASE_URL" -X -Atc "SELECT data_type FROM information_schema.columns WHERE table_name='Presenca' AND column_name='data'")" = "date"
test "$(psql "$ATTENDANCE_TEST_DATABASE_URL" -X -Atc 'SELECT count(*) FROM "Presenca" WHERE horario IS NULL')" = "2"
test "$(psql "$ATTENDANCE_TEST_DATABASE_URL" -X -Atc "SELECT count(*) FROM pg_indexes WHERE tablename='Presenca' AND indexname IN ('Presenca_data_idx','Presenca_alunoId_data_key')")" = "2"

# Backup and restore in the isolated database.
pg_dump "$ATTENDANCE_TEST_DATABASE_URL" --format=custom --no-owner --no-acl --file="$backup_file"
pg_restore --list "$backup_file" >/dev/null
psql "$ATTENDANCE_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
pg_restore --dbname="$ATTENDANCE_TEST_DATABASE_URL" --no-owner --no-acl "$backup_file"
test "$(psql "$ATTENDANCE_TEST_DATABASE_URL" -X -Atc 'SELECT count(*) FROM "Presenca"')" = "3"

# Duplicate student/day.
reset_database
insert_student duplicate_student
psql "$ATTENDANCE_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -c \
  "INSERT INTO \"Presenca\" (id, \"alunoId\", data, horario, \"tipoAula\", presente, \"createdAt\") VALUES ('d1','duplicate_student',TIMESTAMP '2026-10-05',NULL,'musculacao',true,CURRENT_TIMESTAMP),('d2','duplicate_student',TIMESTAMP '2026-10-05','18:00','personal',true,CURRENT_TIMESTAMP);"
expect_migration_failure "duplicate alunoId/data"

# Unexpected false record.
reset_database
insert_student false_student
psql "$ATTENDANCE_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -c \
  "INSERT INTO \"Presenca\" (id, \"alunoId\", data, horario, \"tipoAula\", presente, \"createdAt\") VALUES ('f1','false_student',TIMESTAMP '2026-10-05',NULL,'musculacao',false,CURRENT_TIMESTAMP);"
expect_migration_failure "presente=false"

# Ambiguous timestamp.
reset_database
insert_student time_student
psql "$ATTENDANCE_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -c \
  "INSERT INTO \"Presenca\" (id, \"alunoId\", data, horario, \"tipoAula\", presente, \"createdAt\") VALUES ('t1','time_student',TIMESTAMP '2026-10-05 00:30:00',NULL,'musculacao',true,CURRENT_TIMESTAMP);"
expect_migration_failure "non-midnight time"

# Leave a fully migrated database for domain/concurrency integration tests.
reset_database
psql "$ATTENDANCE_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -f "$attendance_migration"

echo "Attendance migration scenarios and restore: OK"
