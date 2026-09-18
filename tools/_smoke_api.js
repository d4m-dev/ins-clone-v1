#!/usr/bin/env node
'use strict';

/**
 * tools/_smoke_api.js — integration test cho các endpoint mới (Reels · Stories ·
 * tải về · đếm lượt xem) mà KHÔNG cần MariaDB: chạy Sequelize với SQLite.
 *
 * Chỉ dùng cho môi trường phát triển. Không nằm trong luồng production.
 *   node tools/_smoke_api.js
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

/* ------------------------- biến môi trường của test ------------------------ */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-smoke-'));
process.env.NODE_ENV = 'development';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = path.join(TMP, 'test.sqlite');
process.env.DB_LOGGING = 'false';
process.env.UPLOAD_DIR = path.join(TMP, 'uploads');
process.env.PUBLIC_BASE_URL = 'http://127.0.0.1:4100';
process.env.JWT_SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
process.env.ADMIN_SESSION_SECRET = 'test-admin-secret-0123456789abcdef0123456789';
process.env.ALLOWED_MIME_TYPES = 'image/jpeg,image/png';
process.env.ALLOWED_VIDEO_MIME_TYPES = 'video/mp4,video/webm';
process.env.MAX_VIDEO_DURATION_SECONDS = '60';
process.env.MAX_VIDEO_SIZE_MB = '5';
process.env.TELEGRAM_ENABLED = 'false';

const BACKEND = path.resolve(__dirname, '..', 'backend');
const express = require(path.join(BACKEND, 'node_modules/express'));
const helmet = require(path.join(BACKEND, 'node_modules/helmet'));
const cors = require(path.join(BACKEND, 'node_modules/cors'));
const multer = require(path.join(BACKEND, 'node_modules/multer'));

const { sequelize } = require(path.join(BACKEND, 'models'));
const { createUploadsRouter } = require(path.join(BACKEND, 'middleware/static.middleware'));
const { UPLOAD_ROOT } = require(path.join(BACKEND, 'middleware/upload.middleware'));
const apiRoutes = require(path.join(BACKEND, 'routes'));
const { notFoundHandler, errorHandler } = require(path.join(BACKEND, 'middleware/error.middleware'));

const BASE = 'http://127.0.0.1:4100';
const results = [];
let failures = 0;

