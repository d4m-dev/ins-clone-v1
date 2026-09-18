# 📷 PixGram — chia sẻ ảnh cộng đồng (giao diện kiểu Instagram)

A self-hosted, invite-only Instagram clone: **React + Tailwind** on Vercel, **Node/Express + MariaDB + AdminJS + Telegram bot** on an Android phone (Termux), exposed to the internet through a **Cloudflare Tunnel** on a fixed domain (`api.d4mdev.click`).

**Giao diện mặc định là TIẾNG VIỆT** · English và 中文 là ngôn ngữ phụ, đổi ngay trên UI (`vi` → `en` → `zh`). Cả frontend, thông báo Telegram và lệnh trong bot đều đa ngôn ngữ.

> **No hardcoded secrets. No hardcoded URLs. No hardcoded strings.** Credentials → `.env`; URLs → `config/urls.js`; mọi chuỗi hiển thị → `src/i18n/locales/*.json` (FE) và `i18n/messages.js` (BE).

---

## 1. Live preview (no phone needed)

The repo ships a **dev-only mock API** so you can click through the whole UI on a laptop:

```bash
cd tools && node demo-api.js        # mock backend on :4000  (users: minh.nguyen · linh.tran · bao.long · su.ha, any password)
cd frontend && npm install && npm run dev   # UI on :5173 → proxies /api & /uploads to :4000
```

Sign in with `minh.nguyen` + any password to unlock upload / like / comment / profile / delete.

The mock serves the **full** media contract, so everything is clickable offline:

* `/reels` — two seeded video posts (`demo-images/demo-clip.mp4`, 5.76 s) with views & download
* stories ring on the feed — 3 items inside the 24-hour window, grouped by author
* `GET /api/posts/:id/download` — friendly filename, and `Range` requests work on `/uploads/*`

`tools/` is **not** part of production — delete it before deploying if you prefer.

---

## 2. Architecture

```
                      ┌──────────────────────────── Vercel ────────────────────────────┐
   Browser  ──────────┤  React 18 + Vite + Tailwind (Instagram-identical UI)           │
                      │  config/urls.js  →  API_BASE / UPLOADS_BASE / ROUTES           │
                      └───────────────┬───────────────────────────────────────────────┘
                                      │  HTTPS  (CORS allow-list from CORS_ORIGINS)
                        ┌─────────────▼──────────────┐
                        │  Cloudflare edge           │
                        │  api.d4mdev.click          │
                        └─────────────┬──────────────┘
                                      │ cloudflared tunnel (QUIC, outbound only —
                                      │ no open router ports needed)
   ┌──────────────────────────────────▼────────────────────────────────────────────────┐
   │  Android · Termux · Snapdragon 8 Elite Gen 5                                      │
   │                                                                                   │
   │   `npm start`  =  concurrently ─┬─ mysqld_safe            (process "DB")          │
   │                                 ├─ node server.js         (process "API")         │
   │                                 └─ cloudflared tunnel run  (process "TUNNEL")      │
   │                                                                                   │
   │   server.js (ONE process)                                                         │
   │    ├── express app                                                                │
   │    │     ├── /uploads   hardened static files (raster-only, no listing)           │
   │    │     ├── /api       auth · posts · comments · likes · users                   │
   │    │     └── /admin     AdminJS  (+ /admin/assets/custom-admin.css)               │
   │    ├── sequelize ⇄ MariaDB (models: User, Post, Comment, Like)                    │
   │    └── node-telegram-bot-api (polling) → notifies the admin on every upload       │
   └───────────────────────────────────────────────────────────────────────────────────┘
```

**Two URL chokepoints (by design)**

| Where | File | What it holds |
| --- | --- | --- |
| Backend | `backend/config/urls.js` | `base`, `api.*`, `uploads.*`, `admin.*`, `frontend.*` deep links |
| Frontend | `frontend/config/urls.js` | `API_BASE`, `ENDPOINTS.*`, `UPLOADS_BASE`, `ROUTES.*` |

Switching to another domain = edit `.env` (backend) + Vercel env vars (frontend). **Zero code changes.**

---

## 3. Directory structure

```
pixgram/
├── backend/                              # Termux (Ubuntu/ARM64) — one process
│   ├── server.js                         # entry: Express + AdminJS + static + Telegram
│   ├── package.json                      # concurrently 1-click scripts
│   ├── .env.example                      # ⬅ EVERY credential & URL
│   ├── config/
│   │   ├── env.js                        # the ONLY file reading process.env
│   │   ├── urls.js                       # ⬅ the ONLY file with URLs/paths
│   │   └── database.js                   # Sequelize instance + connect-with-retry
│   ├── models/
│   │   ├── index.js                      # associations, CASCADE rules, counter hooks
│   │   ├── User.js  Post.js  Comment.js  Like.js
│   │   └── Invite.js                     # 🎟️  lời mời có hạn (chỉ lưu SHA-256 của token)
│   ├── controllers/
│   │   ├── auth.controller.js            # đăng ký (kèm lời mời) · quên/đặt lại mật khẩu
│   │   ├── post.controller.js  comment.controller.js
│   │   └── invite.controller.js          # tạo / thu hồi / tra cứu lời mời (admin)
│   ├── routes/
│   │   ├── index.js                      # mounts everything under urls.prefix.api
│   │   ├── invite.routes.js              # /api/invites (admin trước, public /:token sau)
│   │   └── auth · post · user · comment · reel · story .routes.js
│   ├── middleware/
│   │   ├── auth.middleware.js            # JWT verify · optional/required/admin guards
│   │   ├── upload.middleware.js          # multer: random filenames, MIME whitelist, size cap
│   │   ├── static.middleware.js          # ⬅ /uploads hardening (traversal, extensions, CSP)
│   │   ├── validate.middleware.js        # express-validator → 422 envelope
│   │   └── error.middleware.js           # 404 + normalised errors + orphan-file cleanup
│   ├── services/
│   │   ├── storage.service.js            # disk I/O, safe path resolution, stats
│   │   ├── mailer.service.js             # 📧 SMTP Gmail — gửi nền, không bao giờ ném lỗi
│   │   ├── email.templates.js            # 4 mẫu thư × 3 ngôn ngữ (ảnh mới · mời · mật khẩu · chào mừng)
│   │   └── telegram.service.js           # bot đa ngôn ngữ: /start /id /status /lang
│   ├── admin/
│   │   ├── adminjs.config.js             # ⬅ AdminJS resources + custom CSS injection
│   │   ├── locales/
│   │   │   ├── adminjs.vi.json           # ⬅ bộ dịch tiếng Việt đầy đủ cho khung AdminJS
│   │   │   └── index.js                  # buildAdminLocale() — vi · en · zh-CN
│   │   └── public/custom-admin.css       # ⬅ UI override (brand + mobile + text-swap), no build step
│   ├── i18n/
│   │   ├── messages.js                   # ⬅ chuỗi vi · en · zh cho bot Telegram + log
│   │   └── index.js                      # t() và tPlural() (số ít / số nhiều)
│   ├── utils/  (logger, ApiError, asyncHandler, locale, mp4Duration, tokens)
│   ├── scripts/
│   │   ├── start-mariadb.sh  start-tunnel.sh     # the two concurrently partners
│   │   ├── init-database.sh  backup-database.sh  backup-uploads.sh  backup-all.sh
│   │   ├── setup-cloudflared.sh  bootstrap-termux.sh
│   │   ├── health-check.sh                       # hỏi thẳng /api/health
│   │   ├── doctor.js                             # 🩺 khám máy chủ (chỉ đọc)
│   │   ├── mail-test.js                          # thử SMTP thật
│   │   └── hash-password.js                      # bcrypt hash for ADMIN_PASSWORD_HASH
│   └── uploads/                          # 📁 photos live here (git-ignored)
│       ├── posts/   avatars/
│
├── frontend/                             # Vercel — React 18 + Vite + Tailwind
│   ├── config/urls.js                    # ⬅ the ONLY file with URLs
│   ├── config/paths.js                   # /api · /uploads prefixes
│   ├── vite.config.js                    # dev proxy /api,/uploads + allowedHosts
│   ├── vercel.json                       # SPA rewrites + security headers
│   ├── tailwind.config.js                # Instagram palette & animations
│   └── src/
│       ├── App.jsx                       # routes + <RequireAuth>
│       ├── api/client.js                 # the ONLY module performing fetch()
│       ├── i18n/                         # ⬅ đa ngôn ngữ (vi mặc định, en/zh phụ)
│       │   ├── locales/vi.json en.json zh.json
│       │   ├── config.js                 # danh sách locale + lưu lựa chọn
│       │   ├── translate.js              # t() · tPlural() · định dạng số/thời gian
│       │   └── I18nContext.jsx           # useI18n() hook
│       ├── context/AuthContext.jsx       # JWT session, 401 auto-logout
│       ├── hooks/useFeed.js              # pagination + optimistic like/comment/delete
│       ├── components/                   # Layout · PostCard · CommentSection · StoriesBar · StoryViewer
│       │                                 # PhotoViewer (zoom + slideshow) · InstallPrompt · LanguageSwitcher · Avatar · Icons · States
│       ├── pages/                        # Feed · Reels · Explore · Upload · Profile · Post
│       │                                 # Login · Register · Quên mật khẩu · Đặt lại mật khẩu · Mời thành viên
│       ├── pwa/useInstallPrompt.js       # beforeinstallprompt + trạng thái mạng + đăng ký SW
│       ├── public/manifest.webmanifest   # PWA: tên, icon, shortcut Đăng ảnh / Reels
│       ├── public/sw.js                  # service worker (shell + cache-first assets)
│       ├── public/icons/                 # icon 192/512 + maskable + apple-touch (sinh bằng Pillow)
│       └── utils/
│           ├── format.js                 # "3 h", "1.2k", …
│           └── imageCompress.js          # 🖼️ nén ảnh trên trình duyệt trước khi gửi
│
├── tools/                                # dev-only: xem trước + kiểm thử (không triển khai)
│   ├── demo-api.js                       # mock REST API (không cần thư viện nào)
│   ├── demo-images/                      # ảnh mẫu
│   ├── check-all.sh                      # ⬅ MỘT lệnh chạy toàn bộ kiểm thử
│   ├── boot-check.sh                     # bật server thật rồi dò 29 điểm
│   ├── _smoke_api.js                     # 57 phép thử API
│   ├── _smoke_email.js                   # 24 phép thử nội dung email
│   ├── _smoke_compress.js                # 23 phép thử bộ nén ảnh
│   └── check-wording.sh                  # ⬅ chốt chặn: không còn chữ về gia đình
├── .github/workflows/ci.yml              # chạy toàn bộ kiểm thử mỗi lần push
└── README.md · docs/DEPLOYMENT.md · docs/OPERATIONS.md · docs/ENV-SECRETS.md
    · docs/MIGRATION-PIXGRAM.md
```

