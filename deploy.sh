#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Tiles CRM production deployment script
# =============================================================================
# Run on the VPS as root or a deploy user with Docker access.
# All secrets live in /opt/tiles-crm/.env.prod — NOT in the git repo.
#
# First-time setup:   ./deploy.sh --setup
# Subsequent deploys: ./deploy.sh
# Rebuild images:     ./deploy.sh --build
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
GIT_REPO="https://github.com/shreyash1234566/Tiles-crm-whatsapp-routing.git"
COMPOSE_PROJECT="repo"

COMPOSE_CMD="docker compose --project-name ${COMPOSE_PROJECT} -f ${COMPOSE_BASE} -f ${COMPOSE_PROD} --env-file ${ENV_FILE}"
CRM_APP_HOST_PORT=4000
CRM_WS_HOST_PORT=4001

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo "[$(date '+%H:%M:%S')] $*"; }
die()  { echo "[ERROR] $*" >&2; exit 1; }
hr()   { echo "─────────────────────────────────────────"; }

require_env_file() {
  [[ -f "${ENV_FILE}" ]] || die "Missing ${ENV_FILE}. Copy .env.prod.example and fill in real values."
}

load_host_ports() {
  local value
  value="$(awk -F= '$1 == "CRM_APP_HOST_PORT" {gsub(/^[ \t"]+|[ \t"]+$/, "", $2); print $2; exit}' "${ENV_FILE}")"
  if [[ -n "${value}" ]]; then
    CRM_APP_HOST_PORT="${value}"
  fi
  value="$(awk -F= '$1 == "CRM_WS_HOST_PORT" {gsub(/^[ \t"]+|[ \t"]+$/, "", $2); print $2; exit}' "${ENV_FILE}")"
  if [[ -n "${value}" ]]; then
    CRM_WS_HOST_PORT="${value}"
  fi
}

# ── First-time setup ──────────────────────────────────────────────────────────
setup() {
  log "Running first-time setup..."
  hr
  mkdir -p "${DEPLOY_DIR}"/{backups,logs}
  chmod 700 "${DEPLOY_DIR}"

  if [[ ! -d "${REPO_DIR}/.git" ]]; then
    log "Cloning repository..."
    git clone --branch "${GIT_BRANCH}" "${GIT_REPO}" "${REPO_DIR}" 2>/dev/null || \
      die "Clone manually: git clone --branch ${GIT_BRANCH} ${GIT_REPO} ${REPO_DIR}"
  fi

  log "Setup done. Now:"
  echo "  1. Copy .env.prod.example to ${ENV_FILE}"
  echo "  2. Fill in ALL values (generate secrets with: openssl rand -hex 32)"
  echo "  3. Point your domain DNS A record to this VPS IP"
  echo "  4. Run: ./deploy.sh --build"
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

# ── Build images ──────────────────────────────────────────────────────────────
build_images() {
  log "Building CRM app image..."
  ${COMPOSE_CMD} build --no-cache app
  log "Building ws-server image..."
  ${COMPOSE_CMD} build --no-cache ws-server
}

# ── Run database migrations ──────────────────────────────────────────────────
run_migrations() {
  log "Running CRM database migrations..."
  # Always rebuild this short-lived image so a newly pulled migration file is
  # present even when the app image was built during an earlier deploy.
  ${COMPOSE_CMD} run --rm --build migrate
  log "Migrations complete."
}

# ── Start services ───────────────────────────────────────────────────────────
start_services() {
  # The production overlay owns the internal Docker network. A previous
  # Compose run can leave stale endpoints behind after a network/overlay
  # change. Tear down containers and the project network before recreating it;
  # this intentionally does not use `down --volumes`, so named DB/Redis data
  # remains untouched.
  log "Removing previous containers and stale project network..."
  ${COMPOSE_CMD} down --remove-orphans --timeout 30 >/dev/null 2>&1 || true
  # Compose can leave stopped containers with stale/null port bindings after
  # a failed network recreation. Remove only this project's app containers so
  # the next `up` creates fresh HostConfig.PortBindings.
  ${COMPOSE_CMD} rm --stop --force app ws-server >/dev/null 2>&1 || true
  local network_labels
  network_labels="$(docker network inspect repo_internal --format '{{.Labels}}' 2>/dev/null || true)"
  if [[ "${network_labels}" == *"com.docker.compose.project:${COMPOSE_PROJECT}"* ]]; then
    docker network rm repo_internal >/dev/null 2>&1 || true
  fi

  log "Starting databases and Redis..."
  ${COMPOSE_CMD} up -d evolution-db evolution-redis db redis

  log "Waiting for health checks..."
  sleep 10

  log "Starting Evolution API..."
  ${COMPOSE_CMD} up -d evolution

  log "Running CRM migrations..."
  run_migrations

  log "Starting CRM app + ws-server..."
  # Force recreation so changed port bindings are applied even when an older
  # container survived a partial `compose down`.
  ${COMPOSE_CMD} up -d --force-recreate --no-deps app ws-server
}

assert_host_bindings() {
  local app_binding ws_binding
  app_binding="$(${COMPOSE_CMD} port app 3000 2>/dev/null || true)"
  ws_binding="$(${COMPOSE_CMD} port ws-server 3001 2>/dev/null || true)"

  if [[ "${app_binding}" != *":${CRM_APP_HOST_PORT}"* ]]; then
    die "CRM app port binding missing. Expected 127.0.0.1:${CRM_APP_HOST_PORT}, got: ${app_binding:-<none>}"
  fi
  if [[ "${ws_binding}" != *":${CRM_WS_HOST_PORT}"* ]]; then
    die "WebSocket port binding missing. Expected 127.0.0.1:${CRM_WS_HOST_PORT}, got: ${ws_binding:-<none>}"
  fi
  log "Port bindings: app=${app_binding}, ws=${ws_binding}"
}

# ── Health check ─────────────────────────────────────────────────────────────
health_check() {
  hr
  log "Checking service health..."
  local ok=true

  check() {
    local label=$1 url=$2
    local attempt
    for attempt in $(seq 1 24); do
      if curl -fsS --max-time 10 "${url}" >/dev/null 2>&1; then
        log "  ✓ ${label}"
        return
      fi
      [[ "${attempt}" -lt 24 ]] && sleep 5
    done
    log "  ✗ ${label}  (${url})"
    ok=false
  }

  check "CRM app (localhost:${CRM_APP_HOST_PORT})" "http://localhost:${CRM_APP_HOST_PORT}/api/auth/me"
  check "WebSocket (localhost:${CRM_WS_HOST_PORT})" "http://localhost:${CRM_WS_HOST_PORT}/health"

  ${COMPOSE_CMD} ps
  hr
  [[ "${ok}" == "true" ]] && log "All checks passed." || log "Some checks failed — review logs above."
}

# ── Main ─────────────────────────────────────────────────────────────────────
main() {
  local DO_SETUP=false
  local DO_BUILD=false

  for arg in "$@"; do
    case $arg in
      --setup)       DO_SETUP=true ;;
      --build)       DO_BUILD=true ;;
    esac
  done

  [[ "${DO_SETUP}" == "true" ]] && { setup; exit 0; }

  require_env_file
  load_host_ports

  hr
  log "Tiles CRM — Production Deploy"
  log "Commit:  $(cd "${REPO_DIR}" && git rev-parse --short HEAD 2>/dev/null || echo 'n/a')"
  log "Env:     ${ENV_FILE}"
  hr

  pull_latest
  [[ "${DO_BUILD}" == "true" ]] && build_images
  start_services
  assert_host_bindings
  health_check

  log "Deploy finished."
}

main "$@"
