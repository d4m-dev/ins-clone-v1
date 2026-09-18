#!/usr/bin/env bash
# ============================================================================
# tools/boot-check.sh — "bật thử" backend rồi tự kiểm tra các đường dẫn chính.
# ----------------------------------------------------------------------------
# Vì sao cần script này? `npm start` trên điện thoại là một dây chuyền
# (MariaDB → API → tunnel). Nếu một mắt xích lỗi, ta muốn biết NGAY và biết
# CHÍNH XÁC đường dẫn nào hỏng — thay vì mò trong hàng nghìn dòng log.
#
# Cách dùng:
#   bash tools/boot-check.sh              # dùng SQLite tạm, cổng 4321
#   PORT=4399 bash tools/boot-check.sh    # đổi cổng
#
# Script tự dọn: tắt server cũ, dùng thư mục tạm riêng, thoát là xoá.
# Không cần MariaDB, không gửi Telegram, không gửi email.
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$HERE/backend"
PORT="${PORT:-4321}"
TMP="$(mktemp -d /tmp/fg-bootcheck-XXXXXX)"
LOG="$TMP/server.log"
PASS=0
FAIL=0

say()  { printf '%s\n' "$*"; }
ok()   { PASS=$((PASS + 1)); printf '  ✅ %s\n' "$*"; }
bad()  { FAIL=$((FAIL + 1)); printf '  ❌ %s\n' "$*"; }
line() { printf '\n── %s ───────────────────────────────────\n' "$*"; }

# --- 0. dọn tiến trình cũ đang giữ cổng --------------------------------------
line "Dọn tiến trình cũ"
# ⚠️ Không dùng `pkill -f "node server.js"`: chuỗi lệnh của chính script cũng
# chứa mẫu đó nên pkill sẽ tự bắn vào tiến trình đang chạy. Đọc /proc thay thế.
for pid in $(pgrep -x node 2>/dev/null); do
  args=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)
  case "$args" in
    "node server.js"*) kill -9 "$pid" 2>/dev/null && say "  đã tắt tiến trình cũ PID $pid" ;;
  esac
done
sleep 1

# --- 1. khởi động server ở chế độ thử ---------------------------------------
line "Khởi động backend (SQLite tạm, cổng $PORT, không Telegram/Email)"
cd "$BACKEND" || exit 1
NODE_ENV=development \
DB_DIALECT=sqlite DB_STORAGE="$TMP/test.sqlite" DB_LOGGING=false \
UPLOAD_DIR="$TMP/uploads" \
PUBLIC_BASE_URL="http://127.0.0.1:$PORT" \
JWT_SECRET=bootcheck-secret-0123456789abcdefgh \
ADMIN_SESSION_SECRET=bootcheck-admin-0123456789abcdefg \
ADMIN_EMAIL=admin@family.local ADMIN_PASSWORD='FamilyGram@2026' \
TELEGRAM_ENABLED=false EMAIL_ENABLED=false AI_ENABLED=false \
PORT="$PORT" \
setsid node server.js >"$LOG" 2>&1 &
SERVER_PID=$!
trap 'kill -9 -"$SERVER_PID" 2>/dev/null; rm -rf "$TMP"' EXIT

# chờ server mở cổng (tối đa 40 giây)
for _ in $(seq 1 40); do
  grep -q "HTTP server listening" "$LOG" 2>/dev/null && break
  grep -q "Fatal startup error" "$LOG" 2>/dev/null && break
  sleep 1
done

if grep -q "HTTP server listening" "$LOG"; then
  ok "server đã mở cổng $PORT"
else
  bad "server KHÔNG mở được cổng — log bên dưới"
  tail -25 "$LOG"
  exit 1
fi

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@"; }
BODY() { curl -s --max-time 10 "$@"; }