---

## 4. Configuration

### `backend/.env.example` → copy to `backend/.env`

```env
NODE_ENV=production
PORT=4000
HOST=0.0.0.0
CORS_ORIGINS=https://ins-clone-v1.vercel.app

PUBLIC_BASE_URL=https://api.d4mdev.click     # tunnel hostname (backend)
FRONTEND_BASE_URL=https://ins-clone-v1.vercel.app

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=pixgram
DB_USER=pixgram
DB_PASSWORD=change_me_db_password
DB_DIALECT=mariadb
DB_LOGGING=false

JWT_SECRET=replace_with_64_random_hex_chars         # openssl rand -hex 32
JWT_EXPIRES_IN=30d
BCRYPT_SALT_ROUNDS=10
FIRST_USER_IS_ADMIN=true

ADMIN_EMAIL=admin@d4mdev.click
ADMIN_PASSWORD_HASH=                                # npm run admin:passwd
ADMIN_PASSWORD=change_me_admin_password
ADMIN_COOKIE_NAME=pixgram.admin
ADMIN_SESSION_SECRET=replace_with_another_64_random_hex_chars

UPLOAD_DIR=uploads
MAX_UPLOAD_SIZE_MB=15
ALLOWED_MIME_TYPES=image/jpeg,image/png,image/webp,image/gif
IMAGE_FILENAME_BYTES=16

RATE_LIMIT_WINDOW_MINUTES=15
RATE_LIMIT_MAX=300
AUTH_RATE_LIMIT_MAX=20
UPLOAD_RATE_LIMIT_MAX=30

TELEGRAM_BOT_TOKEN=123456789:AAExampleTokenFromBotFather
TELEGRAM_ADMIN_CHAT_ID=123456789
TELEGRAM_ENABLED=true
TELEGRAM_SEND_PHOTO=true

CLOUDFLARE_TUNNEL_NAME=pixgram-api
CLOUDFLARE_HOSTNAME=api.d4mdev.click
```

*(The real `.env.example` in the repo also documents MariaDB socket/data-dir paths for Termux and the tunnel config path.)*

### `frontend/.env.example` → copy to `.env.local`, and set the same keys in Vercel

```env
VITE_APP_ORIGIN=https://ins-clone-v1.vercel.app
VITE_API_ORIGIN=https://api.d4mdev.click   # leave EMPTY for same-origin (dev proxy)
VITE_API_PREFIX=api
VITE_UPLOADS_PREFIX=uploads
VITE_ADMIN_URL=https://api.d4mdev.click/admin
VITE_DEV_PROXY_TARGET=http://127.0.0.1:4000   # only used by `npm run dev`
```

### `backend/config/urls.js` (shape)

```js
const BASE = env.urls.publicBaseUrl;               // https://api.d4mdev.click
const API_PREFIX = '/api';

module.exports = {
  base: BASE,
  frontendBase: env.urls.frontendBaseUrl,
  local: { base: `http://127.0.0.1:${env.server.port}` },

  prefix: { api: '/api', uploads: '/uploads', admin: '/admin', adminAssets: '/admin/assets' },

  api: {
    base:        join(BASE, '/api'),
    health:      join(BASE, '/api', 'health'),
    auth:   { register: …, login: …, me: … },
    posts:  { list: …, create: …, byId: (id) => … , like: (id) => …, comments: (id) => … },
    users:  { byId: (id) => …, posts: (id) => … },
  },

  uploads: { route: '/uploads', base: join(BASE, '/uploads'), absolute: (f) => join(BASE, '/uploads', f) },
  admin:   { dashboard: join(BASE, '/admin'), customCssRoute: '/admin/assets/custom-admin.css' },
  frontend:{ home: …, post: (id) => …, profile: (username) => … },   // Telegram deep links
};
```

---

## 4b. Đa ngôn ngữ (i18n) — Tiếng Việt là chính, English + 中文 là phụ

### Bật/tắt & cấu hình

| Nơi | Biến | Mặc định |
| --- | --- | --- |
| `frontend/.env.local` + Vercel | `VITE_DEFAULT_LOCALE` | `vi` |
| `frontend/.env.local` + Vercel | `VITE_SUPPORTED_LOCALES` | `vi,en,zh` |
| `backend/.env` | `DEFAULT_LOCALE` | `vi` |
| `backend/.env` | `SUPPORTED_LOCALES` | `vi,en,zh` |
| `backend/.env` | `TELEGRAM_DEFAULT_LOCALE` | `vi` |

### Frontend

```jsx
// Bất kỳ component nào
import { useI18n } from '../i18n';

const { t, count, timeAgo, locale, setLocale, languages } = useI18n();

t('feed.empty.title')                              // "Chưa có ảnh nào"
t('post.likes', { count: 3, total: count(3) })     // "3 lượt thích" / "3 likes" / "3 个赞"
count(1200)                                        // "1,2 N" / "1.2K" / "1.2万"
timeAgo(post.createdAt)                            // "3 giờ trước" / "3 hours ago" / "3小时前"
```

* **Phát hiện ngôn ngữ**: `localStorage` → `navigator.languages` → `VITE_DEFAULT_LOCALE` (vi).
  Lựa chọn được lưu lại, `<html lang>` + `<html dir>` được cập nhật tự động.
* **Số ít / số nhiều**: `Intl.PluralRules`; tiếng Việt và tiếng Trung không biến đổi hình thái nên chỉ cần khoá `other`.
* **Định dạng số & thời gian**: `Intl.NumberFormat` / `Intl.RelativeTimeFormat` — không hardcode chuỗi tiếng Anh.
* **Đổi ngôn ngữ ở đâu**: nút 🌐 ở sidebar (desktop), thanh trên (mobile) và góc màn hình đăng nhập/đăng ký — component `LanguageSwitcher`.
* **Gửi kèm mỗi request**: header `Accept-Language: <locale>` để backend trả lỗi/validation đúng ngôn ngữ và lưu vào `User.locale`.
* Thêm ngôn ngữ mới: sao chép `src/i18n/locales/en.json` → `xx.json`, thêm vào `LOCALES` (`src/i18n/config.js`) + `SUPPORTED_LOCALES`. Không cần sửa component nào.

### Backend

```js
const { t, tPlural } = require('./i18n');