function check(label, condition, detail = '') {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  results.push(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
}

const api = async (method, url, { token, body, form } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  // QUAN TRỌNG: với FormData KHÔNG được đặt Content-Type — fetch sẽ tự thêm
  // `multipart/form-data; boundary=…`. Đặt tay sẽ làm multer bỏ qua request.
  let payload;
  if (form) {
    payload = form;
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(`${BASE}${url}`, { method, headers, body: payload });
  const text = await response.text();
  let parsed = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, payload: parsed, headers: response.headers, text };
};

const fileBlob = (filePath, type) => new Blob([fs.readFileSync(filePath)], { type });

(async () => {
  // ---------------------------- dựng app Express ----------------------------
  const app = express();
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use('/uploads', createUploadsRouter());
  app.use('/api', apiRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  await sequelize.sync({ force: true });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(4100, '127.0.0.1', resolve));

  const PHOTO = path.resolve(__dirname, 'demo-images/demo-1.jpg');
  // Video mẫu: dùng /tmp/sample.mp4 nếu có, không thì lấy clip đi kèm repo
  // → clone về là chạy được test ngay, không cần tải thêm gì.
  const VIDEO = fs.existsSync('/tmp/sample.mp4')
    ? '/tmp/sample.mp4'
    : path.resolve(__dirname, 'demo-images/demo-clip.mp4');

  try {
    /* --------------------------------- auth -------------------------------- */
    const reg = await api('POST', '/api/auth/register', {
      body: { username: 'test.member', fullName: 'Nguyễn Test', email: 'test@family.local', password: 'matkhau123' },
    });
    check('Đăng ký tài khoản', reg.status === 201 && reg.payload.data?.token, `HTTP ${reg.status}`);
    const token = reg.payload.data?.token;

    const me = await api('GET', '/api/auth/me', { token });
    check('Lấy thông tin qua JWT', me.status === 200 && me.payload.data?.user?.username === 'test.member');
    check('Ngôn ngữ mặc định của thành viên = vi', me.payload.data?.user?.locale === 'vi', `locale=${me.payload.data?.user?.locale}`);

    /* ------------------------------ đăng ẢNH ------------------------------- */
    const photoForm = new FormData();
    photoForm.append('image', fileBlob(PHOTO, 'image/jpeg'), 'demo.jpg');
    photoForm.append('caption', 'Bữa cơm tối ở quê 🍲');
    photoForm.append('location', 'Chư Ty, Gia Lai');
    const photoPost = await api('POST', '/api/posts', { token, form: photoForm });
    check('Đăng ảnh', photoPost.status === 201, JSON.stringify(photoPost.payload).slice(0, 160));
    const photo = photoPost.payload.data?.post;
    check('mediaType = photo', photo?.mediaType === 'photo');
    check('imageUrl trỏ tới /uploads', photo?.imageUrl?.includes('/uploads/'), photo?.imageUrl);
    check('Có downloadUrl trong payload', typeof photo?.downloadUrl === 'string' && photo.downloadUrl.includes('/download'));

    /* ---------------------------- đăng VIDEO (Reels) ----------------------- */
    const videoForm = new FormData();
    videoForm.append('video', fileBlob(VIDEO, 'video/mp4'), 'clip.mp4');
    videoForm.append('image', fileBlob(PHOTO, 'image/jpeg'), 'poster.jpg');
    videoForm.append('caption', 'Hai đứa nhỏ chơi mưa 🌧️');
    videoForm.append('durationSeconds', '6'); // client khai báo
    const videoPost = await api('POST', '/api/posts', { token, form: videoForm });
    check('Đăng video (Reels)', videoPost.status === 201, JSON.stringify(videoPost.payload).slice(0, 200));
    const video = videoPost.payload.data?.post;
    check('mediaType = video', video?.mediaType === 'video');
    check('Video có URL riêng', Boolean(video?.videoUrl), video?.videoUrl);
    check(
      'Server tự đọc thời lượng từ mvhd (≈5.76s, KHÔNG cần ffprobe)',
      video?.durationSeconds > 5.5 && video.durationSeconds < 6.1,
      `${video?.durationSeconds}s → ${video?.durationLabel}`
    );
    check('Ảnh bìa (poster) được lưu kèm video', Boolean(video?.imageUrl));

    /* --------------------- chặn video quá dài (fallback) ------------------- */
    const longForm = new FormData();
    longForm.append('video', new Blob([Buffer.from('not-a-real-webm-but-mime-says-so')], { type: 'video/webm' }), 'long.webm');
    longForm.append('durationSeconds', '180'); // server không parse được webm → dùng số này
    const longPost = await api('POST', '/api/posts', { token, form: longForm });
    check(
      'Chặn video vượt 60 giây → 422',
      longPost.status === 422 || longPost.status === 400,
      `HTTP ${longPost.status}: ${longPost.payload?.message || ''}`
    );

    /* ------------------------------- khoá lọc ------------------------------ */
    const badForm = new FormData();
    badForm.append('image', new Blob([Buffer.from('MZ executable')], { type: 'application/zip' }), 'virus.zip');
    const badPost = await api('POST', '/api/posts', { token, form: badForm });
    check('Từ chối định dạng không nằm trong danh sách trắng', badPost.status === 400, `HTTP ${badPost.status}`);

    /* ------------------------------ bảng tin ------------------------------- */
    const feed = await api('GET', '/api/posts?limit=10');
    check('Bảng tin trả về 2 bài', feed.payload.data?.posts?.length === 2, `nhận ${feed.payload.data?.posts?.length}`);

    /* -------------------------------- Reels -------------------------------- */
    const reels = await api('GET', '/api/reels');
    check('Reels chỉ trả về video', reels.payload.data?.reels?.length === 1 && reels.payload.data.reels[0].isVideo === true);
    check('Reels kèm giới hạn thời lượng', reels.payload.data?.maxDurationSeconds === 60);

    /* ------------------------------- Stories ------------------------------- */
    const stories = await api('GET', '/api/stories');
    check('Stories gom theo tác giả', stories.payload.data?.groups?.length === 1, `nhóm: ${stories.payload.data?.groups?.length}`);
    check('Stories chứa cả ảnh và video trong 24h', stories.payload.data?.total === 2, `tổng ${stories.payload.data?.total}`);
    check('Cửa sổ story = 24 giờ', stories.payload.data?.windowHours === 24);

    /* ----------------------------- lượt xem -------------------------------- */
    const before = video?.viewCount ?? 0;
    const view1 = await api('POST', `/api/posts/${video.id}/views`);
    const view2 = await api('POST', `/api/posts/${video.id}/views`);
    check(
      'Đếm lượt xem tăng dần',
      view1.payload.data?.viewCount === before + 1 && view2.payload.data?.viewCount === before + 2,
      `${before} → ${view2.payload.data?.viewCount}`
    );

    /* ------------------------------ tải về --------------------------------- */
    const dlVideo = await fetch(`${BASE}/api/posts/${video.id}/download`);
    const videoBytes = Buffer.from(await dlVideo.arrayBuffer());
    check('Tải video về (attachment)', dlVideo.status === 200 && /attachment/.test(dlVideo.headers.get('content-disposition') || ''));
    check(
      'Tên tệp tải về thân thiện',
      /familygram-test\.member-\d+-\d{4}-\d{2}-\d{2}\.mp4/.test(dlVideo.headers.get('content-disposition') || ''),
      dlVideo.headers.get('content-disposition')
    );
    check('Nội dung tải về khớp tệp gốc', videoBytes.length === fs.statSync(VIDEO).size, `${videoBytes.length} vs ${fs.statSync(VIDEO).size} bytes`);

    const dlPhoto = await fetch(`${BASE}/api/posts/${photo.id}/download`);
    check('Tải ảnh về', dlPhoto.status === 200 && /\.jpg/.test(dlPhoto.headers.get('content-disposition') || ''));

    /* --------------------------- phục vụ tĩnh ------------------------------ */
    const videoUrlPath = new URL(video.videoUrl).pathname;
    const headVideo = await fetch(`${BASE}${videoUrlPath}`, { headers: { Range: 'bytes=0-99' } });
    check('Video hỗ trợ Range request (tua được)', headVideo.status === 206, `HTTP ${headVideo.status}`);
    check('Có header Accept-Ranges', headVideo.headers.get('accept-ranges') === 'bytes');

    /* ------------------------ bảo mật tệp tĩnh ----------------------------- */
    const traversal = await fetch(`${BASE}/uploads/..%2f..%2f.env`);
    check('Chặn path traversal', traversal.status === 403 || traversal.status === 404, `HTTP ${traversal.status}`);
    const svg = await fetch(`${BASE}/uploads/evil.svg`);
    check('Không phục vụ .svg (chống XSS)', svg.status === 403 || svg.status === 404, `HTTP ${svg.status}`);
    const method = await fetch(`${BASE}${videoUrlPath}`, { method: 'DELETE' });
    check('Chặn DELETE trên tệp tĩnh', method.status === 403 || method.status === 404 || method.status === 405, `HTTP ${method.status}`);

    /* ------------------------------- xoá bài ------------------------------- */
    const before2 = fs.readdirSync(path.join(UPLOAD_ROOT, 'posts')).length;
    const del = await api('DELETE', `/api/posts/${video.id}`, { token });
    const after2 = fs.readdirSync(path.join(UPLOAD_ROOT, 'posts')).length;
    check('Xoá bài Reels (ảnh bìa + video)', del.status === 200 && del.payload.data?.removedFiles === 2, `xoá ${del.payload.data?.removedFiles} tệp`);
    check('Tệp đã bị xoá khỏi ổ đĩa', after2 === before2 - 2, `${before2} → ${after2} tệp`);

    const reelsAfter = await api('GET', '/api/reels');
    check('Reels rỗng sau khi xoá', reelsAfter.payload.data?.reels?.length === 0);
  } catch (error) {
    check('Chạy trọn bộ test', false, error.stack?.split('\n').slice(0, 3).join(' | '));
  } finally {
    server.close();
    await sequelize.close();
    console.log(`\n${results.join('\n')}`);
    console.log(`\n${failures === 0 ? '🎉 TẤT CẢ ĐỀU ĐẠT' : `⚠️  ${failures} phép thử thất bại`}  (${results.length} phép thử)`);
    console.log(`Thư mục tạm: ${TMP}`);
    process.exit(failures === 0 ? 0 : 1);
  }
})();
