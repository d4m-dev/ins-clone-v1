#!/data/data/com.termux/files/usr/bin/bash
# ============================================================================
#  scripts/start-mariadb.sh — boots MariaDB inside Termux (idempotent)
#  Executed by `npm start` through concurrently as the "DB" process.
#  It NEVER exits after boot: mysqld_safe runs in the foreground, which is
#  exactly what concurrently needs to keep the 1-click startup alive.
# ============================================================================
set -euo pipefail

TERMUX_PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env"

# ---- load .env (DB_PORT / MARIADB_DATADIR / MARIADB_SOCKET) ----------------
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

DB_PORT="${DB_PORT:-3306}"
MARIADB_DATADIR="${MARIADB_DATADIR:-$TERMUX_PREFIX/var/lib/mysql}"
MARIADB_SOCKET="${MARIADB_SOCKET:-$TERMUX_PREFIX/var/run/mysqld.sock}"
MYSQLD_SAFE="${MYSQLD_SAFE:-$TERMUX_PREFIX/bin/mysqld_safe}"

mkdir -p "$(dirname "$MARIADB_SOCKET")" "$TERMUX_PREFIX/var/run/mysqld" "$TERMUX_PREFIX/var/log"

# ---- first run: initialise the data directory ------------------------------
if [ ! -d "$MARIADB_DATADIR/mysql" ]; then
  echo "[DB] First run detected → initialising data directory at $MARIADB_DATADIR"
  mkdir -p "$MARIADB_DATADIR"
  if command -v mariadb-install-db >/dev/null 2>&1; then
    mariadb-install-db --auth-root-authentication-method=normal --datadir="$MARIADB_DATADIR" >/dev/null
  elif command -v mysql_install_db >/dev/null 2>&1; then
    mysql_install_db --datadir="$MARIADB_DATADIR" >/dev/null
  else
    echo "[DB] ERROR: mariadb-install-db not found. Run: pkg install mariadb" >&2
    exit 1
  fi
fi

# ---- already running? (restart-safe) ---------------------------------------
if command -v mariadb-admin >/dev/null 2>&1; then
  if mariadb-admin --socket="$MARIADB_SOCKET" ping >/dev/null 2>&1; then
    echo "[DB] MariaDB is already running on port $DB_PORT — waiting for it to stop."
    while mariadb-admin --socket="$MARIADB_SOCKET" ping >/dev/null 2>&1; do sleep 5; done
    echo "[DB] MariaDB stopped."
    exit 0
  fi
fi

echo "[DB] Starting mysqld_safe (port $DB_PORT, datadir $MARIADB_DATADIR)"

# mysqld_safe stays in the foreground; --skip-syslog keeps Termux happy.
exec "$MYSQLD_SAFE" \
  --datadir="$MARIADB_DATADIR" \
  --socket="$MARIADB_SOCKET" \
  --port="$DB_PORT" \
  --bind-address=127.0.0.1 \
  --skip-syslog \
  --skip-networking=0