t('vi', 'newPhoto.title')                       // 📸 Ảnh mới trên bảng tin cộng đồng
tPlural('en', 'newPhoto.likes', 3)              // "3 likes"   (1 → "1 like")
t('zh', 'bot.chatId', { chatId: 123456 })       // 你的聊天 id：123456
```

* `utils/locale.js` phát hiện ngôn ngữ theo thứ tự: `Accept-Language` → `User.locale` → `?lang=` → `TELEGRAM_DEFAULT_LOCALE` → `vi`. Middleware gắn `req.locale` cho mọi request.
* `User.locale` ghi nhớ ngôn ngữ của từng thành viên (hiển thị được trong AdminJS, sửa được ở `PATCH /api/auth/me`).
* **Bot Telegram đa ngôn ngữ**: thông báo ảnh mới dùng ngôn ngữ của **người đăng**; admin đổi ngôn ngữ thông báo bằng `/lang en` hoặc `/lang zh` ngay trong chat (mặc định `vi`). Kèm lệnh `/id`, `/status`, `/help`.
* Thiếu khoá ở ngôn ngữ phụ → tự động lùi về `en` rồi `vi`, không bao giờ hiện chuỗi rỗng.

### Trang quản trị AdminJS — đã Việt hoá 100% khung giao diện

AdminJS v7 chỉ phát hành sẵn **9 gói ngôn ngữ** (`de en es it ja pl pt-BR ua zh-CN`) — **không có tiếng Việt**. Vì vậy PixGram tự cung cấp bộ dịch đầy đủ và dùng cơ chế `locale.translations` chính thức:

| Tầng | Tệp | Phụ trách |
| --- | --- | --- |
| **1. Bản dịch** (chính) | `admin/locales/adminjs.vi.json` | 103/103 khoá giao diện: `actions` · `buttons` · `labels` · `properties` · `resources` · `components` · `messages` → nút **Lưu / Huỷ / Xoá / Lọc / Áp dụng**, bảng, bộ lọc, thông báo, trang đăng nhập, khu vực kéo–thả tệp |
| **2. CSS override** (bổ trợ) | `admin/public/custom-admin.css` | thương hiệu, bố cục, **bản mobile**, và công cụ `::after` để thay chuỗi cứng |

```js
// admin/adminjs.config.js
const { buildAdminLocale } = require('./locales');

