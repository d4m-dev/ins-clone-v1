# PixGram — deployment runbook

Two targets: **the phone** (backend: MariaDB + Express + AdminJS + Telegram) and **Vercel** (frontend). The phone is published through a **Cloudflare Tunnel** on a fixed hostname (`api.d4mdev.click`).

---

## 0. Prerequisites

| Item | Value |
| --- | --- |
| Device | Android + Snapdragon 8 Elite Gen 5, Termux installed from F-Droid (Play Store version is outdated) |
| Domain | `d4mdev.click` managed by Cloudflare (nameservers pointed at Cloudflare) |
| Bot | a Telegram bot created with **@BotFather** |
| Accounts | Cloudflare, Vercel, GitHub (optional) |

---

> Đổi thương hiệu trên máy chủ đang chạy (DB, user MariaDB, tunnel): **`docs/MIGRATION-PIXGRAM.md`**.

## 1. Phone bootstrap (once)

```bash
pkg update -y && pkg upgrade -y
pkg install -y nodejs-lts mariadb cloudflared git curl openssl python clang make
termux-setup-storage          # allow access to shared storage for backups
termux-wake-lock              # stop Android from freezing the process
```

Or run the bundled script, which does exactly that: `bash backend/scripts/bootstrap-termux.sh`.

**Battery settings (critical for uptime)**

* Settings → Apps → Termux → Battery → **Unrestricted**.
* Disable “Adaptive battery”/“Sleeping apps” for Termux, or the tunnel will drop when the screen is off.
* Keep the phone on a charger and, ideally, on Wi-Fi with a static LAN IP.

---

## 2. Backend configuration

```bash
cd backend
cp .env.example .env
openssl rand -hex 32   # → JWT_SECRET
openssl rand -hex 32   # → ADMIN_SESSION_SECRET
nano .env              # fill DB_PASSWORD, ADMIN_EMAIL, PUBLIC_BASE_URL, TELEGRAM_*, CLOUDFLARE_*
# Trên ĐIỆN THOẠI (chạy thật) nên cài gọn — bỏ qua thư viện chỉ dùng để kiểm thử:
npm install --omit=dev

# Trên MÁY TÍNH (phát triển/kiểm thử) thì cài đủ, để `npm run smoke`/`boot:check` chạy được:
npm install
```

Create the database and the application user:

```bash
npm run db:init        # uses DB_NAME/DB_USER/DB_PASSWORD from .env
```

Kiểm tra cấu hình vừa điền (không cần điện thoại, không cần MariaDB):

```bash
npm run boot:check     # bật thử server + dò 29 điểm (AdminJS, /admin/login, schema, custom CSS)
npm run smoke          # 57 phép thử API
npm run mail:test      # xác nhận Gmail gửi được (thêm -- --dry nếu chỉ muốn kiểm tra SMTP)
```

Generate the AdminJS password hash:

```bash
npm run admin:passwd   # paste the printed hash into ADMIN_PASSWORD_HASH=, empty ADMIN_PASSWORD=
```

---

## 3. Cloudflare Tunnel (fixed domain)

```bash
npm run tunnel:install   # installs cloudflared if missing, logs in, creates the tunnel, routes DNS, writes config
```

The generated `~/.cloudflared/config.yml` looks like:

```yaml
tunnel: <tunnel-id>
credentials-file: /data/data/com.termux/files/home/.cloudflared/<tunnel-id>.json
protocol: quic
no-autoupdate: true
ingress:
  - hostname: api.d4mdev.click
    service: http://127.0.0.1:4000        # ← PORT from .env
    originRequest:
      connectTimeout: 30s
      noTLSVerify: true
  - service: http_status:404
```

Manual equivalent:

```bash
cloudflared tunnel login
cloudflared tunnel create pixgram-api
cloudflared tunnel route dns pixgram-api api.d4mdev.click
cloudflared tunnel run pixgram-api
```

**Why a tunnel instead of port-forwarding:** it is outbound-only (no router/NAT configuration, no exposed device IP), Cloudflare terminates TLS, and Cloudflare **Access** can wrap `/admin` in an extra login (see §7).

