# Vận hành PixGram trên điện thoại

Tài liệu này dành cho **người trực máy chủ** — tức người giữ chiếc điện thoại Android
đang chạy ứng dụng chia sẻ ảnh **PixGram** (mở cho mọi người, có cả tin nhắn 1-1).
Không cần biết lập trình; chỉ cần làm theo đúng vài lệnh.

> Cài đặt lần đầu: xem **`docs/DEPLOYMENT.md`**. Trang này chỉ nói về việc **chạy hằng ngày**.
> Nếu máy chủ còn dữ liệu dưới tên cũ: xem **`docs/MIGRATION-PIXGRAM.md`**.

---

## 1. Bốn lệnh cần nhớ

Mở **Termux** trên điện thoại, luôn bắt đầu bằng:

```bash
cd ~/pixgram/backend
```

| Lệnh | Khi nào dùng | Mất bao lâu |
| --- | --- | --- |
| `npm start` | **Bật máy chủ** (MariaDB + API + tunnel cùng lúc) | ~20 giây |
| `npm run health` | Hỏi “máy chủ còn sống không?” | 2 giây |
| `npm run doctor` | Khi có gì đó sai — khám `.env`, dung lượng, pin, cổng, database | 5 giây |
| `npm run backup` | Sao lưu database **và** ảnh (nên chạy mỗi tuần) | 10 giây – vài phút |

Hai lệnh nữa dùng ít hơn nhưng rất hữu ích:

```bash
npm run health -- --public   # kiểm tra cả địa chỉ công khai qua Cloudflare
npm run mail:test            # thử gửi email thông báo (khi nghi ngờ Gmail hỏng)
```

---

## 2. Một ngày của máy chủ

**Buổi sáng (sau khi điện thoại khởi động lại):**

```bash
cd ~/pixgram/backend
npm start
```

Cứ để yên cửa sổ Termux đó. `npm start` chạy 3 tiến trình song song:
`[DB]` MariaDB · `[API]` Express + AdminJS + bot Telegram · `[BOT-TUNNEL]` cloudflared.

**Trong ngày:** không phải làm gì. Muốn kiểm tra nhanh thì mở `npm run health`.

**Muốn tắt:** bấm `Ctrl + C` trong cửa sổ Termux — `concurrently` sẽ tắt cả 3 tiến trình
theo thứ tự an toàn (API tự đóng kết nối database trước).

> ⚠️ **Đừng tắt Termux bằng cách vuốt khỏi danh sách ứng dụng đang mở** — tiến trình sẽ bị
> hệ thống giết đột ngột. Xem §7 để giữ máy chủ sống ổn định.

---

## 3. Đọc nhật ký (log) khi có sự cố

```bash
cd ~/pixgram/backend
ls -lt logs/ | head          # các tệp log, mới nhất ở trên
tail -f logs/*.log           # xem trực tiếp (Ctrl+C để dừng)
```

Những dòng đáng chú ý:

| Dòng log | Nghĩa |
| --- | --- |
| `MariaDB connected → …` | đã nối được database |
| `Schema synchronised (User, Post, Comment, Like, Invite)` | các bảng đã sẵn sàng |
| `AdminJS ready → …/admin` | bảng quản trị đã lên |
| `HTTP server listening on 0.0.0.0:4000` | API đã mở cổng |
| `Cloudflare Tunnel: … → http://127.0.0.1:4000` | tunnel nối đúng chỗ |
| `Telegram bot @… đã kết nối` | bot đã sống, sẽ báo ảnh mới |
| `Email đã gửi tới …` | thông báo email đã đi |
| `Cảnh báo: …` / `error` | cần xem §6 |

---

## 4. Sao lưu (việc quan trọng nhất)

**Ảnh đã đăng không thể tạo lại.** Database thì có thể dựng lại, còn ảnh thì không —
nên luôn sao lưu **cả hai**:

```bash
npm run backup
```

Kết quả nằm trong `~/pixgram/backend/backups/`:

```
pixgram-20260918-134501.sql.gz     ← database (giữ 14 bản gần nhất)
uploads-20260918-134502.tar.gz        ← toàn bộ ảnh/video (giữ 7 bản gần nhất)
```

**Copy sang nơi khác** (thẻ nhớ, máy tính, Google Drive) — bản sao nằm cùng điện thoại
thì không cứu được khi mất điện thoại:

```bash
cp -r ~/pixgram/backend/backups /sdcard/PixGram-Backup
```

**Tự động mỗi tuần** (Termux):

```bash
pkg install termux-services -y
mkdir -p ~/.termux/boot
# Cron của Termux: chạy 3 giờ sáng Chủ nhật hằng tuần
echo '0 3 * * 0 cd ~/pixgram/backend && npm run backup >> logs/backup.log 2>&1' | crontab -
```

**Khôi phục từ bản sao lưu:**

```bash
cd ~/pixgram/backend
# 1) Database
gunzip -c backups/pixgram-20260918-134501.sql.gz | mariadb -u pixgram -p pixgram
# 2) Ảnh
tar -xzf backups/uploads-20260918-134502.tar.gz     # giải nén đè lên thư mục uploads/
```

