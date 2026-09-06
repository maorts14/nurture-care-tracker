#!/usr/bin/env sh
set -eu

cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
set -a
. ./.env
set +a

backup_dir="${BACKUP_DIR:-/opt/nurture/backups}"
timestamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
mkdir -p "$backup_dir"

docker compose --env-file .env -f docker-compose.prod.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$backup_dir/nurture-$timestamp.sql.gz"

find "$backup_dir" -type f -name 'nurture-*.sql.gz' -mtime +14 -delete