---

## 4. Start everything with one command

```bash
cd backend
termux-wake-lock
npm start
```

```
[DB]      Starting mysqld_safe (port 3306, datadir …/var/lib/mysql)
[API]     PixGram API  ·  env=production
[API]     HTTP server listening on 0.0.0.0:4000 — 0 image(s) stored (0 MB)
[API]     AdminJS ready → https://api.d4mdev.click/admin
[API]     Telegram bot online as @your_photo_bot
[TUNNEL]  Starting tunnel 'pixgram-api' (api.d4mdev.click → http://127.0.0.1:4000)
```

Verify from anywhere: `curl https://api.d4mdev.click/api/health`

To keep it running across reboots, either re-run `npm start` after boot or add Termux:Boot:

```bash
pkg install termux-boot
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/pixgram.sh <<'SH'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
cd ~/pixgram/backend && npm start
SH
chmod +x ~/.termux/boot/pixgram.sh
```

---

## 5. Telegram

1. @BotFather → `/newbot` → copy the token into `TELEGRAM_BOT_TOKEN`.
2. Send `/start` to your bot, then `/id` — it replies with the chat id → `TELEGRAM_ADMIN_CHAT_ID`.
3. Upload a photo from the app; the bot should immediately send the picture with the caption and buttons.

Group notifications: add the bot to a group, make it admin, and use the **group's negative chat id** as `TELEGRAM_ADMIN_CHAT_ID`.

---

## 6. Frontend on Vercel

```bash
cd frontend
npm install
npm run build          # sanity check
vercel --prod          # or: import the Git repo in the Vercel dashboard
```

Environment variables (Vercel → Project → Settings → Environment Variables, **Production + Preview**):

```
VITE_APP_ORIGIN=https://ins-clone-v1.vercel.app
VITE_API_ORIGIN=https://api.d4mdev.click
VITE_API_PREFIX=api
VITE_UPLOADS_PREFIX=uploads
VITE_ADMIN_URL=https://api.d4mdev.click/admin
```

Then:
1. (Optional) Add your own custom domain to the Vercel project (CNAME as instructed by Vercel).
2. Put the **Vercel origin** into the backend's `CORS_ORIGINS` (comma-separated, no trailing slash) and restart the API.
3. `vercel.json` already rewrites every path to `index.html` so client-side routes like `/p/12` and `/u/linh.tran` survive a refresh.

> `VITE_*` values are **public** by definition — they are baked into the bundle. Never put a secret in them.

---

## 6a-2. Biến môi trường cho video & Reels

Thêm vào `backend/.env` (đã có sẵn trong `.env.example`):

```env
# Tệp video cho Reels — Termux không có ffmpeg nên backend tự đọc atom mvhd
MAX_VIDEO_SIZE_MB=60
MAX_VIDEO_DURATION_SECONDS=60
ALLOWED_VIDEO_MIME_TYPES=video/mp4,video/webm,video/quicktime

# Nhạc nền không bắt buộc (phát đồng bộ ở client, không mux)
MAX_AUDIO_SIZE_MB=10
ALLOWED_AUDIO_MIME_TYPES=audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav
```

**Lưu ý về Cloudflare Tunnel và video**

* Cloudflare Tunnel free **không giới hạn dung lượng cứng**, nhưng video 60 MB tải qua 4G
  sẽ chậm — khuyến nghị thực tế là giữ clip 10–20 giây (≈3–8 MB) cho Reels.
* `/uploads` đã bật `Accept-Ranges: bytes` (và `acceptRanges: true` trong `express.static`)
  nên thanh tua của `<video>` hoạt động; Cloudflare giữ nguyên header này.
* Nếu sau này bật **Cache Rules** cho `/uploads/*`, chỉ cache ảnh — đừng cache video:
  sẽ tốn băng thông tải lại và dễ trả bản cũ.

## 6a-3. PWA trên Vercel

`frontend/vercel.json` đã cấu hình sẵn; chỉ cần deploy như bình thường:

