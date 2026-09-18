#!/usr/bin/env bash
# ============================================================================
# scripts/backup-all.sh — sao lưu TRỌN GÓI: database + thư mục ảnh.
# ----------------------------------------------------------------------------
#   npm run backup
#
# Đây là lệnh nên chạy mỗi tuần (hoặc đặt vào cron Termux — xem docs/OPERATIONS.md §4).
# Database dựng lại được, còn ảnh thì không — nên hai lệnh chạy liền nhau.
# ============================================================================
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fail=0

printf '\n\033[1m══ FamilyGram — sao lưu trọn gói ══\033[0m\n'

printf '\n▸ Database (MariaDB)\n'
bash "$HERE/backup-database.sh" || { echo "  ❌ sao lưu database lỗi"; fail=1; }

printf '\n▸ Ảnh & video\n'
bash "$HERE/backup-uploads.sh" || { echo "  ❌ sao lưu ảnh lỗi"; fail=1; }

BACKUP_DIR="${BACKUP_DIR:-$HERE/../backups}"
printf '\n▸ Tổng dung lượng bản sao lưu\n'
du -sh "$BACKUP_DIR" 2>/dev/null || echo "  (chưa có thư mục backups)"

printf '\nNhắc nhở: nên copy sang thẻ nhớ/máy tính định kỳ:\n'
printf '  cp -r %s /sdcard/FamilyGram-Backup\n\n' "$BACKUP_DIR"

exit "$fail"