---

## 5. Cập nhật phiên bản mới

Khi có mã mới trên GitHub:

```bash
cd ~/pixgram
git pull                      # lấy mã mới
cd backend
npm install --omit=dev        # chỉ cài thư viện cần để CHẠY (nhẹ, không cần biên dịch sqlite3)
npm run doctor                # xem có gì cần chú ý không
npm start                     # khởi động lại
```

Ngay sau khi khởi động, kiểm tra:

```bash
npm run health                # phải thấy "✅ Đang chạy"
curl -s https://api.d4mdev.click/api/health | head -c 200   # bản công khai
```

> Nếu `git pull` báo có tệp `.env` xung đột: **đừng** ghi đè — `.env` trên điện thoại là
> bản thật, còn `.env.example` mới chỉ là mẫu. Giữ bản của bạn, rồi so từng khoá mới
> trong `.env.example` để bổ sung.

---

## 6. Khi có sự cố — tra bảng này trước

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
| --- | --- | --- |
| Mở web thấy “Không kết nối được máy chủ” | `npm start` chưa chạy, hoặc đã bị hệ thống tắt | `npm run health`; nếu chết thì `npm start` lại |
| `api.d4mdev.click` trả **530 / error 1033** | Tunnel chưa có connector | Máy chủ chưa chạy: `npm start`, xem dòng `BOT-TUNNEL` |
| Web hiện nhưng **ảnh trắng** | Thư mục `uploads/` bị di chuyển hoặc tệp đã bị xoá | `npm run doctor` xem số tệp trong `uploads/`; khôi phục từ `backups/` nếu cần |
| Chỉ còn **dưới 1 GB** trống | Album đã lớn | `npm run backup` rồi copy sang thẻ nhớ, sau đó xoá bớt `backups/` cũ |
| Không nhận được **thông báo Telegram** | Bot bị chặn, hoặc token hết hiệu lực | Nhắn `/status` cho bot; nếu im lặng, kiểm tra `TELEGRAM_BOT_TOKEN` và `TELEGRAM_ADMIN_CHAT_ID` |
| Không nhận được **email thông báo** | Mật khẩu ứng dụng Gmail bị thu hồi, hoặc `EMAIL_ENABLED=false` | `npm run mail:test` — lệnh này nói rõ lỗi ở đâu |
| Quên **mật khẩu quản trị** `/admin` | – | `npm run admin:passwd` để tạo hash mới, dán vào `ADMIN_PASSWORD_HASH`, rồi `npm start` lại |
| Pin tụt nhanh, máy nóng | Chưa khoá wake-lock, hoặc app bị tối ưu pin | Xem §7 |
| Máy chủ tự tắt sau vài giờ | Android đã “ngủ đông” Termux | Xem §7 |
| `EADDRINUSE :4000` | Còn tiến trình cũ đang giữ cổng | `npm run doctor` sẽ chỉ ra; hoặc khởi động lại Termux |
| Thông báo Telegram/email **sai ngôn ngữ** | Ngôn ngữ của người đăng, không phải của người nhận | Sửa cột **Ngôn ngữ** của thành viên trong `/admin` |
| **Chat không nhảy tin mới** ngay (phải đợi vài giây) | Kết nối realtime (SSE) bị mạng/proxy cắt | Bình thường vẫn dùng được nhờ tự hỏi định kỳ. Muốn dứt điểm: kiểm tra `npm run health` mục `realtime`, rồi xem lại `CHAT_POLL_INTERVAL_MS` |
| Chat báo **"đang đồng bộ định kỳ"** ở đầu khung | SSE không mở được (nhà mạng chặn kết nối dài) | Tạm thời vẫn chat bình thường; giảm `CHAT_SSE_HEARTBEAT_MS` xuống 15000 rồi khởi động lại |
| Không gửi được **ảnh trong tin nhắn** | Ảnh lớn hơn `CHAT_MAX_ATTACHMENT_MB` | Nâng ngưỡng trong `.env` (mặc định 10 MB) và `npm start` lại |
| Người lạ nhắn tin mà **không thấy thông báo** | Tin nằm ở mục **"Tin nhắn chờ"** (đúng thiết kế, chống spam) | Vào `/messages` → tab "Tin nhắn chờ" → bấm **Đồng ý**. Muốn tắt hẳn: `CHAT_MESSAGE_REQUESTS=false` |
| **Cảnh báo dung lượng** hiện trên Telegram | `uploads/` vượt ngưỡng hoặc đĩa gần đầy | `npm run backup` rồi dọn bớt tệp cũ; chỉnh `STORAGE_WARN_TOTAL_MB` / `DISK_FREE_WARN_PERCENT` |

Nếu vẫn chưa rõ: `npm run doctor` rồi đọc kỹ các dòng `❌` / `⚠️` — script nói thẳng
cần sửa gì.

---

