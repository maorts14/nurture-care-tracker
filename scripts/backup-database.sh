#!/usr/bin/env bash
set -euo pipefail
umask 077

cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
set -a
. ./.env
set +a

backup_dir="${BACKUP_DIR:-/opt/nurture/backups}"
timestamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
mkdir -p "$backup_dir"

backup_file="$backup_dir/nurture-$timestamp.sql.gz.enc"
temporary_file="$backup_file.part"
trap 'rm -f "$temporary_file"' EXIT

docker compose --env-file .env -f docker-compose.prod.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip \
  | docker compose --env-file .env -f docker-compose.prod.yml exec -T api \
    node server/backup-crypto.mjs encrypt > "$temporary_file"

mv "$temporary_file" "$backup_file"
trap - EXIT

find "$backup_dir" -type f \( -name 'nurture-*.sql.gz' -o -name 'nurture-*.sql.gz.enc' \) -mtime +14 -delete
