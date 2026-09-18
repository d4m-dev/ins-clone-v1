# 🔁 Chuyển từ FamilyGram → PixGram (migrate trên Termux)

> Dự án đã được **đổi thương hiệu sang PixGram** và **chuyển sang công khai** (cộng đồng
> chia sẻ ảnh). Mã nguồn trong repo **đã đổi xong toàn bộ** tên hiển thị lẫn định danh kỹ
> thuật. Tài liệu này chỉ nói về phần **phải làm một lần trên máy chủ Termux** (và trên
> Cloudflare) để dữ liệu cũ chạy tiếp dưới tên mới.
>
> Thời gian: ~5–10 phút · Có thể dừng giữa chừng · Có đường lùi ở mục 6.
>
> **Không có bước nào làm mất ảnh**: ảnh nằm trong `uploads/` (đổi tên thư mục DB không
> đụng tới), và script luôn sao lưu DB trước khi làm bất cứ điều gì.

---

## 0. Đổi những gì?

| Lớp | Trước | Sau | Bắt buộc? |
|---|---|---|---|
| Tên hiển thị (PWA, UI, email, bot, AdminJS) | FamilyGram | **PixGram** | ✅ đã xong trong repo |
| Database MariaDB | `familygram` | **`pixgram`** | ✅ nên đổi (mục 3) |
| User MariaDB | `familygram` | **`pixgram`** | ✅ nên đổi (mục 3) |
| Tunnel Cloudflare | `familygram-api` | **`pixgram-api`** | ⚠️ tùy chọn (mục 2) |
| Cookie phiên AdminJS | `familygram.admin` | **`pixgram.admin`** | ✅ đã xong — chỉ cần đăng nhập lại |
| Khoá `localStorage` của web | `familygram.*` | **`pixgram.*`** | ✅ đã xong — người dùng mất tùy chọn cũ (mục 5) |
| Tên gói npm | `familygram-backend/frontend` | **`pixgram-backend/frontend`** | ✅ đã xong |
| Tên miền | `api.d4mdev.click` · `ins-clone-v1.vercel.app` | **không đổi** | ❌ |

Điểm quan trọng: **tên miền và ảnh không đổi**, nên link đã chia sẻ vẫn sống.

---

## 1. Cập nhật mã nguồn trên Termux

```bash
cd ~/pixgram            # (hoặc thư mục repo cũ: ~/familygram)
git pull                 # lấy bản đã đổi tên
cd backend
npm install              # cài lại theo package.json mới (tên gói/khối lượng không đổi)
```

> Nếu thư mục trên máy bạn vẫn tên `familygram`, đổi luôn cho gọn:
> ```bash
> cd ~ && mv familygram pixgram && cd pixgram
> ```
> Thư mục `uploads/` và `backups/` đi theo nguyên vẹn vì nằm bên trong repo — nhớ đồng bộ
> các đường dẫn tuyệt đối trong Termux:Widget / cron nếu bạn có tạo shortcut.

---

## 2. Đổi tên tunnel Cloudflare (tùy chọn nhưng nên làm)

Chỉ đổi **tên hiển thị**; **giữ nguyên UUID** `2cebb683-e127-4cec-87c2-1791eb88adf3` để
DNS `api.d4mdev.click` không phải sửa gì.

### Cách A — Cloudflare Zero Trust (khuyên dùng)

1. Mở <https://one.dash.cloudflare.com> → **Networks → Tunnels**.
2. Chọn tunnel `familygram-api` → nút **⋮ / Edit** → đổi tên thành `pixgram-api` → lưu.

`cloudflared` không có lệnh đổi tên (CLI chỉ có `login · create · list · run · route · delete · info`),
nên dashboard là cách chuẩn. UUID và chứng chỉ JSON **không đổi** → `~/.cloudflared/config.yml`
giữ nguyên → **không cần chạy lại DNS route**.

### Cách B — Muốn tên trong `.env` độc lập hoàn toàn với Cloudflare

Đặt luôn UUID vào `.env` (chạy được cả khi bạn đổi tên tunnel sau này):

```ini
CLOUDFLARE_TUNNEL_NAME=2cebb683-e127-4cec-87c2-1791eb88adf3
```

### ⚠️ Đừng làm điều này

Đừng chạy `bash scripts/setup-cloudflared.sh` trước khi đổi tên: script sẽ thấy chưa có
tunnel tên `pixgram-api`, **tạo tunnel thứ hai** và bước `cloudflared tunnel route dns`
sẽ lỗi/vô hiệu vì `api.d4mdev.click` đã có bản ghi.

Kiểm tra nhanh sau khi đổi:

```bash
cloudflared tunnel list          # phải thấy: pixgram-api  (2cebb683-…)
grep -n "^tunnel:" ~/.cloudflared/config.yml   # phải là UUID, không phải tên
curl -s https://api.d4mdev.click/api/health | head -c 200
```

---

## 3. Đổi tên database + user MariaDB

Repo có sẵn script làm hết: sao lưu → tạo DB/user mới → nạp dữ liệu → **đối chiếu số dòng
từng bảng** → chỉ khi khớp mới báo thành công.

```bash
cd ~/pixgram/backend

# 1) Xem trước kế hoạch, không thay đổi gì (chạy được cả khi DB đang tắt)
npm run db:rename -- --from familygram --dry-run

# 2) Chạy thật  (mysqld phải đang chạy: npm run start:db)
npm run db:rename -- --from familygram

# 3) Khi đã chắc chắn (thường sau vài ngày), xoá DB + user cũ
npm run db:rename -- --from familygram --drop-old
```

Script chấp nhận thêm `--force` (nếu DB `pixgram` đã tồn tại và bạn muốn nạp đè) và
`--help`. Bản sao lưu nằm ở `backend/backups/familygram-pre-rename-<thời-gian>.sql.gz`.