locale: buildAdminLocale({
  language: env.admin.locale,                    // ADMIN_LOCALE=vi
  availableLanguages: env.admin.availableLocales // ADMIN_AVAILABLE_LOCALES=vi,en,zh-CN
}),
```

* Nút 🌐 trên thanh trên cho phép đổi giữa **Tiếng Việt / English / 中文** ngay trong `/admin`; lựa chọn được ghi nhớ (`localeDetection: true`).
* Nhãn tên ngôn ngữ luôn hiện dạng bản địa (`Tiếng Việt`, `中文`) nhờ ghi đè `components.LanguageSelector.availableLanguages`.
* Dịch thêm/sửa chữ: sửa trực tiếp `adminjs.vi.json` (không cần restart — chỉ cần tải lại trang) hoặc thêm khoá mới vào nhóm tương ứng.
* Thêm ngôn ngữ thứ tư: tạo `adminjs.xx.json`, khai báo trong `admin/locales/index.js` → `ADMIN_AVAILABLE_LOCALES`.

**CSS override hoạt động thế nào** (tài liệu AdminJS từ v6.4): mỗi phần tử có `data-css="{resource}-{action}-{container}"`, ví dụ `[data-css="posts-edit-form"]`, cộng các hook cố định `sidebar`, `sidebar-logo`, `topbar`, `table`, `button`, `login`. `custom-admin.css` dùng đúng quy ước đó, chia 5 phần:

1. Biến thiết kế + typography tiếng Việt (không tải webfont → chạy tốt cả khi offline).
2. Thương hiệu: sidebar gradient, nút bo tròn, bảng sọc hồng nhạt, trang đăng nhập.
3. **Bản điện thoại** — sidebar dọc thành dải chip cuộn ngang, bảng cuộn ngang với cột đầu dính, thanh hành động dính đáy, nút cao 44 px cho ngón tay.
4. **Công cụ Việt hoá bằng CSS** (`font-size: 0` + `::after`) — đang bật sẵn 4 chỗ an toàn (nút đăng nhập, nút Lưu, nút “Thêm mới”, ẩn huy hiệu *Made with love*), kèm mẫu bỏ-comment để đổi bất kỳ nhãn nào khác mà không sửa code.
5. Dashboard, badge, thanh cuộn, chế độ in.

> Vì sao vẫn cần tầng CSS khi đã có bản dịch? Bản dịch chỉ phủ những chuỗi AdminJS **có khoá i18n**; CSS là lưới an toàn cho chuỗi render cứng trong component, đồng thời lo những thứ i18n không làm được: màu sắc, bố cục, hành vi trên màn hình nhỏ.

---

## 5. `backend/package.json` — the 1-click startup

```json
"scripts": {
  "start": "concurrently -k -p \"[{name}]\" -n \"DB,API,BOT-TUNNEL\" -c \"magenta,green,cyan\" \"npm:start:db\" \"npm:start:api\" \"npm:start:tunnel\"",
  "start:db":     "bash scripts/start-mariadb.sh",
  "start:api":    "node server.js",
  "start:tunnel": "bash scripts/start-tunnel.sh",
  "db:init":      "bash scripts/init-database.sh",
  "db:backup":    "bash scripts/backup-database.sh",
  "tunnel:install": "bash scripts/setup-cloudflared.sh",
  "bootstrap:termux": "bash scripts/bootstrap-termux.sh",
  "admin:passwd": "node scripts/hash-password.js",

  "smoke":       "node ../tools/_smoke_api.js",      // 57 phép thử API trên SQLite tạm
  "smoke:email": "node ../tools/_smoke_email.js",    // 24 phép thử nội dung email vi/en/zh
  "boot:check":  "bash ../tools/boot-check.sh",      // bật thử server rồi tự kiểm tra 29 điểm
  "mail:test":   "node scripts/mail-test.js",        // kiểm tra SMTP thật + gửi 1 email thử
  "health":      "bash scripts/health-check.sh"
}
```

`npm start` therefore launches, in one command:

| Process | Command | Notes |
| --- | --- | --- |
| **DB** | `mysqld_safe` (via `start-mariadb.sh`) | idempotent — waits if MariaDB is already up; auto-inits the datadir on first run |
| **API** | `node server.js` | Express + Sequelize + **AdminJS** + **Telegram bot**, all in one process |
| **TUNNEL** | `cloudflared tunnel run <name>` | waits until `/api/health` answers, then exposes `api.d4mdev.click` |

`-k` means Ctrl-C tears everything down together (with a graceful shutdown in `server.js`).

### Bốn lệnh kiểm tra — chạy trước khi tin tưởng một thay đổi

| Lệnh | Kiểm tra gì | Cần gì |
| --- | --- | --- |
| `npm run smoke` | 57 phép thử API thật: đăng ký/đăng nhập, đăng ảnh + video, Reels, Stories, lượt xem, tải về, chặn path-traversal, **lời mời**, **quên/đặt lại mật khẩu**, thông báo đa ngôn ngữ | không (tự dùng SQLite tạm) |
| `npm run smoke:chat` | 74 phép thử **chat 1-1** trên API thật + SQLite: một hội thoại cho mỗi cặp, tin nhắn chờ, đếm chưa đọc, "Đã xem", phân trang tin cũ, ảnh/bài viết chia sẻ, thu hồi tin, ẩn hội thoại, chặn người ngoài, kênh SSE | không |
| `npm run smoke:email` | 24 phép thử nội dung email: đủ 3 ngôn ngữ, nội suy biến, chống XSS trong chú thích, link trong nút bấm | không |
| `npm run boot:check` | bật server thật rồi dò 29 điểm: `/admin/login` đăng nhập được (đúng thứ tự middleware!), custom CSS được nhúng, 5 bảng AdminJS, `tokenHash` bị ẩn, schema đủ cột | không |
| `npm run mail:test` | đăng nhập SMTP thật + gửi 1 email thử tới `NOTIFY_EMAIL` | Gmail đã cấu hình |
| `npm run doctor` | khám máy chủ: `.env` thiếu khoá nào, quyền tệp, dung lượng `uploads`, chỗ trống đĩa, pin, cổng 3306/4000, kết nối MariaDB — **chỉ đọc, không sửa** | chạy được trên Termux |
| `npm run health` | gọi thẳng `/api/health` và in ra chỉ số thật (thêm `-- --public` để kiểm tra cả qua tunnel) | máy chủ đang chạy |
| `npm run backup` | sao lưu **cả** database và thư mục ảnh (`db:backup` giữ 14 bản · `backup:uploads` giữ 7 bản) | MariaDB đang chạy |
| `npm run check` | chạy **một lượt tất cả**: cú pháp 44 tệp, 3 bộ smoke, boot-check, build frontend, kiểm tra không lọt `.env` | máy tính (dev) |

> `boot:check` được viết ra sau khi ba lỗi chỉ xuất hiện lúc **khởi động thật** (xem §12).
> `node --check` không bắt được chúng vì nó chỉ đọc cú pháp, không nạp `require`/ESM.

---

## 5b. Trải nghiệm xem ảnh — Reels · Stories · Lightbox · Tải về · PWA

Tất cả đều nằm trong cùng một app React, không thêm dịch vụ nào; backend chỉ thêm
3 route đọc và 2 route phụ (lượt xem, tải về).

### Reels — video dọc (`/reels`)

| Việc | Cách làm |
| --- | --- |
| Đăng video | Trang Upload có tab **Video (Reels)**: chọn clip → client đọc `duration` và **trích khung đầu làm ảnh bìa** bằng `<canvas>` |
| Kiểm tra thời lượng | Backend đọc atom `mvhd` trong MP4 (`utils/mp4Duration.js`) — **không cần ffmpeg**; số client gửi lên chỉ là phương án dự phòng cho WebM/MOV |
| Chặn video quá dài | `MAX_VIDEO_DURATION_SECONDS=60`: vượt → HTTP 422 kèm thông báo đã dịch |
| Nhạc nền | Tệp `audio` tuỳ chọn + `audioTitle`; phát đồng bộ ở client, **không mux lại** (tiết kiệm CPU điện thoại) |
| Dòng video | `IntersectionObserver` chỉ phát clip đang chiếm >60% khung; clip khác tự `pause()` |
| Tương tác | Chạm 1 lần = dừng/phát · chạm đúp = thích (có hiệu ứng tim) · nút tắt/bật tiếng · ↑↓ hoặc `m` trên bàn phím |
| Lượt xem | `POST /api/posts/:id/views` — chỉ đếm **một lần cho mỗi clip trong một phiên** |

### Stories — khoảnh khắc 24 giờ

* Không có bảng dữ liệu riêng: **story = bài đăng trong 24h qua**, gom theo tác giả (`GET /api/stories`).
* Vòng tròn story ở đầu bảng tin; vòng đã xem được lưu ở `localStorage` (`pixgram.seenStories`) nên hết màu gradient.
* Trình xem: thanh tiến trình theo từng mục, tự chuyển sau 5 giây (ảnh) hoặc **đúng thời lượng video**; chạm trái/phải để lùi/tiến, giữ để tạm dừng.
* Hết 24h là tự biến mất — không cần cron dọn dẹp.

### Lightbox + tải về (`PhotoViewer.jsx`)

* Pinch-zoom 2 ngón, chạm đúp để phóng 2.5×, kéo để di chuyển (giới hạn theo tỉ lệ zoom), vuốt ngang để đổi ảnh khi chưa zoom.
* Nút **Tải về** gọi `GET /api/posts/:id/download` → backend trả `Content-Disposition: attachment` với tên `pixgram-{user}-{id}-{ngày}.{ext}`.
* Điều hướng bằng ← → trên bàn phím, `Esc` để đóng; nền tối, khoá cuộn trang khi mở.

### PWA — cài lên màn hình chính

| Thành phần | Ghi chú |
| --- | --- |
| `public/manifest.webmanifest` | `display: standalone`, icon 192/512 + **maskable**, 2 shortcut: Đăng ảnh · Reels |
| `public/sw.js` | HTML: network-first (offline → shell đã lưu) · `/assets/*`: cache-first · `/api/reels|stories|posts`: network-first có lưu tạm · **`/uploads/*` KHÔNG cache** (kho ảnh sẽ phình rất nhanh) |
| `src/pwa/useInstallPrompt.js` | `beforeinstallprompt` → nút "Cài đặt ứng dụng"; theo dõi `appinstalled`, trạng thái ngoại tuyến; đăng ký SW **chỉ ở bản production** |
| `vercel.json` | `sw.js` gửi `Cache-Control: max-age=0, must-revalidate` — nếu không, bản mới không bao giờ tới máy người dùng |
| Icon | Sinh bằng Pillow (`PIL`), gradient tím→hồng→cam + khung máy ảnh, **không cần tài nguyên ngoài** |

Đổi `CACHE_VERSION` trong `sw.js` mỗi khi sửa service worker để buộc người dùng nhận bản mới.

---

## 5c. Email, lời mời & đặt lại mật khẩu

Bốn loại email, tất cả đều có bản **vi / en / zh** và đều chọn ngôn ngữ theo
`locale` của người nhận (`services/email.templates.js`):

| Email | Gửi khi | Tới ai |
| --- | --- | --- |
| **Ảnh mới** | Có ảnh/video mới (cạnh thông báo Telegram) | `NOTIFY_EMAIL` (reply-to = người đăng) |
| **Lời mời** | Quản trị viên tạo lời mời | Người được mời |
| **Đặt lại mật khẩu** | Ai đó bấm "Quên mật khẩu?" | Chủ tài khoản |
| **Chào mừng** | Đăng ký thành công | Thành viên mới |

**Lời mời — vòng đời một liên kết**

```
Quản trị viên  →  POST /api/invites            (AdminJS cũng xem/thu hồi được)
                 →  tạo token 32 byte, CHỈ lưu SHA-256 vào bảng `invites`
                 →  gửi email chứa  <web>/register?invite=<token>
Người được mời →  mở link: giao diện gọi GET /api/invites/:token để chào đúng tên
                 →  đăng ký: backend lấy EMAIL + VAI TRÒ từ lời mời (không tin client)
                 →  lời mời chuyển sang accepted, token hết hiệu lực ngay
```

Hết hạn sau `INVITE_TTL_DAYS` ngày (mặc định 7). Lời mời hết hạn/đã dùng/đã thu hồi
đều trả **410** kèm mã `INVITE_EXPIRED`, nên giao diện báo đúng "link không dùng được"
thay vì để người dùng điền hết form rồi mới lỗi.

**Đặt lại mật khẩu — ba nguyên tắc an toàn**

1. **Không tiết lộ ai có tài khoản.** `POST /auth/forgot-password` luôn trả cùng một
   câu trả lời dù email có tồn tại hay không (chống dò tài khoản).
2. **Token không nằm trong database dạng gốc.** Chỉ SHA-256 được lưu
   (`users.password_reset_hash`), so sánh bằng `timingSafeEqual`, dùng **một lần**,
   hết hạn sau `RESET_TOKEN_TTL_MINUTES` (mặc định 30 phút).
3. **Gửi nền, không chặn request.** SMTP lỗi thì người dùng vẫn thấy luồng bình thường
   (và quản trị viên thấy lý do ở `/api/health` → `email.reason`).

Ba liên kết sâu cần có mặt trong cả hai đầu:

| Liên kết | `backend/config/urls.js` | `frontend/config/urls.js` |
| --- | --- | --- |
| `/register?invite=…` | `routes.register` | `ROUTES.register` |
| `/reset-password?token=…` | `routes.resetPassword` | `ROUTES.resetPassword` |
| `/p/:id` (bài viết) | `routes.post` | `ROUTES.post(id)` |

> Gmail cần **mật khẩu ứng dụng 16 ký tự** (`myaccount.google.com/apppasswords`),
> không phải mật khẩu đăng nhập. Kiểm tra bất cứ lúc nào: `npm run mail:test`.

---

## 5d. Nén ảnh trước khi gửi (tiết kiệm dung lượng)

Ảnh điện thoại 3–7 MB được **thu nhỏ và nén ngay trên trình duyệt** trước khi upload
(`frontend/src/utils/imageCompress.js`) — máy chủ không tốn CPU, và cũng không cần
cài thư viện xử lý ảnh nào trên Termux.

| Quy tắc | Vì sao |
| --- | --- |
| Cạnh dài tối đa **2048 px**, JPEG chất lượng **0.82** | đủ nét trên TV 4K, mà nhẹ hơn 5–8 lần |
| **Không bao giờ phóng to** ảnh nhỏ | nén ảnh 800 px thành 2048 px chỉ làm nặng thêm |
| **GIF động**: bỏ qua | vẽ qua canvas sẽ làm mất chuyển động |
| **PNG**: giữ PNG (chỉ thu nhỏ) | giữ được nền trong suốt; ảnh chụp thường là JPEG nên vẫn nhẹ |
| Ảnh **dưới 300 KB**: gửi thẳng | nén chẳng được bao nhiêu mà lại mất chất lượng |
| Nén xong **nặng hơn** bản gốc → trả lại bản gốc | không bao giờ gửi đi tệp tệ hơn |
| Lỗi bất kỳ → **gửi bản gốc** | nén là tính năng phụ, không được chặn việc đăng ảnh |

Giao diện hiện ngay mức tiết kiệm — *“Ảnh đã nén: 4,2 MB → 760 KB (tiết kiệm 82%)”* — kèm
công tắc **Giữ ảnh gốc** cho những ảnh cần nguyên chất lượng (ảnh scan, ảnh in).

> Đo thực tế: 1.000 ảnh đã nén ≈ 0,6 GB, thay vì 4–6 GB nếu giữ nguyên ảnh máy ảnh.
> Trên chiếc điện thoại vừa chạy máy chủ vừa lưu ảnh, đó là khác biệt giữa “dùng được
> vài năm” và “đầy đĩa sau vài tháng”.

---

## 5e. Mời thành viên trong app

Trang **Mời thành viên** (`/invite`, chỉ quản trị viên thấy nút ở trang Hồ sơ):

1. Nhập email + chọn vai trò **Thành viên** hoặc **Quản trị viên** + lời nhắn (không bắt buộc).
2. Backend tạo lời mời (token 32 byte, chỉ lưu SHA-256) và gửi email cho người được mời.
3. Nếu Gmail lỗi (chưa cấu hình, hết hạn mật khẩu ứng dụng…), giao diện **vẫn hiện link mời**
   kèm nút **Copy link** để bạn gửi qua Zalo/Messenger — không bao giờ bị kẹt.
4. Danh sách bên dưới cho biết lời mời nào *đang chờ · đã tham gia · đã thu hồi*, kèm nút ✕ để thu hồi.

Người được mời mở link → trang đăng ký tự kiểm tra lời mời, hiện *“💌 Bạn có lời mời tham gia”*, điền sẵn email và **khoá ô email** (backend luôn lấy email + vai trò từ lời mời,
không tin dữ liệu gửi lên). Mỗi lời mời dùng được **một lần**, hết hạn sau `INVITE_TTL_DAYS` ngày.

---

## 5f. Chat 1-1 (tin nhắn) — Messenger kiểu Instagram

Hộp thư + khung trò chuyện nằm ở `/messages` (và `/messages/:id` để mở thẳng một
hội thoại từ thông báo/deep-link). Mọi thứ đều yêu cầu đăng nhập.

**Người dùng thấy gì**

| Tính năng | Chi tiết |
| --- | --- |
| Hộp thư | avatar · tên · trích đoạn tin cuối · thời gian · **số tin chưa đọc** (badge đỏ trên thanh điều hướng) |
| Tin nhắn chờ | người chưa từng trò chuyện mà nhắn trước → nằm riêng ở tab "Tin nhắn chờ"; người nhận bấm **Đồng ý** mới vào hộp thư chính (chống spam) |
| Khung chat | bong bóng của mình **bên phải nền xanh**, của người kia **bên trái nền xám**; gom theo ngày ("Hôm nay", "Hôm qua", 12 tháng 9) |
| Đã xem | dưới tin cuối của mình hiện "Đã xem · 2 phút" khi người kia đã mở hội thoại |
| Đang nhập… | ba chấm nhảy khi người kia đang gõ (tối đa 1 tín hiệu / 2,5 giây, **không ghi database**) |
| Gửi được | chữ · **ảnh** (nén ngay trong trình duyệt trước khi gửi) · video ngắn · **emoji** · **bài viết chia sẻ** (hiện thành thẻ có ảnh thu nhỏ) |
| Cuộn lên | tự tải thêm tin cũ hơn theo trang (`CHAT_PAGE_SIZE`, mặc định 30), giữ nguyên vị trí đang đọc |
| Thu hồi | giữ chuột/chuột phải vào tin của mình → "Thu hồi tin nhắn" (trong 60 phút). Nội dung bị xoá **ngay trong câu UPDATE** — đọc thẳng database cũng không cứu được |
| Xoá hội thoại | chỉ ẩn phía mình; tin mới sẽ làm hội thoại hiện lại (đúng hành vi Instagram) |
| Chia sẻ bài viết | nút máy bay giấy trên mỗi bài đăng → chọn người → gửi kèm thẻ bài viết |

**Cách hoạt động (thiết kế)**

* **Một hội thoại cho mỗi cặp người dùng** — khoá duy nhất `pairKey = "<id nhỏ>:<id lớn>"`,
  nên dù hai người cùng bấm mở chat một lúc cũng không bao giờ sinh ra hai hội thoại.
* **Realtime bằng SSE, không dùng Socket.IO** (`services/realtime.service.js`):
  chỉ là HTTP thường nên chạy xuyên Cloudflare Tunnel mà không cần mở cổng phụ hay
  thư viện nặng. Sự kiện: `ready` · `message` · `read` · `typing` · `conversation` · `deleted`.
* **Token không bao giờ nằm trong URL**: trình duyệt nối bằng `fetch` + header
  `Authorization` và tự đọc luồng SSE (EventSource không gửi được header, nên
  nếu dùng nó thì token sẽ lọt vào access log của Cloudflare).
* **Tự chữa lành**: nếu SSE bị mạng/proxy cắt, hook `useChatStream` nối lại với
  khoảng chờ tăng dần (1s → 30s) và **vẫn hỏi định kỳ** `/api/chat/summary`
  (`CHAT_POLL_INTERVAL_MS`) để badge không bao giờ "kẹt".
* **Đếm tin chưa đọc bằng một câu SQL** cho cả hộp thư (không N+1 trên điện thoại):
  đếm tin của người kia tạo **sau** mốc `readAt` của mình.
* **Tin cuối được chụp sẵn** vào `conversations.last_message_*` (preview + người gửi
  + thời gian) — hộp thư chỉ cần 1 truy vấn thay vì join `messages` cho từng dòng.
* **`httpServer.requestTimeout = 0`** trong `server.js`: Node ≥18 mặc định cắt
  request sau 300 giây, sẽ giết luồng SSE giữa chừng.

**Biến môi trường liên quan** (xem `backend/.env.example` mục 4c)

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `CHAT_MAX_MESSAGE_LENGTH` | 1000 | độ dài tối đa một tin |
| `CHAT_PAGE_SIZE` | 30 | số tin mỗi trang khi cuộn lên |
| `CHAT_MAX_ATTACHMENT_MB` | 10 | ngưỡng ảnh/video trong tin nhắn |
| `CHAT_MESSAGE_REQUESTS` | true | bật "Tin nhắn chờ" cho người lạ |
| `CHAT_POLL_INTERVAL_MS` | 5000 | nhịp hỏi dự phòng khi không có realtime |
| `CHAT_SSE_HEARTBEAT_MS` | 25000 | nhịp giữ kết nối SSE sống qua tunnel |
| `CHAT_RATE_LIMIT_MAX` | 120 | số tin tối đa / người / `RATE_LIMIT_WINDOW_MINUTES` |

Tệp gửi trong tin nhắn nằm ở `uploads/chat/` — **vẫn nằm dưới cây `/uploads` đã
siết bảo mật** (danh sách trắng đuôi tệp, chặn dotfile/path-traversal, `nosniff`),
không mở thêm thư mục tĩnh nào khác.

---

## 6. Data model (Sequelize)

```
User 1───n Post 1───n Comment n───1 User
     └──n Comment                                  (all FKs ON DELETE CASCADE)
     └──n Like    n───1 Post
```

* `User(username, fullName, email, passwordHash, avatarUrl, bio, role[member|admin], isActive, lastLoginAt)`
  * `defaultScope` **excludes `password`**; only `User.scope('withPassword')` sees the hash.
  * `beforeSave` hook bcrypt-hashes on change → AdminJS edits are safe by default.
* `Post(userId, imageFilename, mimeType, sizeBytes, caption, location, likeCount, commentCount, isArchived)`
  * Stores **only the filename** — never a URL — so a domain change is a config change, not a migration.
  * `likeCount/commentCount` are denormalised and refreshed with atomic SQL in model hooks.
* `Comment(postId, userId, body)` · `Like(postId, userId)` with a **unique index** on `(user_id, post_id)` → no double likes even under race conditions.

### Bảng `conversations` — hội thoại 1-1

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `pair_key` | STRING(64) **unique** | `"<id nhỏ>:<id lớn>"` → mỗi cặp người dùng chỉ có **một** hội thoại |
| `user_one_id` / `user_two_id` | BIGINT | hai người tham gia (CASCADE khi xoá người dùng) |
| `status` | ENUM | `requested` (tin nhắn chờ) · `accepted` · `declined` |
| `requested_by_id` | BIGINT | ai khởi tạo — quyết định ai được bấm Đồng ý/Từ chối |
| `user_one_read_at` / `user_two_read_at` | DATE | mốc đã đọc của từng người → tính số tin chưa đọc |
| `user_one_hidden_at` / `user_two_hidden_at` | DATE | "xoá hội thoại" phía mỗi người; tin mới hơn mốc này sẽ làm hội thoại hiện lại |
| `last_message_id` / `last_message_sender_id` / `last_message_preview` | — | bản **chụp sẵn** tin cuối để hộp thư không phải join bảng `messages` |

### Bảng `messages` — tin nhắn

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `conversation_id` / `sender_id` | BIGINT | CASCADE theo hội thoại/người dùng |
| `body` | TEXT | chữ trong tin (≤ `CHAT_MAX_MESSAGE_LENGTH`) |
| `attachment_filename` / `attachment_type` / `attachment_width` / `attachment_height` | — | tệp trong `uploads/chat/`; **chỉ lưu TÊN TỆP, không lưu URL** |
| `shared_post_id` | BIGINT | bài viết được chia sẻ (FK mềm — xoá bài không làm hỏng tin nhắn) |
| `read_at` | DATE | người nhận đã xem → hiện "Đã xem" phía người gửi |
| `deleted_at` | DATE | thu hồi tin: xoá mềm **và** xoá sạch nội dung trong cùng câu UPDATE |

**Số tin chưa đọc KHÔNG lưu thành cột** — nó được tính bằng một câu `COUNT` theo
mốc `read_at` của từng người, nên không bao giờ lệch như các bộ đếm denormalised.

Set `DB_SYNC=none` in `.env` once the schema is frozen (migrations instead of `alter`).

---

### Bảng `invites` — lời mời thành viên

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `email` | STRING(191), unique-index | người được mời; lúc đăng ký backend dùng email **này**, không dùng email client gửi lên |
| `token_hash` | CHAR(64) | **SHA-256** của token trong link — token gốc không bao giờ nằm trong database |
| `role` | ENUM(member, admin) | vai trò sẽ được cấp khi người đó đăng ký |
| `status` | ENUM(pending, accepted, revoked, expired) | suy ra từ mốc thời gian, không phải job nền |
| `expires_at` / `accepted_at` / `revoked_at` / `accepted_by_user_id` | thời gian / FK | vòng đời lời mời |
| `invited_by_id` | FK → users | ai đã mời (hiện bằng Association `inviter`) |

`users` được bổ sung: `password_reset_hash`, `password_reset_expires_at` (đặt lại mật khẩu
**một lần**, so sánh hằng thời gian) và `invited_by_id` (nhớ ai đã mời thành viên đó).
Scope riêng `withToken` / `withResetToken` là nơi duy nhất đọc được hai cột nhạy cảm này —
truy vấn thường không bao giờ trả chúng.

---

## 7. AdminJS dashboard — `/admin`

* Session-based login using `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` (bcrypt) or the `ADMIN_PASSWORD` fallback. Generate the hash with `npm run admin:passwd`.
* Resources: **Users, Posts, Comments, Likes** with curated list/show/edit properties.
* **Ultimate privilege:** an admin can delete *any* post or user (cascades to their photos, likes and comments). A member can delete only their own content.
* Pending uploads appear instantly; the Post list rewrites `imageFilename` into a clickable, viewable URL served by `/uploads`.

### Custom CSS injection

```js
// backend/admin/adminjs.config.js
const adminJsOptions = {
  rootPath: urls.prefix.admin,                 // '/admin'
  assets: {
    styles: [`${ASSETS_ROUTE}/custom-admin.css`],  // '/admin/assets/custom-admin.css'
  },
  branding: { companyName: 'PixGram Admin', withMadeWithLove: false, theme: { colors: { primary100: '#c13584' } } },
  // …
};

// served by your own express.static, mounted before the AdminJS router:
app.use('/admin/assets', express.static(path.join(__dirname, 'admin', 'public')));
```

`custom-admin.css` relies on AdminJS's stable `data-css="…"` hooks (`topbar`, `sidebar`, `table`, `login`, buttons), so it keeps working across minor AdminJS releases. There is **no build step** — edit the file on the phone and refresh the browser.

**Ngôn ngữ dashboard:** mặc định tiếng Việt qua `ADMIN_LOCALE=vi` (bộ dịch tự viết trọn 103 khoá), đổi được sang `en` / `zh-CN` bằng nút 🌐 trên thanh trên. Chi tiết ở §4b.

---

## 8. Telegram bot (same process as the API)

Started from `server.js` via `services/telegram.service.js` with `polling: true` — no webhook, no open port, no second process.

* Every successful upload triggers `notifyNewPhoto()`: the picture itself (`sendPhoto`, controlled by `TELEGRAM_SEND_PHOTO`) with a caption containing the author, the caption text, the like/comment counters and a **deep link to the post** on the Vercel domain, plus inline buttons “Open album” / “Admin panel”.
* Commands: `/start`, `/id` (prints the chat id to paste into `TELEGRAM_ADMIN_CHAT_ID`), `/status` (uptime + URLs).
* Notifications are fire-and-forget: a Telegram outage logs a warning and never blocks or fails an upload.
* Found a bot token? Never commit it — it goes in `.env` only.

---

## 9. Security notes (uploads & API)

| Risk | Mitigation |
| --- | --- |
| Path traversal (`../../`) | random server-side filenames + `resolveStoredFile()` re-checks `startsWith(uploadRoot)`; the `/uploads` guard rejects `..`, `%2e%2e`, `%00` and dot-files before `express.static` |
| Malicious file types | multer `fileFilter` whitelists MIME types; the **extension is derived from the MIME**, never from the client name; the static guard re-checks the extension (`.svg`, `.html`, `.js` can never be served) |
| Stored XSS via uploaded content | `X-Content-Type-Options: nosniff`, a per-asset CSP (`default-src 'none'; sandbox`), `Content-Disposition: inline` |
| Oversized uploads crashing the phone | `limits.fileSize` (env-driven, 15 MB default) + `files: 1`; multer errors are translated to a `413` JSON envelope and the partial file is deleted |
| Hotlinking / cross-origin weirdness | `Cross-Origin-Resource-Policy: cross-origin` (only the images), everything else defaults to same-origin |
| Brute force | `express-rate-limit`: global, plus tighter limits on `/auth/*` and uploads |
| Secret leakage | `.env` is git-ignored; `config/env.js` is the only module reading `process.env`; production boot warns when secrets are weak |
| Token theft | JWT in `localStorage` + `Authorization` header (no cookies → no CSRF surface on the API); AdminJS session cookies are `httpOnly`, `sameSite=lax`, `secure` in production |
| Orphaned files | if a request fails after multer wrote the file, the error middleware unlinks it |

---

## 10. API reference (all under `https://api.d4mdev.click/api`)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/health` | – | uptime, env, API base, `locales` |
| GET | `/auth/config` | – | giới hạn ảnh/video/audio (MB, giây, MIME), `defaultLocale`, `supportedLocales` |
| POST | `/auth/register` | – | `{username, fullName, email, password}` → `{token, user}` |
| POST | `/auth/login` | – | `{identifier, password}` (username **or** e-mail) |
| GET | `/auth/me` | JWT | current user |
| PATCH | `/auth/me` | JWT | cập nhật `locale` (vi/en/zh), `bio`, `fullName` của chính mình |
| GET | `/posts?page=&limit=&userId=` | optional | paginated feed (`hasMore` for infinite scroll) |
| GET | `/posts/stats` | optional | counts + storage used |
| POST | `/posts` | JWT | multipart: `image` (ảnh/bìa), `video` (Reels), `audio` (nhạc nền), `caption`, `location`, `audioTitle`, `durationSeconds` |
| GET | `/posts/:id` | optional | single post + comments |
| DELETE | `/posts/:id` | JWT | owner or admin only |
| POST | `/posts/:id/likes` | JWT | toggle like → fresh counters |
| GET/POST | `/posts/:id/comments` | optional/JWT | list / add comment |
| DELETE | `/comments/:id` | JWT | author or admin |
| GET | `/users/me/posts` | JWT | my grid |
| GET | `/users/:idOrUsername/posts` | optional | any member's grid + profile |
| POST | `/posts/:id/views` | – | tăng lượt xem (dùng cho Reels) → `{postId, viewCount}` |
| GET | `/posts/:id/download` | – | tải tệp gốc; tên tệp `pixgram-{user}-{id}-{ngày}{ext}` |
| GET | `/reels?page=&limit=` | optional | chỉ video, `limit ≤ 20`, kèm `maxDurationSeconds` |
| GET | `/reels/:id` | optional | một reel |
| GET | `/stories` | optional | bài trong 24h gần nhất, gom theo tác giả (`groups`, `windowHours: 24`) |
| POST | `/auth/forgot-password` | – | `{email}` → **luôn** trả thông báo chung + `expiresInMinutes` (chống dò tài khoản) |
| POST | `/auth/reset-password` | – | `{token, password}` — token dùng **một lần**, hết hạn theo `RESET_TOKEN_TTL_MINUTES` |
| POST | `/invites` | JWT **admin** | `{email, role, message?}` → `{invite, emailSent, inviteUrl?}` (`inviteUrl` chỉ trả khi gửi mail lỗi) |
| GET | `/invites` | JWT **admin** | danh sách lời mời (không bao giờ trả `tokenHash`) |
| GET | `/invites/stats` | JWT **admin** | `{pending, accepted, expired, ttlDays}` |
| DELETE | `/invites/:id` | JWT **admin** | thu hồi lời mời (từ chối nếu đã được chấp nhận) |
| GET | `/invites/:token` | – | tra cứu link mời: 404 nếu không có, **410** (`INVITE_EXPIRED`) nếu hết hạn/đã dùng |
| GET | `/chat/conversations?box=inbox\|requests&limit=` | JWT | hộp thư + số tin chưa đọc từng dòng + `summary` cho badge |
| POST | `/chat/conversations` | JWT | `{userId}` → mở/tạo hội thoại (201 khi tạo mới) |
| GET | `/chat/conversations/:id` | JWT | chi tiết hội thoại + hồ sơ người kia |
| DELETE | `/chat/conversations/:id` | JWT | xoá khỏi hộp thư của **chính mình** (chỉ ẩn) |
| GET | `/chat/conversations/:id/messages?before=&limit=` | JWT | tin nhắn, mới nhất trước + `hasMore`/`nextBefore` để cuộn tải thêm |
| POST | `/chat/conversations/:id/messages` | JWT | gửi tin: JSON (chữ, `sharedPostId`) hoặc multipart (`attachment` = ảnh/video) |
| POST | `/chat/conversations/:id/read` | JWT | đánh dấu đã đọc → trả về số tin vừa đọc (phát sự kiện `read` cho người gửi) |
| POST | `/chat/conversations/:id/typing` | JWT | tín hiệu "đang nhập…" (không ghi database) |
| POST | `/chat/conversations/:id/accept\|decline` | JWT | người **nhận** đồng ý / từ chối tin nhắn chờ |
| POST | `/chat/messages` | JWT | gửi nhanh theo `{toUserId}` (nút chia sẻ bài viết) |
| DELETE | `/chat/messages/:id` | JWT | thu hồi tin của mình (≤ 60 phút) |
| GET | `/chat/summary` | JWT | `{totalUnread, pendingRequests}` cho badge điều hướng |
| GET | `/chat/people?q=` | JWT | tìm người để nhắn (kèm `conversationId` nếu đã có hội thoại) |
| GET | `/chat/stream` | JWT | kênh **SSE**: `ready` · `message` · `read` · `typing` · `conversation` · `deleted` |

Mọi thông báo lỗi và thành công đều theo `Accept-Language` (vi · en · zh) nhờ `i18n/messages.js`
nhóm `api.*` — giao diện gửi kèm ngôn ngữ đang chọn, thiếu header thì mặc định tiếng Việt.

Success envelope: `{ "success": true, "data": { … } }` · Failure: `{ "success": false, "code": "…", "message": "…", "details": […] }`.

---

## 11. Setup — the short version

**Kiểm tra nhanh sau khi cấu hình (không cần điện thoại):**

```bash
cd backend
npm run doctor         # khám cấu hình + dung lượng + cổng
npm run check          # toàn bộ: cú pháp, 3 bộ smoke, boot-check, build frontend
npm run mail:test      # xác nhận Gmail gửi được
```

Hoặc chỉ một mục: `npm run smoke` · `npm run smoke:email` · `npm run smoke:compress` · `npm run boot:check`.

**Phone (Termux):**

```bash
pkg install nodejs-lts mariadb cloudflared git        # or: bash scripts/bootstrap-termux.sh
cd backend
cp .env.example .env && nano .env                     # secrets + tunnel name + bot token
npm install
npm run db:init                                       # create DB + app user
npm run admin:passwd                                  # paste hash into ADMIN_PASSWORD_HASH
npm run tunnel:install                                # cloudflared login + create + DNS route
termux-wake-lock && npm start                         # DB + API + tunnel 🚀
```

**Vercel:**

```bash
cd frontend
npm install
vercel --prod            # or import the repo in the dashboard
# Set env vars: VITE_API_ORIGIN=https://api.d4mdev.click (+ VITE_APP_ORIGIN, VITE_ADMIN_URL)
# Optionally add your own custom domain (e.g. photos.yourdomain.com)
```

Then open the album, log in, and the **first account you register becomes the admin** (`FIRST_USER_IS_ADMIN=true`) — or create members from `/admin`.

Full step-by-step (tunnel config, DNS, wake-lock, battery optimisation, backups, troubleshooting): **`docs/DEPLOYMENT.md`**.
Vận hành hằng ngày trên điện thoại (log, sao lưu, cập nhật, xử lý sự cố, cron): **`docs/OPERATIONS.md`**.
Khoá bí mật & cách xoay vòng: **`docs/ENV-SECRETS.md`**.
Đổi tên DB · user MariaDB · tunnel sang PixGram trên máy chủ đang chạy: **`docs/MIGRATION-PIXGRAM.md`**.

---

## 12. Design decisions worth knowing

* **One process, three jobs.** Express + AdminJS + Telegram share a single Node process: fewer moving parts on a phone, and the bot needs no public URL.
* **`concurrently` orchestrates the dependencies, not Docker.** `start-tunnel.sh` polls `/api/health` before starting the tunnel, and `start-mariadb.sh` re-uses an already-running server, so running `npm start` twice never corrupts the datadir.
* **Filenames in the DB, URLs in config.** Photos survive a domain change; changing `PUBLIC_BASE_URL` instantly re-points every image.
* **Công khai — không còn câu chữ gia đình.** Ứng dụng chuyển từ "album gia đình" sang
  cộng đồng chia sẻ ảnh: mọi chuỗi (vi · en · zh), email, bot Telegram, nhãn AdminJS và
  tài liệu đều dùng "thành viên / cộng đồng / kho ảnh". `tools/check-wording.sh` chạy
  trong `check-all.sh` và CI, **tự chặn** nếu câu chữ cũ quay lại.
* **Tên thương hiệu đã đổi hẳn — kể cả định danh kỹ thuật.** Tên cũ mang từ khoá đã bị loại bỏ
  biến mất khỏi UI, email, bot và tài liệu; định danh kỹ thuật nay là DB `pixgram`, user
  `pixgram`, cookie `pixgram.admin`, khoá `localStorage` `pixgram.*`, tunnel `pixgram-api`.
  Máy chủ đang chạy có sẵn `npm run db:rename` (kèm `--dry-run` và đường lùi) để chuyển
  dữ liệu cũ sang tên mới **mà không mất gì**.
* **Thanh điều hướng theo Instagram bản mới (10/2025).** Thứ tự tab là *Trang chủ ·
  Thước phim · Tin nhắn (chính giữa) · Tìm kiếm · Trang cá nhân*, biểu tượng **đặc** ở tab
  đang mở; nút **Đăng (+)** rời thanh dưới lên thanh trên — đúng bước Instagram đã đổi.
  Nav hiện ở mọi khổ màn hình dưới `lg` (từ `lg` trở lên là sidebar); trước đây khoảng
  768–1023 px không có thanh điều hướng nào.
* **Counters over aggregates.** The feed never runs `COUNT(*)` per card — likes/comments are denormalised and kept in sync by hooks with atomic SQL.
* **Optimistic UI.** Like / comment / delete update instantly and roll back on failure — essential on a mobile connection.
* **Two URL layers in the frontend.** `config/paths.js` holds the prefixes, `config/urls.js` composes the endpoints; components only ever import from the latter.
* **Three string layers.** UI copy → `src/i18n/locales/*.json`; bot/log copy → `backend/i18n/messages.js`; dashboard copy → `admin/locales/adminjs.vi.json`. Không component/controller nào chứa câu chữ tiếng Anh cứng.
* **Localize bằng i18n, không bằng CSS.** CSS chỉ giữ vai trò thương hiệu + bố cục + lưới an toàn cho chuỗi cứng — vì selector phụ thuộc DOM sẽ vỡ khi AdminJS nâng cấp, còn khoá dịch thì không.
* **Không transcode trên điện thoại.** Điện thoại Android là máy chủ: đọc thời lượng bằng cách parse atom `mvhd` (thuần JS), trích ảnh bìa bằng `<canvas>` ở client, nhạc nền phát đồng bộ thay vì mux — CPU gần như không tăng, và **không cần ffmpeg**.
* **Story là một truy vấn, không phải một bảng.** `GET /api/stories` lọc bài trong 24h rồi gom theo tác giả: không migration, không job dọn dẹp, không dữ liệu mồ côi.
* **Service worker không cache `/uploads/`.** Kho ảnh sẽ lớn dần; giữ ảnh trong Cache Storage là cách nhanh nhất để đầy bộ nhớ điện thoại. Chỉ HTML/JS/CSS và dữ liệu feed mới được lưu.
* **Nén ở trình duyệt, không nén ở máy chủ.** Máy chủ là chiếc điện thoại đang treo 24/7:
  cài thư viện xử lý ảnh bằng C trên Termux rất dễ hỏng, còn `canvas` của trình duyệt đã
  tối ưu sẵn và chạy trên máy người gửi. Máy chủ chỉ nhận tệp đã nhẹ đi 5–8 lần.
* **Token một lần, DB chỉ giữ hash.** Cả lời mời và đặt lại mật khẩu đều dùng token 32 byte
  ngẫu nhiên; database chỉ lưu SHA-256 và so sánh bằng `timingSafeEqual`. Nếu tệp dump
  database bị lộ, kẻ tấn công **không** dùng được các liên kết đó.
* **“Quên mật khẩu” luôn trả cùng một câu trả lời.** Khác đi sẽ biến trang đó thành công cụ
  dò xem ai đã có tài khoản.
* **Không bao giờ chặn người dùng vì dịch vụ phụ.** SMTP lỗi, Telegram lỗi, nén ảnh lỗi —
  tất cả đều chỉ ghi log; ảnh vẫn được đăng và người dùng vẫn thấy đúng luồng.
* **Ba cái bẫy chỉ lộ ra lúc khởi động thật** (đã sửa, và `npm run boot:check` canh chúng):
  1. `@adminjs/express` và `@adminjs/sequelize` là gói **ESM-only** (package.json chỉ khai báo
     điều kiện `import`) ⇒ `require('@adminjs/express')` ném `ERR_PACKAGE_PATH_NOT_EXPORTED`.
     Phải nạp bằng `import()` động (`loadAdminPlugins()` trong `admin/adminjs.config.js`).
  2. `connect-session-sequelize` cần **lớp** `session.Store` của express-session, không phải
     `session.session` — viết nhầm là `TypeError: Class extends value undefined`.
  3. AdminJS phải được mount **trước** `express.json()`. Nếu bộ đọc body chung tiêu thụ request
     trước, `POST /admin/login` trả 500 `WrongArgumentError` trong khi trang đăng nhập vẫn hiện
     bình thường — lỗi rất dễ mất thời gian.
* **Tệp luôn nằm trong thư mục con.** URL ảnh/video là `/uploads/posts/<tệp>` và `/uploads/avatars/<tệp>` — hàm dựng URL nhận tham số thư mục tường minh để không bao giờ sinh ra liên kết 404.

### Chat 1-1 (bổ sung ở lượt này)

* **SSE thay vì Socket.IO** — Cloudflare Tunnel + Termux: ít cổng, ít phụ thuộc,
  tự nối lại; mọi thao tác GỬI đi bằng POST nên chỉ cần một chiều realtime.
* **Không dùng EventSource** — nó không gửi được header `Authorization`, buộc phải
  nhét token vào URL (lọt access log của Cloudflare). Dùng `fetch` + đọc luồng SSE.
* **"Tin nhắn chờ" mặc định BẬT** — chống spam khi ứng dụng đã mở cho mọi người;
  tắt bằng `CHAT_MESSAGE_REQUESTS=false`.
* **Số tin chưa đọc tính bằng SQL, không lưu cột** — bộ đếm denormalised chỉ để
  hiển thị nhanh (tin cuối), không bao giờ là nguồn sự thật của số "chưa đọc".
* **Thu hồi tin = xoá nội dung trong chính câu UPDATE** — giới hạn 60 phút như
  Instagram; tệp trên đĩa cũng bị xoá luôn.
* **`requestTimeout = 0`** — bắt buộc, nếu không Node sẽ cắt mọi kết nối SSE sau
  300 giây và chat sẽ "im lặng" đúng 5 phút một lần.
* **Giám sát dung lượng sau mỗi lần đăng** — máy chủ là chiếc điện thoại: khi
  `uploads/` vượt `STORAGE_WARN_TOTAL_MB` hoặc đĩa còn dưới `DISK_FREE_WARN_PERCENT`
  thì nhắc qua Telegram (tối đa 1 lần/6 giờ, và chỉ đánh dấu "đã nhắc" khi gửi được).
