#!/usr/bin/env bash
# ============================================================================
# scripts/backup-uploads.sh — sao lưu THƯ MỤC ẢNH/VIDEO.
# ----------------------------------------------------------------------------
#   npm run db:backup        # chỉ database
#   npm run backup:uploads   # chỉ ảnh/video (script này)
#   npm run backup           # cả hai
#
# Vì sao cần riêng? Ảnh gia đình là thứ KHÔNG thể tạo lại. Database có thể dựng
# lại (thành viên, bài viết), nhưng tệp ảnh thì không — nên luôn sao lưu cả hai.
#
# Tệp nén nằm ở backend/backups/, giữ 7 bản gần nhất rồi tự xoá bản cũ.
# Nên copy thư mục backups/ sang thẻ nhớ hoặc máy tính định kỳ:
#   cp -r ~/familygram/backend/backups /sdcard/FamilyGram-Backup
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

# Đọc .env để biết UPLOAD_DIR (không in giá trị ra ngoài).
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

UPLOAD_DIR="${UPLOAD_DIR:-uploads}"
BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/backups}"
KEEP="${BACKUP_KEEP:-7}"          # số bản giữ lại
STAMP="$(date +%Y%m%d-%H%M%S)"

if [ ! -d "$UPLOAD_DIR" ]; then
  echo "[UPLOADS] Không thấy thư mục $UPLOAD_DIR — chưa có ảnh nào để sao lưu."
  exit 0
fi

COUNT="$(find "$UPLOAD_DIR" -type f ! -name '.gitkeep' | wc -l | tr -d ' ')"
if [ "$COUNT" = "0" ]; then
  echo "[UPLOADS] Thư mục trống — bỏ qua."
  exit 0
fi

mkdir -p "$BACKUP_DIR"
TARGET="$BACKUP_DIR/uploads-$STAMP.tar.gz"

echo "[UPLOADS] Đang nén $COUNT tệp từ $UPLOAD_DIR …"
tar -czf "$TARGET" "$UPLOAD_DIR"

SIZE="$(du -h "$TARGET" | cut -f1)"
echo "[UPLOADS] Xong: $TARGET ($SIZE · $COUNT tệp)"

# Xoay vòng: chỉ giữ $KEEP bản mới nhất.
if [ "$KEEP" -gt 0 ]; then
  ls -1t "$BACKUP_DIR"/uploads-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
    rm -f "$old" && echo "[UPLOADS] Đã xoá bản cũ: $(basename "$old")"
  done
fi

FREE="$(df -k "$BACKUP_DIR" | tail -1 | awk '{print $4}')"
echo "[UPLOADS] Còn trống: $((FREE / 1024 / 1024)) MB"
if [ "$((FREE / 1024 / 1024))" -lt 1024 ]; then
  echo "[UPLOADS] ⚠️  Dưới 1 GB — nên chuyển bản sao lưu sang thẻ nhớ rồi xoá bớt."
fi
