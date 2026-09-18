# Nơi lưu bí mật — PixGram

> **Quy tắc vàng:** bí mật **chỉ** nằm trong `backend/.env` trên điện thoại Termux.
> Tuyệt đối không commit, không dán vào mã React, không đặt trong biến `VITE_*` của Vercel.
> `VITE_*` bị Vite **in thẳng vào file JS** mà bất kỳ ai mở DevTools cũng đọc được.

## 1. Bảng phân loại

| Biến | Thuộc về | Mức độ nguy hiểm nếu lộ | Cách thu hồi |
| --- | --- | --- | --- |
| `CLOUDFLARE_TUNNEL_TOKEN` | `backend/.env` | 🔴 **Cao nhất** — người khác chạy được connector vào tunnel của bạn, có thể khiến `api.d4mdev.click` trỏ về máy họ | Zero Trust → Networks → Tunnels → connector → **Refresh token** |
| `SENDER_PASSWORD` | `backend/.env` | 🔴 Cao — mật khẩu ứng dụng Gmail: đọc/gửi mail thay bạn | Google Account → Security → App passwords → **Xoá** |
| `TELEGRAM_BOT_TOKEN` | `backend/.env` | 🟠 Vừa — chiếm quyền điều khiển bot, đọc tin nhắn bot nhận được | @BotFather → `/revoke` |
| `JWT_SECRET` | `backend/.env` | 🟠 Vừa — giả mạo token đăng nhập của bất kỳ thành viên nào | Đổi giá trị, khởi động lại API (mọi người đăng nhập lại) |
| `DB_PASSWORD` | `backend/.env` | 🟠 Vừa — truy cập MariaDB (chỉ trong máy, không mở ra internet) | `npm run db:init` với mật khẩu mới |
| `ADMIN_PASSWORD` / `ADMIN_PASSWORD_HASH` | `backend/.env` | 🟠 Vừa — vào được `/admin` | Đổi trong `.env`, chạy `npm run admin:passwd` |
| `MAIL_FROM_NAME` · `SMTP_HOST` · `SMTP_PORT` · `SMTP_SECURE` · `NOTIFY_EMAIL` · `EMAIL_NOTIFY_NEW_PHOTO` · `RESET_TOKEN_TTL_MINUTES` · `INVITE_TTL_DAYS` | `backend/.env` | 🟢 **Không bí mật** — chỉ là tham số kỹ thuật (địa chỉ nhận thư, cổng SMTP, hạn dùng liên kết). Vẫn nằm ở server, không đưa lên Vercel | – |
| `GEMINI_API_KEY` | `backend/.env` | 🟡 Thấp–vừa — tốn quota/tiền của bạn (mặc định **tắt**) | Google AI Studio → API keys → **Delete** |

## 2. Biến `VITE_*` trên Vercel — công khai, không phải bí mật

7 biến này **được phép** công khai (chúng nằm trong bundle):

```
VITE_APP_ORIGIN        = https://ins-clone-v1.vercel.app
VITE_API_ORIGIN        = https://api.d4mdev.click
VITE_API_PREFIX        = api
VITE_UPLOADS_PREFIX    = uploads
VITE_ADMIN_URL         = https://api.d4mdev.click/admin
VITE_DEFAULT_LOCALE    = vi
VITE_SUPPORTED_LOCALES = vi,en,zh
```

Đổi `VITE_*` xong **phải Redeploy** — Vite nhúng cứng lúc build, không đọc lúc chạy.

## 3. Quy trình thêm một bí mật mới

1. Đọc nó **duy nhất** trong `backend/config/env.js` (`optional('TÊN_BIẾN')`).
2. Thêm tên biến (giá trị để trống) vào `backend/.env.example` — để người sau biết cần gì.
3. Đảm bảo `.env` nằm trong `.gitignore` (đã có sẵn ở cả 3 cấp).
4. Nếu tính năng tắt được thì mặc định **tắt** (`EMAIL_ENABLED=false`, `AI_ENABLED=false`).

Kiểm tra trước khi commit:

```bash
git status --short | grep -E '\.env$' || echo "OK: không có .env nào bị stage"
grep -rn "ghp_\|AIza\|SENDER_PASSWORD=" --exclude-dir=node_modules --exclude-dir=.git . | head
```

## 4. Bảo vệ trên máy chủ

* `chmod 600 backend/.env` — chỉ chủ sở hữu đọc được.
* Vite chỉ nạp biến có tiền tố `VITE_`; đừng **bao giờ** đặt `SENDER_PASSWORD` vào
  `frontend/.env.local` kể cả khi đang thử.
* Xoay vòng (rotate) định kỳ 6–12 tháng một lần, hoặc ngay khi: đổi máy, nghi ngờ lộ,
  hoặc — như lần này — **đã từng dán vào một cuộc trò chuyện**.

## 5. Tự kiểm tra từng khoá (không cần đoán)

Chạy bốn lệnh dưới đây sau mỗi lần thay khoá — mỗi lệnh chỉ mất vài giây.

**Telegram — bot có sống và chat id có đúng?**

```bash
cd backend
TG=$(grep '^TELEGRAM_BOT_TOKEN=' .env | cut -d= -f2-)
CHAT=$(grep '^TELEGRAM_ADMIN_CHAT_ID=' .env | cut -d= -f2-)
curl -s "https://api.telegram.org/bot$TG/getMe"                       # → {"ok":true,"result":{"username":"..."}}
curl -s -X POST "https://api.telegram.org/bot$TG/sendMessage" \
     -d "chat_id=$CHAT" -d "text=✅ Kiểm tra kết nối PixGram"
```

> ⚠️ Nếu `getMe` trả về một bot **không phải bạn tạo** (tên/mô tả thuộc dịch vụ khác),
> hãy tạo bot riêng: @BotFather → `/newbot` → dán token mới vào `.env`. Token của bot
> do người khác vận hành nghĩa là họ có thể đọc/ghi tin nhắn qua bot đó.

**Cloudflare Tunnel — token còn đúng tunnel không?**

```bash
grep '^CLOUDFLARE_TUNNEL_TOKEN=' backend/.env | cut -d= -f2- | base64 -d 2>/dev/null | head -c 200
# → {"a":"<account tag>","t":"<tunnel uuid>","s":"…"}  ⇒ token đúng định dạng
```

Token là nội dung base64 của JSON gồm `a` (account tag), `t` (tunnel id), `s` (secret).
Nếu trang web trả **530 / error 1033**, token vẫn có thể đúng — nguyên nhân thường gặp
hơn là **chưa có connector nào chạy** (máy Android chưa `npm start`, hoặc `cloudflared` đã tắt).

**Gmail — mật khẩu ứng dụng còn dùng được?**

```bash
cd backend && npm run mail:test            # đăng nhập SMTP + gửi 1 email thử
cd backend && npm run mail:test -- --dry   # chỉ kiểm tra đăng nhập, không gửi
```

**Gemini — khoá có đúng loại không?**

Khoá Gemini **luôn bắt đầu bằng `AIza`** và lấy ở <https://aistudio.google.com/apikey>.
Chuỗi dạng `AQ.Ab8RN6…` (hoặc bất kỳ chuỗi nào khác) sẽ bị Google trả
`Expected OAuth 2 access token` ⇒ đặt `AI_ENABLED=false` cho tới khi thay khoá đúng.

```bash
KEY=$(grep '^GEMINI_API_KEY=' backend/.env | cut -d= -f2-)
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$KEY" | head -c 200
```
