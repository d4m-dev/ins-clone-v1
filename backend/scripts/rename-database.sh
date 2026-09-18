#!/data/data/com.termux/files/usr/bin/bash
# ============================================================================
#  scripts/rename-database.sh — đổi tên DATABASE + USER MariaDB sang tên mới
#  (dự án đã đổi thương hiệu FamilyGram → PixGram; xem docs/MIGRATION-PIXGRAM.md)
# ----------------------------------------------------------------------------
#  Cách dùng:
#     npm run db:rename -- --from familygram            # đổi sang DB_NAME/DB_USER trong .env
#     npm run db:rename -- --from familygram --dry-run  # chỉ IN ra kế hoạch, không đụng dữ liệu
#     npm run db:rename -- --from familygram --drop-old # xoá DB + user cũ sau khi xác nhận
#
#  Việc script làm, theo thứ tự:
#     1. Kiểm tra kết nối root, DB cũ tồn tại, DB mới chưa tồn tại
#     2. Sao lưu DB cũ  →  backups/<tên-cũ>-pre-rename-<thời-gian>.sql.gz
#     3. Tạo DB mới (utf8mb4) + user mới + quyền
#     4. Nạp bản sao lưu vào DB mới
#     5. ĐỐI CHIẾU số bảng và số dòng từng bảng (cũ ↔ mới) — sai lệch thì báo lỗi
#     6. In các bước còn lại (tunnel, đăng nhập lại /admin, xoá DB cũ nếu muốn)
#
#  Không hardcode gì: mọi giá trị lấy từ backend/.env.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/backups}"

FROM=""
DRY_RUN=0
DROP_OLD=0
FORCE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --from)     FROM="${2:-}"; shift 2 ;;
    --dry-run)  DRY_RUN=1; shift ;;
    --drop-old) DROP_OLD=1; shift ;;
    --force)    FORCE=1; shift ;;
    -h|--help)  sed -n '2,25p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)          echo "[RENAME] Tham số lạ: $1 (xem --help)" >&2; exit 2 ;;
  esac
done

log()  { echo "[RENAME] $*"; }
warn() { echo "[RENAME][CẢNH BÁO] $*" >&2; }
die()  { echo "[RENAME][LỖI] $*" >&2; exit 1; }

# ── 0. Đọc .env ─────────────────────────────────────────────────────────────
[ -f "$ENV_FILE" ] || die "không thấy $ENV_FILE — chạy: cp .env.example .env && nano .env"
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
NEW_DB="${DB_NAME:-pixgram}"
NEW_USER="${DB_USER:-pixgram}"
DB_PASSWORD="${DB_PASSWORD:?DB_PASSWORD phải được đặt trong .env}"
FROM="${FROM:-${OLD_DB_NAME:-}}"

[ -n "$FROM" ] || die "thiếu tên DB cũ — dùng: npm run db:rename -- --from <tên-db-cũ>"
[ "$FROM" != "$NEW_DB" ] || { log "DB cũ và mới đều là '$FROM' — không cần đổi."; exit 0; }

MYSQL=(mariadb --protocol=TCP -h "$DB_HOST" -P "$DB_PORT" -u root)
q()     { "${MYSQL[@]}" -N -B -e "$1"; }
has_db(){ [ "$(q "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='$1'")" = "1" ]; }

# ── 1. Kiểm tra tiền đề ─────────────────────────────────────────────────────
log "Kiểm tra kết nối root tới MariaDB $DB_HOST:$DB_PORT …"
CONNECTED=0
q "SELECT 1" >/dev/null 2>&1 && CONNECTED=1
if [ "$CONNECTED" = "0" ]; then
  [ "$DRY_RUN" = "1" ] || die "không kết nối được bằng root (mysqld đã chạy chưa? npm run start:db)"
  warn "chưa kết nối được MariaDB — bỏ qua bước kiểm tra tồn tại, chỉ in kế hoạch (--dry-run)."
fi

