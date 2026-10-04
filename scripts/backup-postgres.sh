#!/usr/bin/env bash
set -euo pipefail

export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"
umask 077

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "$script_dir/.." && pwd)"
cd "$project_dir"

if ! command -v node >/dev/null 2>&1; then
  echo "Comando obrigatorio ausente: node" >&2
  exit 3
fi

read_backup_env() {
  node "$script_dir/read-postgres-backup-env.mjs" "$1"
}

backup_dir="${POSTGRES_BACKUP_DIR:-$(read_backup_env POSTGRES_BACKUP_DIR)}"
retention_days="${POSTGRES_BACKUP_RETENTION_DAYS:-$(read_backup_env POSTGRES_BACKUP_RETENTION_DAYS)}"
pg_host="${PGHOST:-$(read_backup_env PGHOST)}"
pg_port="${PGPORT:-$(read_backup_env PGPORT)}"
pg_user="${PGUSER:-$(read_backup_env PGUSER)}"
pg_database="${PGDATABASE:-$(read_backup_env PGDATABASE)}"
pgpass_file="${PGPASSFILE:-$(read_backup_env PGPASSFILE)}"

backup_dir="${backup_dir:-/var/lib/controle-academia/database-backups}"
retention_days="${retention_days:-30}"
pg_host="${pg_host:-127.0.0.1}"
pg_port="${pg_port:-5432}"
pg_user="${pg_user:-controle_academia_app}"
pg_database="${pg_database:-controle_academia}"
export PGPASSFILE="${pgpass_file:-/var/lib/controle-academia/.pgpass}"

if [[ "$backup_dir" != /* || "$backup_dir" == "/" ]]; then
  echo "POSTGRES_BACKUP_DIR deve ser um caminho absoluto seguro." >&2
  exit 2
fi

if [[ ! "$retention_days" =~ ^[0-9]+$ ]] || (( retention_days < 1 || retention_days > 3650 )); then
  echo "POSTGRES_BACKUP_RETENTION_DAYS deve estar entre 1 e 3650." >&2
  exit 2
fi

for command_name in pg_dump pg_restore sha256sum; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Comando obrigatorio ausente: $command_name" >&2
    exit 3
  fi
done

if [[ ! -f "$PGPASSFILE" ]]; then
  echo "PGPASSFILE protegido nao encontrado." >&2
  exit 4
fi

if [[ "$(stat -c '%a' "$PGPASSFILE")" != "600" ]]; then
  echo "PGPASSFILE deve possuir permissao 600." >&2
  exit 4
fi

mkdir -p -- "$backup_dir"

if [[ "${1:-}" == "--dry-run" ]]; then
  expired_count="$({ find "$backup_dir" -maxdepth 1 -type f \( -name 'controle-academia-*.dump' -o -name 'controle-academia-*.dump.sha256' \) -mtime "+$retention_days" -print || true; } | wc -l | tr -d ' ')"
  echo "Backup PostgreSQL dry-run: configuracao valida; arquivos expirados=$expired_count"
  exit 0
fi

timestamp="$(date '+%Y-%m-%dT%H%M%S')"
final_file="$backup_dir/controle-academia-$timestamp.dump"
partial_file="$final_file.partial"

if [[ -e "$final_file" || -e "$partial_file" ]]; then
  echo "Arquivo de backup ja existe para este timestamp." >&2
  exit 5
fi

cleanup_partial() {
  if [[ -n "${partial_file:-}" && -f "$partial_file" ]]; then
    rm -f -- "$partial_file"
  fi
}
trap cleanup_partial EXIT

pg_dump \
  --host="$pg_host" \
  --port="$pg_port" \
  --username="$pg_user" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$partial_file" \
  "$pg_database"

pg_restore --list "$partial_file" >/dev/null
mv -- "$partial_file" "$final_file"
sha256sum "$final_file" > "$final_file.sha256"

find "$backup_dir" -maxdepth 1 -type f \
  \( -name 'controle-academia-*.dump' -o -name 'controle-academia-*.dump.sha256' \) \
  -mtime "+$retention_days" -delete

trap - EXIT
echo "Backup PostgreSQL concluido e validado: $(basename "$final_file")"