## 7. Giữ máy chủ sống 24/7 (rất quan trọng)

Android có xu hướng “ngủ đông” ứng dụng để tiết kiệm pin — đây là nguyên nhân số 1
khiến album đột nhiên không vào được. Làm 3 việc sau một lần là xong:

**1) Khoá wake-lock trong Termux**

```bash
termux-wake-lock
```

Thêm dòng này vào `~/.bashrc` để tự chạy mỗi khi mở Termux:

```bash
echo 'termux-wake-lock 2>/dev/null' >> ~/.bashrc
```

**2) Tắt tối ưu pin cho Termux**

Cài đặt Android → Ứng dụng → Termux → **Pin** → chọn *Không tối ưu hoá* (hoặc
*Unrestricted*). Một số hãng (Xiaomi, Oppo, Vivo, Samsung) còn có mục riêng:
*Tự khởi động* / *Autostart* → bật cho Termux.

**3) Cắm sạc khi treo máy chủ dài ngày**

`npm run doctor` sẽ in mức pin. Nếu pin dưới 20% và không sạc, script cảnh báo — vì
điện thoại hết pin giữa chừng sẽ làm hỏng phiên upload đang chạy.

**Tuỳ chọn — tự bật máy chủ khi khởi động lại điện thoại:**

```bash
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/start-pixgram.sh <<'SH'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
cd ~/pixgram/backend
nohup npm start > logs/boot.log 2>&1 &
SH
chmod +x ~/.termux/boot/start-pixgram.sh
```

---

## 8. Những con số nên biết

| Hạng mục | Giá trị thực tế |
| --- | --- |
| Ảnh sau khi nén (mặc định 2048 px, JPEG 0.82) | 300 – 900 KB/ảnh |
| Ảnh gốc từ camera điện thoại | 3 – 7 MB/ảnh |
| Video 60 giây (Reels) | 8 – 25 MB |
| RAM máy chủ khi rảnh | ~120 – 180 MB |
| Dung lượng 1.000 ảnh đã nén | ~0,6 GB |
| Sao lưu: database | vài trăm KB – vài MB (nén) |
| Sao lưu: 1.000 ảnh | ~0,6 GB |
| Ảnh gửi trong tin nhắn (nén ở trình duyệt) | 150 – 500 KB/ảnh |
| Dung lượng 10.000 tin nhắn chữ (không ảnh) | ~ 5 – 10 MB |

Nhờ nén ngay trên trình duyệt (trước khi gửi), album nhỏ hơn khoảng **5 lần** so với
lưu ảnh gốc — đổi lại ảnh xem trên web vẫn nét trên TV 4K.

---

## 8b. Kiểm thử chat & giám sát dung lượng

**Kiểm thử nhanh phần chat (không cần điện thoại, không cần database):**

```bash
cd ~/pixgram
npm --prefix backend run smoke:chat        # 74 phép thử: hội thoại, tin nhắn chờ, đã đọc,
                                           # thu hồi tin, phân trang, ảnh, bài viết chia sẻ, SSE
```

Bộ kiểm thử này dựng API thật trên SQLite tạm nên chạy được ngay trên Termux, không
đụng tới dữ liệu thật của bạn.

**Giám sát dung lượng — cài một lần, yên tâm mãi:**

Sau mỗi lần có người đăng ảnh, máy chủ tự kiểm tra dung lượng. Khi `uploads/` vượt
`STORAGE_WARN_TOTAL_MB` (mặc định 2 GB) **hoặc** đĩa còn dưới `DISK_FREE_WARN_PERCENT`
(mặc định 10%), bạn nhận một tin Telegram nhắc — tối đa một lần trong 6 giờ, và chỉ
khi tin nhắn thực sự gửi được.

Xem tình trạng hiện tại bất cứ lúc nào:

```bash
npm run health          # có mục storage: số tệp, số MB, dung lượng đĩa còn trống, cảnh báo
curl -s http://127.0.0.1:4000/api/health | python3 -m json.tool
```

Muốn đổi ngưỡng: sửa `STORAGE_WARN_TOTAL_MB` / `DISK_FREE_WARN_PERCENT` trong
`backend/.env` rồi `npm start` lại. Đặt `0` để tắt từng loại cảnh báo.

---

## 9. Việc định kỳ (nhắc để khỏi quên)

| Chu kỳ | Việc |
| --- | --- |
| Mỗi tuần | `npm run backup` + copy `backups/` sang thẻ nhớ/máy tính |
| Mỗi tháng | `npm run doctor` · xem còn trống bao nhiêu, pin có ổn không |
| Mỗi 6 tháng | Đổi `JWT_SECRET`, mật khẩu ứng dụng Gmail, xoay token tunnel (xem `docs/ENV-SECRETS.md`) |
| Khi có người mới | Vào **Mời thành viên** trong app (hoặc `/admin` → *Lời mời*) để tạo lời mời |
| Khi ai rời nhóm | `/admin` → *Thành viên* → bỏ tick **Đang hoạt động** (không cần xoá dữ liệu) |