| Đường dẫn | Header |
| --- | --- |
| `/sw.js` | `Cache-Control: public, max-age=0, must-revalidate` + `Service-Worker-Allowed: /` |
| `/manifest.webmanifest` | `Content-Type: application/manifest+json` |
| `/assets/(.*)` | `max-age=31536000, immutable` (tên tệp có hash) |

**Kiểm tra sau khi deploy**

```bash
curl -sI https://ins-clone-v1.vercel.app/sw.js | grep -i cache-control   # phải là max-age=0
curl -s  https://ins-clone-v1.vercel.app/manifest.webmanifest | head -3
```

Trên Android: mở bằng Chrome → menu ⋮ → **Thêm vào màn hình chính** (hoặc bấm nút
"Cài đặt ứng dụng" mà app tự hiện). Trên iOS: Safari → Chia sẻ → **Thêm vào màn hình chính**
(iOS không hỗ trợ `beforeinstallprompt`, nút này sẽ tự ẩn).

Nhớ đổi `CACHE_VERSION` trong `frontend/public/sw.js` mỗi lần sửa service worker —
nếu không, máy người dùng vẫn chạy bản SW cũ.

## 6d. Biến môi trường trên Vercel (BẮT BUỘC)

Vite **nhúng cứng** biến `VITE_*` vào bundle lúc build. Nếu thiếu, app sẽ gọi
`/api/...` **của chính nó** (tức `https://<tên-app>.vercel.app/api/...`) và nhận về
`index.html` thay vì JSON → mọi request đều lỗi.

Vào **Vercel → Project → Settings → Environment Variables**, thêm đủ 7 biến sau
(Environment: *Production, Preview, Development*), rồi **Redeploy**:

| Biến | Giá trị |
| --- | --- |
| `VITE_APP_ORIGIN` | `https://ins-clone-v1.vercel.app` |
| `VITE_API_ORIGIN` | `https://api.d4mdev.click` |
| `VITE_API_PREFIX` | `api` |
| `VITE_UPLOADS_PREFIX` | `uploads` |
| `VITE_ADMIN_URL` | `https://api.d4mdev.click/admin` |
| `VITE_DEFAULT_LOCALE` | `vi` |
| `VITE_SUPPORTED_LOCALES` | `vi,en,zh` |

> ⚠️ **Tuyệt đối không** đặt `SENDER_PASSWORD`, `TELEGRAM_BOT_TOKEN`,
> `CLOUDFLARE_TUNNEL_TOKEN`, `GEMINI_API_KEY` trong Vercel — chúng chỉ thuộc về
> `backend/.env` trên điện thoại. Biến `VITE_*` bị **in thẳng vào file JS** mà ai
> cũng đọc được.

**Cách kiểm tra nhanh sau khi redeploy:**

```bash
# 1. Bundle có biết API thật chưa? (phải thấy domain API của bạn)
curl -s https://ins-clone-v1.vercel.app/assets/$(curl -s https://ins-clone-v1.vercel.app/ | grep -o 'index-[^"]*\.js') | grep -c "api.d4mdev.click"

# 2. Sai thì lệnh này trả về HTML; đúng thì trả JSON
curl -s https://ins-clone-v1.vercel.app/api/health | head -c 60
```

---

## 6e. Thứ tự khởi động đúng (nếu web báo lỗi mạng)

1. **Điện thoại (Termux):** `cd ~/ins-clone-v1/backend && npm start`
   → `concurrently` chạy MariaDB + API + tunnel.
2. Kiểm tra API đã sống: `curl -s https://api.d4mdev.click/api/health`
   → phải là JSON `{"success":true,...}`.
3. Mở web Vercel → đăng nhập.

Nếu `curl` trả **HTTP 530 / `error code: 1033`** nghĩa là DNS trỏ đúng tunnel
nhưng **chưa có connector nào kết nối**. Kiểm tra `CLOUDFLARE_TUNNEL_TOKEN`
trong `backend/.env` (Zero Trust → Networks → Tunnels → connector token) và chạy
`npm run start:tunnel`.

## 6b. Ngôn ngữ (i18n)

