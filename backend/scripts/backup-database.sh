#!/data/data/com.termux/files/usr/bin/bash
# ============================================================================
#  scripts/backup-database.sh — dump MariaDB + note the photo counts.
#  Photos live in uploads/ and are NOT binary-dumped here (they are plain
#  files; sync them with rsync/termux-storage). Run: npm run db:backup
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1090
set -a; . "$SCRIPT_DIR/.env"; set +a

BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

DB_NAME="${DB_NAME:-familygram}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-familygram}"
DB_PASSWORD="${DB_PASSWORD:?DB_PASSWORD must be set in .env}"

TARGET="$BACKUP_DIR/${DB_NAME}-${STAMP}.sql"
echo "[BACKUP] Dumping $DB_NAME → $TARGET"
MYSQL_PWD="$DB_PASSWORD" mariadb-dump \
  --protocol=TCP -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
  --single-transaction --quick --routines --events \
  "$DB_NAME" > "$TARGET"

gzip -9 "$TARGET"
echo "[BACKUP] Done: ${TARGET}.gz ($(du -h "${TARGET}.gz" | cut -f1))"

# Keep the last 14 dumps
ls -1t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -v
