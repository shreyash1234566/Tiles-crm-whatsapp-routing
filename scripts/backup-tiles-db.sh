#!/usr/bin/env bash
# Create an immutable point-in-time PostgreSQL dump for the isolated Tiles CRM.
# Run this on the VPS host from cron; it deliberately never touches the
# furniture project or removes old backups.
set -euo pipefail

DEPLOY_DIR="${TILES_DEPLOY_DIR:-/opt/tiles-crm}"
REPO_DIR="${DEPLOY_DIR}/repo"
ENV_FILE="${DEPLOY_DIR}/.env.prod"
BACKUP_DIR="${TILES_BACKUP_DIR:-${DEPLOY_DIR}/backups}"
COMPOSE_PROJECT="${TILES_COMPOSE_PROJECT:-repo}"
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="${BACKUP_DIR}/tiles-crm-${timestamp}.dump"
temporary="${target}.partial"
compose=(docker compose --project-name "${COMPOSE_PROJECT}" -f "${REPO_DIR}/docker-compose.yml" -f "${REPO_DIR}/docker-compose.prod.yml" --env-file "${ENV_FILE}")

"${compose[@]}" exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "${temporary}"
[[ -s "${temporary}" ]] || { rm -f "${temporary}"; echo 'pg_dump returned an empty backup' >&2; exit 1; }
pg_restore -l "${temporary}" >/dev/null
mv "${temporary}" "${target}"
echo "Tiles CRM backup created: ${target}"
