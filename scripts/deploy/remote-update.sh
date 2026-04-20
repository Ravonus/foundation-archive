#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose_file="$repo_root/deploy/docker-compose.yml"
env_file="$repo_root/deploy/.env.production"

if [[ ! -f "$env_file" ]]; then
  echo "Missing deploy env file: $env_file" >&2
  exit 1
fi

compose() {
  docker compose \
    --project-name foundation-archive \
    --env-file "$env_file" \
    -f "$compose_file" \
    "$@"
}

cd "$repo_root"

compose config >/dev/null
compose run --rm storage-check
compose build web archiver
compose up -d postgres
compose run --rm db-init
compose up -d kubo archiver socket worker web migrate-kubo-pins
compose ps