# --- 2. API + AdminJS --------------------------------------------------------
line "Đường dẫn công khai"
[ "$(code "http://127.0.0.1:$PORT/api/health")" = 200 ] && ok "GET /api/health → 200" || bad "GET /api/health"
# Lưu ra tệp rồi mới grep: nếu grep đọc trực tiếp từ pipe, nó thoát ngay khi thấy
# dòng khớp → curl nhận SIGPIPE → với `set -o pipefail` cả pipeline bị coi là LỖI
# (đây chính là lỗi "chập chờn" đã gặp: cùng một trang lúc đạt lúc không).
BODY -o "$TMP/health.json" "http://127.0.0.1:$PORT/api/health"
grep -q '"success":true' "$TMP/health.json" && ok "health báo success:true" || bad "payload health"
[ "$(code "http://127.0.0.1:$PORT/admin/login")" = 200 ] && ok "GET /admin/login → 200" || bad "GET /admin/login"
[ "$(code "http://127.0.0.1:$PORT/admin/assets/custom-admin.css")" = 200 ] && ok "custom-admin.css được phục vụ" || bad "custom-admin.css"
BODY -o "$TMP/login.html" "http://127.0.0.1:$PORT/admin/login"
grep -q "custom-admin.css" "$TMP/login.html" && ok "trang quản trị có nhúng CSS riêng" || bad "trang quản trị thiếu link CSS"
[ "$(code "http://127.0.0.1:$PORT/admin")" = 302 ] && ok "/admin (chưa đăng nhập) → chuyển tới trang đăng nhập" || bad "/admin không chuyển hướng"

line "API cần quyền"
[ "$(code "http://127.0.0.1:$PORT/api/invites")" = 401 ] && ok "GET /api/invites không token → 401" || bad "GET /api/invites"
[ "$(code "http://127.0.0.1:$PORT/api/invites/stats")" = 401 ] && ok "GET /api/invites/stats không token → 401" || bad "GET /api/invites/stats"
[ "$(code "http://127.0.0.1:$PORT/api/invites/khong-co-that")" = 404 ] && ok "GET /api/invites/:token sai → 404" || bad "GET /api/invites/:token"

# --- 3. đăng nhập AdminJS thật ----------------------------------------------
line "Đăng nhập bảng quản trị (kiểm tra đúng thứ tự middleware)"
COOKIE="$TMP/cookie.txt"
LOGIN=$(code -c "$COOKIE" -X POST -d 'email=admin@family.local' -d 'password=FamilyGram@2026' \
  "http://127.0.0.1:$PORT/admin/login")
[ "$LOGIN" = 302 ] && ok "POST /admin/login → 302 (đăng nhập thành công)" || bad "POST /admin/login → $LOGIN"
[ "$(code -b "$COOKIE" "http://127.0.0.1:$PORT/admin")" = 200 ] && ok "GET /admin sau đăng nhập → 200" || bad "GET /admin sau đăng nhập"

# Soi thẳng cấu hình AdminJS: chắc chắn hơn việc đoán endpoint nội bộ của
# thư viện (endpoint này đổi theo phiên bản).
ADMIN_JSON="$TMP/admin.json"
DB_DIALECT=sqlite DB_STORAGE="$TMP/test.sqlite" DB_LOGGING=false UPLOAD_DIR="$TMP/uploads" \
PUBLIC_BASE_URL="http://127.0.0.1:$PORT" JWT_SECRET=bootcheck-secret-0123456789abcdefgh \
ADMIN_SESSION_SECRET=bootcheck-admin-0123456789abcdefg TELEGRAM_ENABLED=false EMAIL_ENABLED=false AI_ENABLED=false \
node -e "
(async () => {
  const admin = await require('./admin/adminjs.config').createAdmin();
  const out = { resources: admin.resources.map(r => r.id()), labels: {}, hidden: {}, css: admin.options.assets.styles, locale: admin.options.locale.language };
  const inv = admin.resources.find(r => r.id() === 'invites').decorate();
  out.labels = { email: inv.options.properties.email.label, status: inv.options.properties.status.label };
  out.hidden = inv.options.properties.tokenHash.isVisible;
  out.actions = { newHidden: inv.options.actions.new.isAccessible === false, editHidden: inv.options.actions.edit.isAccessible === false };
  console.log(JSON.stringify(out));
})().catch(e => { console.log(JSON.stringify({ error: e.message })); process.exit(1); });
" >"$ADMIN_JSON" 2>/dev/null

if grep -q '"resources"' "$ADMIN_JSON"; then
  ok "AdminJS dựng được đối tượng quản trị"
  for r in users posts comments likes invites; do
    grep -q "\"$r\"" "$ADMIN_JSON" && ok "tài nguyên $r đã đăng ký" || bad "thiếu tài nguyên $r"
  done
  grep -q '"status":"Trạng thái"' "$ADMIN_JSON" && ok "nhãn trường đã Việt hoá (status=Trạng thái)" || bad "nhãn trường chưa Việt hoá"
  grep -q '"show":false' "$ADMIN_JSON" && ok "tokenHash của lời mời bị ẩn khỏi giao diện" || bad "tokenHash chưa bị ẩn"
  grep -q '"newHidden":true' "$ADMIN_JSON" && ok "không cho tạo lời mời tay trong AdminJS" || bad "vẫn tạo được lời mời tay"
  grep -q 'custom-admin.css' "$ADMIN_JSON" && ok "custom-admin.css được khai báo trong assets" || bad "thiếu khai báo custom-admin.css"
else
  bad "không dựng được AdminJS: $(head -c 200 "$ADMIN_JSON")"
fi

# --- 4. bảng dữ liệu đã tạo --------------------------------------------------
line "Schema database"
if [ -f "$TMP/test.sqlite" ]; then
  for t in users posts comments likes invites admin_sessions; do
    grep -aq "$t" "$TMP/test.sqlite" && ok "bảng $t tồn tại" || bad "bảng $t"
  done
else
  bad "không thấy tệp SQLite tạm"
fi

# --- 5. log phải sạch lỗi ----------------------------------------------------
line "Nhật ký khởi động"
if grep -aqi "error" "$LOG"; then
  bad "có dòng lỗi trong log:"
  grep -ai "error" "$LOG" | head -5 | sed 's/^/     /'
else
  ok "không có dòng lỗi nào"
fi

line "Kết quả"
printf '  %d đạt · %d hỏng\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] && say "  🎉 Backend sẵn sàng chạy thật (npm start sẽ bật thêm MariaDB + tunnel)" || say "  ⚠️  xem các dòng ❌ ở trên"
exit "$FAIL"
