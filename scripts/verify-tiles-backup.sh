#!/usr/bin/env bash
# Verify, but never create/delete, Tiles CRM backups. Run from the VPS host
# after the actual encrypted pg_dump job has written to /opt/tiles-crm/backups.
set -euo pipefail

BACKUP_DIR="${TILES_BACKUP_DIR:-/opt/tiles-crm/backups}"
MAX_AGE_HOURS="${TILES_BACKUP_MAX_AGE_HOURS:-26}"
latest="$(find "${BACKUP_DIR}" -maxdepth 1 -type f \( -name '*.dump' -o -name '*.sql' -o -name '*.sql.gz' \) -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2-)"
[[ -n "${latest}" ]] || { echo "No Tiles CRM backup found in ${BACKUP_DIR}" >&2; exit 1; }
age_seconds=$(( $(date +%s) - $(stat -c %Y "${latest}") ))
(( age_seconds <= MAX_AGE_HOURS * 3600 )) || { echo "Latest backup is older than ${MAX_AGE_HOURS}h: ${latest}" >&2; exit 1; }
[[ -s "${latest}" ]] || { echo "Latest backup is empty: ${latest}" >&2; exit 1; }
case "${latest}" in
  *.dump) pg_restore -l "${latest}" >/dev/null ;;
  *.sql.gz) gzip -t "${latest}" ;;
esac
echo "Tiles backup verified: ${latest}"
