#!/data/data/com.termux/files/usr/bin/bash
# ============================================================================
#  scripts/init-database.sh — creates the database + application user.
#  Run ONCE after MariaDB has been started for the first time:
#     npm run db:init
#  Values come from .env (DB_NAME / DB_USER / DB_PASSWORD) — nothing here is
#  hardcoded, and the password is quoted for MySQL so shell metacharacters are
#  harmless.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "[INIT] .env not found — run: cp .env.example .env && nano .env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-familygram}"
DB_USER="${DB_USER:-familygram}"
DB_PASSWORD="${DB_PASSWORD:?DB_PASSWORD must be set in .env}"

log() { echo "[INIT] $*"; }

log "Waiting for MariaDB on $DB_HOST:$DB_PORT …"
for _ in $(seq 1 40); do
  if mariadb --protocol=TCP -h "$DB_HOST" -P "$DB_PORT" -u root -e "SELECT 1" >/dev/null 2>&1; then
    ROOT_OK=1
    break
  fi
  sleep 3
done
[ "${ROOT_OK:-0}" = "1" ] || { log "Could not connect as root. Is mysqld running? (npm run start:db)"; exit 1; }

log "Creating database '$DB_NAME' and user '$DB_USER' …"
mariadb --protocol=TCP -h "$DB_HOST" -P "$DB_PORT" -u root <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}';
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'%';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

log "Done. Tables are created automatically by Sequelize on the next 'npm start'."
log "Verify with: node -e \"require('./config/database').connectWithRetry().then(()=>process.exit(0))\""
