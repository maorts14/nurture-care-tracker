#!/usr/bin/env sh
set -eu

cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
git pull --ff-only
docker compose --env-file .env -f docker-compose.prod.yml up -d --build --remove-orphans
docker compose --env-file .env -f docker-compose.prod.yml ps