OLD_TABLES=""
if [ "$CONNECTED" = "1" ]; then
  if has_db "$FROM"; then
    log "✓ DB cũ '$FROM' tồn tại"
  elif [ "$DRY_RUN" = "1" ]; then
    warn "không thấy DB cũ '$FROM' — vẫn in kế hoạch."
  else
    die "DB cũ '$FROM' không tồn tại — kiểm tra lại tên (--from)."
  fi

  if has_db "$NEW_DB"; then
    if [ "$FORCE" = "1" ]; then
      warn "DB mới '$NEW_DB' đã tồn tại — --force: sẽ NẠP ĐÈ dữ liệu vào đó."
    elif [ "$DRY_RUN" = "1" ]; then
      warn "DB mới '$NEW_DB' đã tồn tại — chạy thật sẽ cần --force."
    else
      die "DB mới '$NEW_DB' đã tồn tại. Nếu chắc chắn muốn nạp đè: thêm --force (nên backup trước)."
    fi
  fi

  OLD_TABLES="$(q "SHOW TABLES FROM \`$FROM\`" | sort || true)"
  if [ -z "$OLD_TABLES" ]; then
    [ "$DRY_RUN" = "1" ] || die "DB cũ '$FROM' không có bảng nào — có đúng là DB của ứng dụng không?"
  else
    log "✓ DB cũ có $(printf '%s\n' "$OLD_TABLES" | wc -l | tr -d ' ') bảng"
  fi
fi

# ── 2. Kế hoạch (dry-run in ra rồi dừng) ────────────────────────────────────
STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_FILE="$BACKUP_DIR/${FROM}-pre-rename-${STAMP}.sql"

SQL_PLAN=$(cat <<SQL
CREATE DATABASE IF NOT EXISTS \`${NEW_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${NEW_USER}'@'%' IDENTIFIED BY '<DB_PASSWORD trong .env>';
CREATE USER IF NOT EXISTS '${NEW_USER}'@'localhost' IDENTIFIED BY '<DB_PASSWORD trong .env>';
ALTER USER '${NEW_USER}'@'%' IDENTIFIED BY '<DB_PASSWORD trong .env>';
ALTER USER '${NEW_USER}'@'localhost' IDENTIFIED BY '<DB_PASSWORD trong .env>';
GRANT ALL PRIVILEGES ON \`${NEW_DB}\`.* TO '${NEW_USER}'@'%';
GRANT ALL PRIVILEGES ON \`${NEW_DB}\`.* TO '${NEW_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
)

log "Kế hoạch:  '$FROM'  →  '$NEW_DB'  (user: '$NEW_USER')"
log "Backup:    $DUMP_FILE.gz"
if [ "$DRY_RUN" = "1" ]; then
  echo
  echo "── Bước 3 sẽ chạy (ẩn mật khẩu) ──────────────────────────────"
  printf '%s\n' "$SQL_PLAN"
  echo "── Bước 4-5 ─────────────────────────────────────────────────"
  echo "  mariadb-dump '$FROM' | gzip  →  ${DUMP_FILE}.gz"
  echo "  zcat ${DUMP_FILE}.gz | mariadb '$NEW_DB'"
  echo "  đối chiếu số bảng + số dòng từng bảng giữa '$FROM' và '$NEW_DB'"
  [ "$DROP_OLD" = "1" ] && echo "  DROP DATABASE \`$FROM\`;  (vì có --drop-old)"
  echo
  log "(--dry-run) Không thay đổi gì cả. Bỏ cờ này để chạy thật."
  exit 0
fi

# ── 3. Sao lưu DB cũ ────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
log "Đang sao lưu '$FROM' …"
MYSQL_PWD="${DB_PASSWORD:-}" mariadb-dump --protocol=TCP -h "$DB_HOST" -P "$DB_PORT" -u root \
  --single-transaction --quick --routines --events "$FROM" > "$DUMP_FILE"
gzip -9 "$DUMP_FILE"
log "✓ Backup: ${DUMP_FILE}.gz ($(du -h "${DUMP_FILE}.gz" | cut -f1))"

restore_hint() {
  warn "Khôi phục nếu cần:  zcat '${DUMP_FILE}.gz' | mariadb -u root '$FROM'"
}
trap restore_hint ERR

# ── 4. Tạo DB + user mới, nạp dữ liệu ───────────────────────────────────────
log "Tạo DB '$NEW_DB' + user '$NEW_USER' …"
"${MYSQL[@]}" <<SQL
CREATE DATABASE IF NOT EXISTS \`${NEW_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${NEW_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}';
CREATE USER IF NOT EXISTS '${NEW_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER '${NEW_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER '${NEW_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${NEW_DB}\`.* TO '${NEW_USER}'@'%';
GRANT ALL PRIVILEGES ON \`${NEW_DB}\`.* TO '${NEW_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

log "Nạp dữ liệu vào '$NEW_DB' …"
zcat "${DUMP_FILE}.gz" | "${MYSQL[@]}" "$NEW_DB"

# ── 5. Đối chiếu số bảng + số dòng từng bảng ────────────────────────────────
log "Đối chiếu '$FROM' ↔ '$NEW_DB' …"
MISMATCH=0
NEW_TABLES="$(q "SHOW TABLES FROM \`$NEW_DB\`" | sort)"
MISSING="$(comm -23 <(printf '%s\n' "$OLD_TABLES") <(printf '%s\n' "$NEW_TABLES") || true)"
if [ -n "$MISSING" ]; then
  warn "bảng bị thiếu ở DB mới:"
  while IFS= read -r t; do [ -n "$t" ] && printf '   - %s\n' "$t" >&2; done <<< "$MISSING"
  MISMATCH=1
fi

printf '   %-32s %10s %10s\n' "BẢNG" "CŨ" "MỚI"
while IFS= read -r t; do
  [ -n "$t" ] || continue
  c_old="$(q "SELECT COUNT(*) FROM \`$FROM\`.\`$t\`")"
  c_new="$(q "SELECT COUNT(*) FROM \`$NEW_DB\`.\`$t\`")"
  flag="✓"; [ "$c_old" = "$c_new" ] || { flag="✗"; MISMATCH=1; }
  printf '   %-32s %10s %10s  %s\n' "$t" "$c_old" "$c_new" "$flag"
done <<< "$OLD_TABLES"

if [ "$MISMATCH" = "1" ]; then
  die "số liệu KHÔNG khớp — chưa xoá gì. Kiểm tra lại, hoặc khôi phục bằng lệnh in ở trên."
fi
log "✓ Số bảng và số dòng khớp hoàn toàn"

# ── 6. Xoá DB/user cũ (chỉ khi có --drop-old) ───────────────────────────────
if [ "$DROP_OLD" = "1" ]; then
  log "Xoá DB cũ '$FROM' và user cũ …"
  OLD_USER="${OLD_DB_NAME_USER:-$FROM}"
  "${MYSQL[@]}" <<SQL
DROP DATABASE IF EXISTS \`${FROM}\`;
DROP USER IF EXISTS '${OLD_USER}'@'%';
DROP USER IF EXISTS '${OLD_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
  log "✓ Đã xoá DB '$FROM' + user '$OLD_USER' (backup vẫn giữ ở ${DUMP_FILE}.gz)"
else
  log "DB cũ '$FROM' vẫn được giữ nguyên (xoá khi bạn chắc chắn: thêm --drop-old, hoặc DROP DATABASE thủ công)."
fi

trap - ERR

echo
log "════ ĐỔI TÊN XONG ════"
log "Bước tiếp theo:"
log "  1. .env đã dùng DB_NAME=$NEW_DB / DB_USER=$NEW_USER (không cần sửa gì thêm)"
log "  2. Khởi động lại: npm start  → Sequelize tự thấy schema (không cần migrate)"
log "  3. Kiểm tra:  curl -s http://127.0.0.1:\${PORT:-3000}/api/health | head -c 400"
log "  4. Đổi tên tunnel Cloudflare (tùy chọn) — xem docs/MIGRATION-PIXGRAM.md mục 2"
log "  5. Quản trị viên phải ĐĂNG NHẬP LẠI /admin (tên cookie phiên đã đổi)"