Mặc định **tiếng Việt**; tiếng Anh và tiếng Trung là ngôn ngữ phụ.

```env
# backend/.env
DEFAULT_LOCALE=vi
SUPPORTED_LOCALES=vi,en,zh
TELEGRAM_DEFAULT_LOCALE=vi
```

```
# Vercel → Environment Variables (và frontend/.env.local khi dev)
VITE_DEFAULT_LOCALE=vi
VITE_SUPPORTED_LOCALES=vi,en,zh
```

* Trên UI: nút 🌐 ở sidebar / thanh trên / góc màn hình đăng nhập — đổi là đổi ngay, không tải lại trang.
* Trong bot Telegram của admin: `/lang vi`, `/lang en`, `/lang zh`.
* Ngôn ngữ của từng thành viên được lưu ở `User.locale` (xem/sửa trong AdminJS → Ngôn ngữ, hoặc `PATCH /api/auth/me`). Thông báo ảnh mới sẽ theo ngôn ngữ của người đăng.
* Kiểm tra nhanh API có nhận `Accept-Language` không:

```bash
curl -s -H 'Accept-Language: zh-CN,zh;q=0.9' https://api.d4mdev.click/api/auth/config | grep defaultLocale
```

---

## 6c. Trang quản trị `/admin` trên điện thoại

```env
ADMIN_LOCALE=vi                    # giao diện quản trị mặc định tiếng Việt
ADMIN_AVAILABLE_LOCALES=vi,en,zh-CN   # các lựa chọn ở nút 🌐
```

* Truy cập `https://api.d4mdev.click/admin` → đăng nhập bằng `ADMIN_EMAIL` + mật khẩu đã băm trong `ADMIN_PASSWORD_HASH`.
* Đổi ngôn ngữ giao diện quản trị bằng nút 🌐 trên thanh trên (vi · en · zh-CN); lựa chọn được ghi nhớ trong trình duyệt.
* **Dùng trên điện thoại:** `custom-admin.css` đã có sẵn bản mobile — sidebar thành dải chip cuộn ngang, bảng cuộn ngang với cột đầu dính lại, thanh Lưu/Huỷ dính đáy màn hình, nút cao 44 px. Xoay ngang máy để xem bảng rộng hơn.
* Sửa chữ / màu: mở `backend/admin/public/custom-admin.css` bằng `nano`, lưu rồi **F5** — không cần build, không cần khởi động lại server.
* Sửa bản dịch: `backend/admin/locales/adminjs.vi.json` (JSON, giữ nguyên các `{{biến}}` như `{{count}}`, `{{version}}`).
* Kiểm tra nhanh bộ dịch còn phủ đủ khoá của AdminJS sau khi nâng cấp:

```bash
cd backend
curl -s $(node -p "require('adminjs/package.json').version" | sed 's|^|https://unpkg.com/adminjs@|; s|$|/lib/locale/en/translation.json|')   | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const en=JSON.parse(s),vi=require('./admin/locales/adminjs.vi.json');
const f=(o,p='')=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==='object'?f(v,p?p+'.'+k:k):[p?p+'.'+k:k]);
const miss=f(en).filter(k=>!f(vi).includes(k));console.log(miss.length?'THIẾU: '+miss.join(', '):'Đủ khoá ✅')})"
```

---

## 7. Hardening checklist

- [ ] `JWT_SECRET` and `ADMIN_SESSION_SECRET` are 64 hex chars (`openssl rand -hex 32`).
- [ ] `ADMIN_PASSWORD_HASH` set and `ADMIN_PASSWORD` emptied.
- [ ] `CORS_ORIGINS` lists only your real frontend origins.
- [ ] Cloudflare → **Access → Applications**: protect `/admin*` with an e-mail OTP policy (free) so even a leaked password is useless.
- [ ] Cloudflare → SSL/TLS: **Full** (or Full Strict). Never “Flexible”.
- [ ] Cloudflare → Speed: keep image optimisation off unless you want Cloudflare to resize photos.
- [ ] `DB_SYNC=none` after the schema is settled (switches Sequelize from auto-`alter` to migrations).
- [ ] Nightly backup: `npm run db:backup` (add a `termux-job-scheduler` or cron entry) **and** rsync `backend/uploads/` to SD card / cloud.
- [ ] Set the phone's lock-screen to something you trust; the device holds the entire archive.

