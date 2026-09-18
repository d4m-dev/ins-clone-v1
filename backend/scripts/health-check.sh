#!/usr/bin/env bash
# ============================================================================
# scripts/health-check.sh — hỏi thẳng máy chủ xem nó có ổn không.
# ----------------------------------------------------------------------------
#   npm run health            # kiểm tra API đang chạy trên máy này
#   npm run health -- --public  # kiểm tra thêm địa chỉ công khai (qua tunnel)
#
# Khác với `npm run doctor` (khám cấu hình máy), script này gọi endpoint thật
# /api/health rồi in ra vài chỉ số quan trọng: thời gian chạy, trạng thái email,
# số ảnh đã lưu. Rất tiện để trả lời câu "máy chủ còn sống không?" từ Termux
# hoặc từ cron.
# ============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

PORT="${PORT:-4000}"
LOCAL_URL="http://127.0.0.1:${PORT}/api/health"

GREEN=$'\033[32m'; RED=$'\033[31m'; DIM=$'\033[2m'; RESET=$'\033[0m'
problems=0

check_url() {
  local label="$1" url="$2" required="$3"
  printf '\n▸ %s\n   %s%s%s\n' "$label" "$DIM" "$url" "$RESET"

  local body
  body="$(curl -fsS --max-time 10 "$url" 2>/dev/null)" || body=""
  if [ -z "$body" ]; then
    if [ "$required" = "1" ]; then
      printf '   %s❌ Không trả lời%s — máy chủ chưa chạy? Kiểm tra: npm run doctor\n' "$RED" "$RESET"
      problems=$((problems + 1))
    else
      printf '   %s❌ Không trả lời%s — tunnel hoặc DNS chưa sẵn sàng\n' "$RED" "$RESET"
    fi
    return
  fi

  node -e '
    let raw = "";
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => {
      try {
        const payload = JSON.parse(raw);
        const d = payload.data || payload;
        const up = d.uptimeSeconds ?? 0;
        const hours = Math.floor(up / 3600);
        const minutes = Math.floor((up % 3600) / 60);
        console.log(`   \u001b[32m✅ Đang chạy\u001b[0m · ${hours}g ${minutes}p · môi trường: ${d.env}`);
        if (d.apiBase) console.log(`   API: ${d.apiBase}`);
        if (d.email) {
          const state = d.email.ready ? "sẵn sàng" : `chưa gửi được (${d.email.reason || "?"})`;
          console.log(`   Email: ${d.email.enabled ? state : "đang tắt"}`);
        }
        if (d.storage) console.log(`   Kho ảnh: ${d.storage.files ?? "?"} tệp · ${d.storage.human ?? ""}`);
        if (d.counts) console.log(`   Dữ liệu: ${d.counts.users} thành viên · ${d.counts.posts} bài`);
      } catch (error) {
        console.log(`   \u001b[31m❌ Trả về dữ liệu lạ:\u001b[0m ${raw.slice(0, 120)}`);
      }
    });
  ' <<<"$body"
}

printf '\n\033[1m══ PixGram — kiểm tra sức khoẻ ══\033[0m\n'
check_url "Máy chủ trên máy này (nội bộ)" "$LOCAL_URL" 1

if [ "${1:-}" = "--public" ]; then
  PUBLIC_URL="${PUBLIC_BASE_URL:-}"
  if [ -z "$PUBLIC_URL" ]; then
    printf '\n▸ Địa chỉ công khai\n   ⏭  PUBLIC_BASE_URL chưa đặt trong .env — bỏ qua\n'
  else
    check_url "Địa chỉ công khai (qua Cloudflare Tunnel)" "${PUBLIC_URL%/}/api/health" 0
  fi
fi

printf '\n'
if [ "$problems" -eq 0 ]; then
  printf '  🎉 Máy chủ khoẻ.\n\n'
else
  printf '  ⚠️  Có %d điểm không trả lời. Gợi ý:\n' "$problems"
  printf '     • Chưa chạy:  npm start\n'
  printf '     • Xem cấu hình: npm run doctor\n'
  printf '     • Tunnel lỗi 1033 = chưa có connector: kiểm tra dòng BOT-TUNNEL trong log của npm start\n\n'
fi
exit "$problems"
