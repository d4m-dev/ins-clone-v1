#!/usr/bin/env bash
# ============================================================================
# tools/check-all.sh — CHẠY TẤT CẢ KIỂM THỬ bằng một lệnh.
# ----------------------------------------------------------------------------
#   bash tools/check-all.sh            # tất cả
#   bash tools/check-all.sh --fast     # bỏ qua build frontend (nhanh)
#
# Dùng trước khi commit/push, hoặc sau khi `git pull` để biết bản mới có hỏng
# gì không. Không cần MariaDB, không gửi Telegram, không gửi email.
#
# Điều kiện: `cd backend && npm install` (cài đủ, gồm cả sqlite3 cho bộ test).
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAST=0
[ "${1:-}" = "--fast" ] && FAST=1

pass=0
fail=0
skipped=0

line() { printf '\n\033[1m══ %s ══\033[0m\n' "$*"; }
step() { printf '\n▸ %s\n' "$*"; }
mark_ok()   { pass=$((pass + 1));    printf '  ✅ %s\n' "$*"; }
mark_bad()  { fail=$((fail + 1));    printf '  ❌ %s\n' "$*"; }
mark_skip() { skipped=$((skipped + 1)); printf '  ⏭  %s\n' "$*"; }

line "PixGram — kiểm tra toàn bộ"
printf 'Thư mục: %s\n' "$HERE"

# ── 0. Chuẩn bị ───────────────────────────────────────────────────────────────
step "Phụ thuộc backend"
if [ ! -d "$HERE/backend/node_modules" ]; then
  mark_bad "chưa có backend/node_modules — chạy: cd backend && npm install"
  exit 1
fi
mark_ok "backend/node_modules đã có"

HAVE_SQLITE=0
[ -d "$HERE/backend/node_modules/sqlite3" ] && HAVE_SQLITE=1
if [ "$HAVE_SQLITE" = 1 ]; then
  mark_ok "có sqlite3 (chạy được bộ test không cần MariaDB)"
else
  mark_skip "thiếu sqlite3 — bỏ qua các bộ test cần database (cài: cd backend && npm install)"
fi

# ── 1. Cú pháp toàn bộ mã nguồn backend ──────────────────────────────────────
step "Cú pháp JS backend (node --check)"
syntax_bad=0
total=0
while IFS= read -r file; do
  total=$((total + 1))
  node --check "$file" >/dev/null 2>&1 || { syntax_bad=$((syntax_bad + 1)); printf '     ↳ lỗi cú pháp: %s\n' "${file#"$HERE"/}"; }
done < <(find "$HERE/backend" -name '*.js' -not -path '*/node_modules/*')
if [ "$syntax_bad" -eq 0 ]; then mark_ok "$total tệp JS hợp lệ"; else mark_bad "$syntax_bad/$total tệp lỗi cú pháp"; fi

# ── 2. Ba bộ kiểm thử ────────────────────────────────────────────────────────
run_suite() {
  local name="$1" cmd="$2" needs_db="$3"
  step "$name"
  if [ "$needs_db" = 1 ] && [ "$HAVE_SQLITE" = 0 ]; then
    mark_skip "$name (cần sqlite3)"
    return
  fi
  local output
  output=$(eval "$cmd" 2>&1)
  local summary
  summary=$(printf '%s' "$output" | grep -aE 'TẤT CẢ ĐỀU ĐẠT|phép thử thất bại|đạt · [0-9]+ hỏng' | tail -1)
  if printf '%s' "$output" | grep -qaE 'TẤT CẢ ĐỀU ĐẠT| 0 hỏng'; then
    mark_ok "$name — ${summary:-đạt}"
  else
    mark_bad "$name — ${summary:-thất bại}"
    printf '%s\n' "$output" | grep -aE '❌' | head -5 | sed 's/^/     /'
  fi
}

run_suite "Bộ kiểm thử API (đăng ký, ảnh, video, Reels, Stories, lời mời, mật khẩu)" \
  "node '$HERE/tools/_smoke_api.js'" 1
run_suite "Chat 1-1: hội thoại, tin nhắn chờ, đã đọc, thu hồi, SSE" \
  "node '$HERE/tools/_smoke_chat.js'" 1
run_suite "Nội dung email 3 ngôn ngữ (vi/en/zh)" \
  "node '$HERE/tools/_smoke_email.js'" 0
run_suite "Nén ảnh phía trình duyệt (giữ tỉ lệ, chọn định dạng, mức tiết kiệm)" \
  "node '$HERE/tools/_smoke_compress.js'" 0
run_suite "Khởi động thật + AdminJS + custom CSS + schema" \
  "bash '$HERE/tools/boot-check.sh'" 1

run_suite "Chốt chặn câu chữ: không còn chữ về gia đình (dự án công khai)" \
  "bash '$HERE/tools/check-wording.sh'" 0

# ── 3. Frontend ──────────────────────────────────────────────────────────────
step "Frontend (Vite build)"
if [ "$FAST" = 1 ]; then
  mark_skip "bỏ qua vì --fast"
elif [ ! -d "$HERE/frontend/node_modules" ]; then
  mark_skip "chưa cài frontend — chạy: cd frontend && npm install"
else
  if (cd "$HERE/frontend" && npx vite build >/tmp/fg-build.log 2>&1); then
    size=$(grep -aoE 'dist/assets/index-[^ ]*\.js *[0-9.]+ kB' /tmp/fg-build.log | tail -1 | tr -s ' ')
    mark_ok "build thành công ${size:+· $size}"
  else
    mark_bad "build thất bại — xem /tmp/fg-build.log"
    tail -12 /tmp/fg-build.log | sed 's/^/     /'
  fi
fi

# ── 4. Kiểm tra bí mật không bị lọt vào git ──────────────────────────────────
step "An toàn: không có bí mật nào bị git theo dõi"
if git -C "$HERE" rev-parse --git-dir >/dev/null 2>&1; then
  leaked=$(git -C "$HERE" ls-files | grep -E '(^|/)\.env$|\.env\.bak|\.pem$|\.key$' || true)
  if [ -z "$leaked" ]; then
    mark_ok "không có tệp .env nào bị theo dõi"
  else
    mark_bad "git đang theo dõi tệp bí mật:"
    printf '%s\n' "$leaked" | sed 's/^/     /'
  fi
else
  mark_skip "không phải git repo"
fi

# ── 5. Tổng kết ──────────────────────────────────────────────────────────────
line "Kết quả"
printf '  %d đạt · %d hỏng · %d bỏ qua\n' "$pass" "$fail" "$skipped"
if [ "$fail" -eq 0 ]; then
  printf '\n  🎉 Mọi thứ đều ổn — có thể commit/push.\n\n'
else
  printf '\n  ⚠️  Có %d mục hỏng — xem các dòng ❌ ở trên.\n\n' "$fail"
fi
exit "$fail"