---

## 8. Maintenance

```bash
npm run db:backup                       # gzip dump into backend/backups/ (keeps 14)
tail -f $PREFIX/var/log/mysqld.log      # MariaDB log
cloudflared tunnel info pixgram-api  # tunnel status (runs from any shell)
curl -s https://api.d4mdev.click/api/health | head
```

**Freeing space** (a phone fills up fast):

```bash
du -sh backend/uploads                 # how big is the archive?
du -sh $PREFIX/var/lib/mysql           # how big is the DB?
```

Move the archive to external storage via `.env`: `UPLOAD_DIR=/storage/emulated/0/PixGram/uploads` — the static guard and multer both read the same env value, so nothing else changes.

---

## 9. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `api.d4mdev.click` trả **530 / error 1033** | Tunnel chưa có connector: thiếu `CLOUDFLARE_TUNNEL_TOKEN` trong `backend/.env`, hoặc `npm run start:tunnel` chưa chạy |
| Web Vercel tải được nhưng mọi request lỗi JSON | Thiếu `VITE_API_ORIGIN` trên Vercel → app gọi `/api` của chính nó. Thêm đủ 7 biến ở §6d rồi **Redeploy** |
| Nút "Trang quản trị" không hiện | `VITE_ADMIN_URL` chưa đặt (nút tự ẩn khi chưa cấu hình) |
| Reels báo 422 "Video dài …" | Clip vượt `MAX_VIDEO_DURATION_SECONDS`. Cắt ngắn lại, hoặc tăng biến trong `.env` rồi `npm run start:api`. |
| Video không tự phát trong Reels | Trình duyệt chặn autoplay khi **có tiếng** — app mở ở chế độ tắt tiếng, bấm biểu tượng loa để bật. Trên iOS cần thao tác chạm trước lần phát đầu. |
| Nút "Cài đặt ứng dụng" không hiện | PWA chỉ cài được khi chạy trên HTTPS (Vercel) và **không** phải chế độ riêng tư. iOS không hỗ trợ `beforeinstallprompt` — dùng Safari → Chia sẻ → Thêm vào màn hình chính. |
| Sau khi sửa SW mà máy vẫn chạy bản cũ | Quên đổi `CACHE_VERSION` trong `sw.js`. Đổi rồi deploy lại (DevTools → Application → Service Workers → Update). |
| `ECONNREFUSED 127.0.0.1:3306` then it recovers | normal on a cold start: the API retries for ~30 s while `mysqld_safe` boots |
| `ER_ACCESS_DENIED_ERROR` | run `npm run db:init`; check `DB_USER`/`DB_PASSWORD`; the user is created with `mysql_native_password`-compatible auth |
| `EADDRINUSE :4000` | an old `node server.js` is alive: `pkill -f server.js` |
| Tunnel up but `502` | cloudflared started before the API finished booting — `start-tunnel.sh` already waits for `/api/health`; check `PORT` matches `config.yml` |
| Images 403 from the app | the guard rejects non-whitelisted extensions: uploads must be jpg/png/webp/gif |
| `Blocked request. This host is not allowed` (Vite) | `server.allowedHosts: true` is already set in `vite.config.js` |
| CORS error in the browser console | add the exact origin (scheme + host, no trailing slash) to `CORS_ORIGINS` and restart |
| AdminJS shows a blank page | open DevTools: a stale `custom-admin.css` or a CSP added by a proxy broke the bundle; clear the cache and re-check nothing else sets `Content-Security-Policy` on `/admin` |
| Telegram silent | token/chat id wrong, or the bot was blocked; `/status` in the chat should print the uptime |
| Thông báo Telegram sai ngôn ngữ | kiểm tra `/lang` trong chat và cột **Ngôn ngữ** của thành viên trong AdminJS (thông báo theo ngôn ngữ người đăng) |
| UI hiện tiếng Anh dù muốn tiếng Việt | `localStorage.pixgram.locale` cũ trong trình duyệt; bấm 🌐 chọn lại, hoặc đặt `VITE_DEFAULT_LOCALE=vi` trên Vercel rồi redeploy |
| `/admin` hiện tiếng Anh | `ADMIN_LOCALE=vi` trong `.env` rồi khởi động lại API; nếu chỉ vài chỗ lẻ vẫn tiếng Anh, bấm 🌐 chọn *Tiếng Việt* (AdminJS nhớ theo `localeDetection`) hoặc thêm khoá vào `admin/locales/adminjs.vi.json` |
| CSS tuỳ chỉnh không thấy tác dụng | kiểm tra `GET /admin/assets/custom-admin.css` trả 200; DevTools → Network xem file có bị cache (Ctrl-Shift-R) và selector `data-css` có đúng với phiên bản AdminJS đang dùng |
| `/admin/login` trả **500** (trang đăng nhập vẫn hiện) | AdminJS bị mount **sau** `express.json()` → `WrongArgumentError`. Trong `server.js`, AdminJS phải đứng trước `applyParsers()`. `npm run boot:check` phát hiện lỗi này |
| `ERR_PACKAGE_PATH_NOT_EXPORTED` khi khởi động (`@adminjs/express` / `@adminjs/sequelize`) | hai gói này là **ESM-only**; phải nạp bằng `import()` động trong `admin/adminjs.config.js`, không dùng `require()` |
| `TypeError: Class extends value undefined` khi khởi động | `connect-session-sequelize` cần `session.Store` (không phải `session.session`) |
| `AdminJS.registerAdapter is not a function` | `require('adminjs')` trả **namespace**: lấy lớp thật qua `AdminJSModule.AdminJS ?? AdminJSModule.default` |
| `/admin` trả **503** với trang hướng dẫn | chế độ suy giảm an toàn: AdminJS không nạp được nhưng API và ảnh vẫn chạy. Đọc lý do ngay trên trang đó rồi `cd backend && npm install` |
| `npm run mail:test` báo "Đăng nhập SMTP thất bại" | dùng **mật khẩu ứng dụng 16 ký tự** (myaccount.google.com/apppasswords), tài khoản gửi phải đã bật xác thực 2 bước; Gmail: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false` |
| Đăng ảnh được nhưng **không nhận email báo** | `EMAIL_ENABLED=false`, hoặc `EMAIL_NOTIFY_NEW_PHOTO=false`, hoặc `NOTIFY_EMAIL` trống. Kiểm tra `/api/health` → `email.ready` (true = SMTP đã đăng nhập) |
| Email thông báo rơi vào **Spam** | bình thường khi gửi qua Gmail bằng máy chủ cá nhân: đánh dấu "Không phải spam" một lần, hoặc thêm địa chỉ gửi vào danh bạ người nhận |
| Link mời báo "không dùng được" | hết hạn sau `INVITE_TTL_DAYS` (mặc định 7) hoặc đã dùng (mỗi lời mời chỉ dùng **một lần**). Tạo lời mời mới trong `/admin` → **Lời mời** |
| Quên mật khẩu: thư không tới | kiểm tra Spam; xác nhận `EMAIL_ENABLED=true` và `npm run mail:test`; link hết hạn sau `RESET_TOKEN_TTL_MINUTES` (mặc định 30 phút) |
| Phone freezes mid-upload | lower `MAX_UPLOAD_SIZE_MB`, keep the app foregrounded, and add the Termux battery exception |

---

## 10. Cost & limits

| Component | Cost |
| --- | --- |
| Cloudflare Tunnel + DNS | free |
| Vercel Hobby | free (100 GB bandwidth/month — plenty for a community app) |
| Telegram Bot API | free |
| Phone + electricity | ~1–3 W |
| MariaDB on ARM64 | ~250 MB RAM, a few hundred MB of storage per 1 000 photos |

A two-tier upgrade path when the phone gets full: move `uploads/` and MariaDB to a Raspberry Pi 5 (same scripts, same `.env`) — the code does not change.
