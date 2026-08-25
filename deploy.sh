#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Tiles CRM production deployment script
# =============================================================================
# Run on the VPS as a non-root deploy user (e.g. deploy) with Docker access.
# All secrets live in /opt/tiles-crm/.env.prod — NOT in the git repo.
#
# First-time setup:   ./deploy.sh --setup
# Subsequent deploys: ./deploy.sh
# With call-centre:   ./deploy.sh --callcentre
# =============================================================================
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
DEPLOY_DIR="/opt/tiles-crm"
REPO_DIR="${DEPLOY_DIR}/repo"
ENV_FILE="${DEPLOY_DIR}/.env.prod"
COMPOSE_BASE="${REPO_DIR}/docker-compose.yml"
COMPOSE_PROD="${REPO_DIR}/docker-compose.prod.yml"
GIT_REMOTE="origin"
GIT_BRANCH="main"

COMPOSE_CMD="docker compose -f ${COMPOSE_BASE} -f ${COMPOSE_PROD} --env-file ${ENV_FILE}"

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo "[$(date '+%H:%M:%S')] $*"; }
die()  { echo "[ERROR] $*" >&2; exit 1; }
hr()   { echo "─────────────────────────────────────────"; }

require_env_file() {
  [[ -f "${ENV_FILE}" ]] || die "Missing ${ENV_FILE}. Copy .env.prod.example and fill in real values."
}

# ── First-time setup ──────────────────────────────────────────────────────────
setup() {
  log "Running first-time setup..."
  hr

  # Create deployment directory structure
  mkdir -p "${DEPLOY_DIR}"/{backups,logs}
  chmod 700 "${DEPLOY_DIR}"

  # Clone repo if not present
  if [[ ! -d "${REPO_DIR}/.git" ]]; then
    log "Cloning repository..."
    git clone --branch "${GIT_BRANCH}" . "${REPO_DIR}" 2>/dev/null || \
      die "Adjust REPO_DIR or clone manually: git clone <your-repo-url> ${REPO_DIR}"
  fi

  log "Setup done. Now:"
  echo "  1. Copy .env.prod.example to ${ENV_FILE}"
  echo "  2. Fill in ALL values (generate secrets with: openssl rand -hex 32)"
  echo "  3. Point your domain DNS A record to this VPS IP"
  echo "  4. Run: ./deploy.sh"
  exit 0
}

# ── Pull latest code ──────────────────────────────────────────────────────────
pull_latest() {
  log "Pulling latest code from ${GIT_REMOTE}/${GIT_BRANCH}..."
  cd "${REPO_DIR}"
  git fetch "${GIT_REMOTE}"
  git reset --hard "${GIT_REMOTE}/${GIT_BRANCH}"
  log "Commit: $(git rev-parse --short HEAD) — $(git log -1 --format='%s')"
}

# ── Build CRM image ───────────────────────────────────────────────────────────
build_crm() {
  log "Building CRM app image..."
  ${COMPOSE_CMD} build --no-cache app
  log "Building ws-server image..."
  ${COMPOSE_CMD} build --no-cache ws-server
}

# ── Run database migrations (never reset) ─────────────────────────────────────
run_migrations() {
  log "Running CRM database migrations (safe: deploy only)..."
  ${COMPOSE_CMD} run --rm migrate
  log "Migrations complete."
}

# ── Start / update services ───────────────────────────────────────────────────
start_services() {
  local profiles=()
  [[ "${CALLCENTRE:-false}" == "true" ]] && profiles=(--profile callcentre)

  log "Starting infrastructure (Evolution DB, Evolution Redis, CRM DB, CRM Redis)..."
  ${COMPOSE_CMD} "${profiles[@]}" up -d \
    evolution-db evolution-redis db redis

  log "Waiting for DB health checks..."
  sleep 10

  log "Starting Evolution API..."
  ${COMPOSE_CMD} "${profiles[@]}" up -d evolution

  log "Running CRM migrations..."
  run_migrations

  log "Starting CRM app + ws-server..."
  # --no-deps: don't restart infra that's already healthy
  ${COMPOSE_CMD} "${profiles[@]}" up -d --no-deps app ws-server

  log "Starting Caddy..."
  ${COMPOSE_CMD} "${profiles[@]}" up -d --no-deps caddy

  [[ "${CALLCENTRE:-false}" == "true" ]] && {
    log "Starting ai-agent (call centre profile)..."
    ${COMPOSE_CMD} "${profiles[@]}" up -d --no-deps ai-agent
  }
}

# ── Health check ──────────────────────────────────────────────────────────────
health_check() {
  hr
  log "Checking service health..."

  # Load domain from env file
  # shellcheck disable=SC1090
  DOMAIN=$(grep '^DOMAIN=' "${ENV_FILE}" | cut -d= -f2 | tr -d '"')

  local ok=true

  check() {
    local label=$1; local url=$2
    if curl -fsS --max-time 10 "${url}" >/dev/null 2>&1; then
      log "  ✓ ${label}"
    else
      log "  ✗ ${label}  (${url})"
      ok=false
    fi
  }

  check "CRM HTTPS"         "https://${DOMAIN}/api/auth/me"
  check "Evolution API"     "http://localhost:8080/"   # internal check via docker exec or port-forward
  check "WebSocket health"  "http://localhost:3001/health"

  ${COMPOSE_CMD} ps
  hr

  [[ "${ok}" == "true" ]] && log "All checks passed." || log "Some checks failed — review logs above."
}

# ── Backup databases ──────────────────────────────────────────────────────────
backup() {
  local ts; ts=$(date '+%Y%m%d_%H%M%S')
  local backup_dir="${DEPLOY_DIR}/backups/${ts}"
  mkdir -p "${backup_dir}"

  log "Backing up CRM database..."
  ${COMPOSE_CMD} exec -T db \
    pg_dump -U "${POSTGRES_USER:-crm}" "${POSTGRES_DB:-tiles_crm}" \
    | gzip > "${backup_dir}/crm_db.sql.gz"

  log "Backing up Evolution database..."
  ${COMPOSE_CMD} exec -T evolution-db \
    pg_dump -U "${EVO_PG_USER:-evolution}" "${EVO_PG_DB:-evolutiondb}" \
    | gzip > "${backup_dir}/evolution_db.sql.gz"

  log "Backing up Evolution instance files..."
  ${COMPOSE_CMD} exec -T evolution \
    tar czf - /evolution/instances 2>/dev/null \
    > "${backup_dir}/evolution_instances.tar.gz" || true

  log "Backup complete: ${backup_dir}"
  # Keep last 7 daily backups
  find "${DEPLOY_DIR}/backups" -maxdepth 1 -type d | sort | head -n -7 | xargs -r rm -rf
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  local DO_SETUP=false
  local DO_BUILD=true
  CALLCENTRE=false

  for arg in "$@"; do
    case $arg in
      --setup)       DO_SETUP=true ;;
      --no-build)    DO_BUILD=false ;;
      --callcentre)  CALLCENTRE=true ;;
    esac
  done

  [[ "${DO_SETUP}" == "true" ]] && { setup; exit 0; }

  require_env_file

  hr
  log "Tiles CRM — Production Deploy"
  log "Commit:  $(cd "${REPO_DIR}" && git rev-parse --short HEAD 2>/dev/null || echo 'n/a')"
  log "Env:     ${ENV_FILE}"
  hr

  pull_latest
  [[ "${DO_BUILD}" == "true" ]] && build_crm
  start_services
  health_check

  log "Deploy finished."
}

main "$@"
