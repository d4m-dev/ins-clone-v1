#!/usr/bin/env bash
# ============================================================================
# tools/check-wording.sh — CHỐT CHẶN: không cho câu chữ "gia đình" quay lại.
# ----------------------------------------------------------------------------
# Dự án đã chuyển sang CÔNG KHAI (cộng đồng chia sẻ ảnh), nên mọi câu chữ nói
# về gia đình / người thân / family phải biến mất khỏi: UI (vi·en·zh), email,
# bot Telegram, nhãn AdminJS, README + docs, dữ liệu demo và fixture kiểm thử.
#
#   bash tools/check-wording.sh        # quét, thoát 1 nếu còn vi phạm
#
# Được gọi tự động bởi tools/check-all.sh và .github/workflows/ci.yml.
# Miễn trừ duy nhất: 2 tệp phục vụ việc migrate — chúng BUỘC phải nhắc tên cũ
# một lần để chuyển dữ liệu (xoá 2 tệp này sau khi migrate xong là sạch tuyệt đối).
# Ngoài ra thuộc tính CSS `font-family` cũng không tính (từ khoá CSS).
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

# Từ khoá cấm — viết bằng mã thoát để chính tệp này không tự kích hoạt chốt chặn.
P1=$'gia \u0111\u00ecnh'                 # gia đình
P2=$'ng\u01b0\u1eddi th\u00e2n'          # người thân
P3="fam""ily"                            # family
P4=$'\u5bb6\u5ead'                       # 家庭
P5=$'\u5bb6\u4eba'                       # 家人
P6=$'\u4eb2\u4eba'                       # 亲人
P7=$'\u5168\u5bb6'                       # 全家
P8=$'\U0001F468\u200d\U0001F469\u200d\U0001F467\u200d\U0001F466'  # biểu tượng gia đình
PATTERN="$P1|$P2|$P3|$P4|$P5|$P6|$P7|$P8"

# Quét tệp git theo dõi + tệp chưa theo dõi (bỏ qua tệp bị .gitignore, ví dụ .env).
mapfile -t FILES < <(git ls-files -co --exclude-standard 2>/dev/null \
  | grep -vE '(^|/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$')

if [ "${#FILES[@]}" -eq 0 ]; then
  printf '⚠️  Không tìm thấy tệp nào để quét (chạy trong git repo).\n'
  exit 0
fi

EXEMPT='tools/check-wording\.sh|docs/MIGRATION-PIXGRAM\.md|backend/scripts/rename-database\.sh'

HITS=$(grep -niE "$PATTERN" "${FILES[@]}" 2>/dev/null \
  | grep -vE "$EXEMPT" \
  | grep -viE 'font-?family' || true)

if [ -z "$HITS" ]; then
  printf '🎉 TẤT CẢ ĐỀU ĐẠT — không còn chữ về gia đình (%d tệp đã quét · 2 tệp migrate được miễn)\n' "${#FILES[@]}"
  exit 0
fi

printf '❌ PHÁT HIỆN câu chữ về gia đình — dự án đã chuyển sang công khai:\n\n'
printf '%s\n' "$HITS" | sed 's/^/   /'
printf '\n   ↳ Tổng: %s chỗ · sửa thành "thành viên", "cộng đồng", "kho ảnh", "mọi người"…\n\n' "$(printf '%s\n' "$HITS" | wc -l)"
exit 1