> **Số liệu khớp mới coi là xong.** Nếu script báo `số liệu KHÔNG khớp`, nó dừng lại và
> chưa xoá gì; khôi phục bằng đúng lệnh nó in ra.

### Làm tay (nếu bạn muốn tự kiểm soát)

```bash
# sao lưu
mariadb-dump -u root familygram | gzip -9 > ~/familygram-backup-$(date +%F).sql.gz

# tạo DB + user mới (mật khẩu lấy từ .env)
mariadb -u root <<'SQL'
CREATE DATABASE IF NOT EXISTS pixgram CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'pixgram'@'localhost' IDENTIFIED BY '<DB_PASSWORD trong .env>';
GRANT ALL PRIVILEGES ON pixgram.* TO 'pixgram'@'localhost';
FLUSH PRIVILEGES;
SQL

# nạp dữ liệu + đối chiếu
zcat ~/familygram-backup-*.sql.gz | mariadb -u root pixgram
mariadb -u root -e "SELECT COUNT(*) FROM familygram.posts; SELECT COUNT(*) FROM pixgram.posts;"
```

Không cần chạy migration schema nào: Sequelize dùng `sequelize.sync()` — bảng đã có sẵn
trong bản dump, ứng dụng chỉ đọc/ghi tiếp.

---

## 4. Cập nhật `.env`

Repo đã đổi sẵn trong `.env.example`; **file `.env` thật trên máy bạn phải khớp**:

```ini
DB_NAME=pixgram
DB_USER=pixgram
# DB_PASSWORD, DB_HOST, DB_PORT giữ nguyên
ADMIN_COOKIE_NAME=pixgram.admin
CLOUDFLARE_TUNNEL_NAME=pixgram-api          # hoặc UUID, xem mục 2B
```

Kiểm tra nhanh:

```bash
grep -nE "^(DB_NAME|DB_USER|ADMIN_COOKIE_NAME|CLOUDFLARE_TUNNEL_NAME)=" .env
```

> `.env` **không** được commit (đã có trong `.gitignore`) — đúng như quy ước “không hardcode
> bí mật” của dự án.

---

## 5. Hệ quả phía người dùng (không mất dữ liệu)

| Việc gì | Vì sao | Cách xử lý |
|---|---|---|
| Phải **đăng nhập lại** | tên cookie phiên AdminJS đổi (`familygram.admin` → `pixgram.admin`) và khoá token web đổi | không cần làm gì |
| Mất **tuỳ chọn ngôn ngữ / chế độ sáng-tối / trạng thái “đã xem Stories”** trên trình duyệt | khoá `localStorage` đổi tiền tố sang `pixgram.*` | chỉ là cài đặt hiển thị; người dùng chọn lại |
| Biểu tượng PWA trên màn hình chính vẫn chạy | tên app đổi thành PixGram khi mở | có thể xoá biểu tượng cũ rồi “Thêm vào màn hình chính” để thấy tên mới |
| Ảnh, video, Reels, Stories, tin nhắn 1-1 | nằm trong DB (`pixgram`) + thư mục `uploads/` | **nguyên vẹn** |

---

## 6. Kiểm tra & đường lùi

```bash
cd ~/pixgram
bash tools/check-all.sh            # 11 mục: API · Chat · Email · Nén ảnh · Chốt chặn câu chữ …
curl -s http://127.0.0.1:3000/api/health | head -c 400
bash backend/scripts/health-check.sh
```

Trong đó có bộ **chốt chặn câu chữ** (`tools/check-wording.sh`) — tự báo lỗi nếu có ai đó
viết lại câu chữ cũ về gia đình vào repo. Chốt chặn này cũng chạy trong GitHub
Actions ở mỗi lần push.

**Lùi lại (rollback):**

1. DB: `zcat backend/backups/familygram-pre-rename-*.sql.gz | mariadb -u root familygram`
   rồi đặt lại `DB_NAME=familygram`, `DB_USER=familygram` trong `.env`.
2. Tunnel: đổi lại tên trong Zero Trust (hoặc để nguyên UUID — không ảnh hưởng gì).
3. Mã nguồn: `git log --oneline --grep=PixGram` để tìm commit đổi thương hiệu rồi
   `git revert <sha>` — nhưng thường **không cần**: chỉ cần trả lại `DB_NAME`/`DB_USER`
   trong `.env` là chạy tiếp được với DB cũ (mã nguồn không phụ thuộc tên DB).

---

## 7. Vercel (frontend)

Tên hiển thị/PWA nằm trong mã nguồn nên chỉ cần **deploy lại**. Các biến `VITE_*` vẫn
nguyên tên, chỉ cần giá trị đúng:

```bash
cd frontend && vercel --prod
# Vercel → Settings → Environment Variables:
#   VITE_API_ORIGIN=https://api.d4mdev.click
#   VITE_APP_ORIGIN=https://ins-clone-v1.vercel.app
#   VITE_ADMIN_URL=https://api.d4mdev.click/admin
```

---

## 8. Sau khi xong — danh sách kiểm tra

- [ ] `cloudflared tunnel list` → `pixgram-api`
- [ ] `grep DB_NAME backend/.env` → `pixgram`
- [ ] `npm run db:rename -- --from familygram --dry-run` → báo DB cũ đã biến mất (nếu đã `--drop-old`)
- [ ] `curl https://api.d4mdev.click/api/health` → `success: true`
- [ ] Đăng nhập `/admin` (AdminJS) — menu **Cộng đồng**, tiêu đề **PixGram**
- [ ] Mở trang web: tiêu đề tab **PixGram — Chia sẻ ảnh cộng đồng**
- [ ] `bash tools/check-all.sh` → mục “Chốt chặn câu chữ” đạt
