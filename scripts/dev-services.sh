#!/usr/bin/env bash
# dev-services.sh — Homebrew-based local development service management
# Usage: ./scripts/dev-services.sh <command>
# Commands: setup, start, stop, status, db:create, db:migrate, db:reset

set -euo pipefail

# --- Configuration ---
DB_NAME="coopsource_dev"
DB_USER="coopsource"
DB_PASSWORD="dev_password"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
err()   { echo -e "${RED}[error]${NC} $*" >&2; }

# --- Detect Homebrew PostgreSQL 16 ---
detect_pg_bin() {
  local candidates=(
    "/opt/homebrew/opt/postgresql@16/bin"
    "/usr/local/opt/postgresql@16/bin"
  )
  for dir in "${candidates[@]}"; do
    if [[ -d "$dir" ]]; then
      echo "$dir"
      return 0
    fi
  done
  return 1
}

ensure_pg_on_path() {
  local pg_bin
  if pg_bin="$(detect_pg_bin)"; then
    export PATH="$pg_bin:$PATH"
  fi
}

# --- Commands ---

cmd_setup() {
  info "Setting up local development environment..."
  echo ""

  # 1. Install Homebrew packages
  info "Checking Homebrew packages..."
  if ! command -v brew &>/dev/null; then
    err "Homebrew is not installed. Install it from https://brew.sh"
    exit 1
  fi

  local packages=("postgresql@16" "redis")
  for pkg in "${packages[@]}"; do
    if brew list "$pkg" &>/dev/null; then
      ok "$pkg is already installed"
    else
      info "Installing $pkg..."
      brew install "$pkg"
      ok "$pkg installed"
    fi
  done

  ensure_pg_on_path

  # 2. Start services
  cmd_start

  # 3. Wait for PostgreSQL to be ready
  info "Waiting for PostgreSQL to be ready..."
  local retries=30
  while ! pg_isready -q 2>/dev/null; do
    retries=$((retries - 1))
    if [[ $retries -le 0 ]]; then
      err "PostgreSQL did not become ready within 30 seconds"
      exit 1
    fi
    sleep 1
  done
  ok "PostgreSQL is ready"

  # 4. Create role and database
  cmd_db_create

  # 5. Copy .env.example to .env if missing
  if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
    if [[ -f "$PROJECT_ROOT/.env.example" ]]; then
      cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
      ok "Copied .env.example to .env"
    else
      warn ".env.example not found — create .env manually"
    fi
  else
    ok ".env already exists"
  fi

  # 6. Run migrations
  cmd_db_migrate

  echo ""
  ok "Setup complete! Run 'make dev' or 'pnpm dev' to start developing."
}

cmd_start() {
  info "Starting services..."
  brew services start postgresql@16 2>/dev/null || true
  brew services start redis 2>/dev/null || true
  ok "PostgreSQL and Redis started"
}

cmd_stop() {
  info "Stopping services..."
  brew services stop postgresql@16 2>/dev/null || true
  brew services stop redis 2>/dev/null || true
  ok "PostgreSQL and Redis stopped"
}

cmd_status() {
  ensure_pg_on_path
  echo ""
  info "Infrastructure status:"
  echo ""

  # PostgreSQL
  if pg_isready -q 2>/dev/null; then
    ok "PostgreSQL: running"
  else
    err "PostgreSQL: not running"
  fi

  # Redis
  if redis-cli ping 2>/dev/null | grep -q PONG; then
    ok "Redis: running"
  else
    err "Redis: not running"
  fi

  # Database
  if psql postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null | grep -q 1; then
    ok "Database '$DB_NAME': exists"
  else
    warn "Database '$DB_NAME': not found"
  fi

  # .env
  if [[ -f "$PROJECT_ROOT/.env" ]]; then
    ok ".env file: present"
  else
    warn ".env file: missing"
  fi

  echo ""
}

cmd_db_create() {
  ensure_pg_on_path
  info "Ensuring database role and database exist..."

  # Create role if it doesn't exist
  if psql postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" 2>/dev/null | grep -q 1; then
    ok "Role '$DB_USER' already exists"
  else
    psql postgres -c "CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASSWORD' CREATEDB;"
    ok "Created role '$DB_USER'"
  fi

  # Create main database if it doesn't exist
  if psql postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null | grep -q 1; then
    ok "Database '$DB_NAME' already exists"
  else
    createdb -O "$DB_USER" "$DB_NAME"
    ok "Created database '$DB_NAME'"
  fi

  # Create PLC database if it doesn't exist (Stage 2: used by did-method-plc container)
  if psql postgres -tAc "SELECT 1 FROM pg_database WHERE datname='plc_dev'" 2>/dev/null | grep -q 1; then
    ok "Database 'plc_dev' already exists"
  else
    createdb -O "$DB_USER" "plc_dev"
    ok "Created database 'plc_dev'"
  fi
}

cmd_db_migrate() {
  ensure_pg_on_path
  info "Running database migrations..."

  if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
    err ".env file not found — run 'make setup' first"
    exit 1
  fi

  # Source .env to get DATABASE_URL
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/.env"
  set +a

  cd "$PROJECT_ROOT"
  pnpm --filter @coopsource/db migrate
  ok "Migrations complete"
}

cmd_db_reset() {
  ensure_pg_on_path
  info "Resetting database..."

  # Drop database if it exists
  if psql postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null | grep -q 1; then
    dropdb "$DB_NAME"
    ok "Dropped database '$DB_NAME'"
  else
    ok "Database '$DB_NAME' does not exist (nothing to drop)"
  fi

  # Recreate
  cmd_db_create

  # Re-run migrations
  cmd_db_migrate

  ok "Database reset complete"
}

# --- Main ---
case "${1:-help}" in
  setup)      cmd_setup ;;
  start)      cmd_start ;;
  stop)       cmd_stop ;;
  status)     cmd_status ;;
  db:create)  cmd_db_create ;;
  db:migrate) cmd_db_migrate ;;
  db:reset)   cmd_db_reset ;;
  help|--help|-h)
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  setup       First-time setup: install services, create DB, copy .env, migrate"
    echo "  start       Start PostgreSQL and Redis"
    echo "  stop        Stop PostgreSQL and Redis"
    echo "  status      Check infrastructure health"
    echo "  db:create   Create database role and database (idempotent)"
    echo "  db:migrate  Run pending Kysely migrations"
    echo "  db:reset    Drop and recreate database, re-run migrations"
    echo ""
    ;;
  *)
    err "Unknown command: $1"
    echo "Run '$0 help' for usage."
    exit 1
    ;;
esac
