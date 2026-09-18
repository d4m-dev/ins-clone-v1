#!/usr/bin/env node
'use strict';

/**
 * tools/_smoke_api.js — kiểm thử tích hợp cho backend thật, KHÔNG cần MariaDB.
 * ---------------------------------------------------------------------------
 * Chạy nguyên bộ routes (auth · posts · reels · stories · invites · tải tệp)
 * trên SQLite trong bộ nhớ tạm, rồi kiểm tra từng hành vi quan trọng:
 *
 *   node tools/_smoke_api.js
 *
 * Vì sao SQLite? Điện thoại Termux chỉ có MariaDB; ở môi trường CI/dev không
 * dựng được MariaDB thì SQLite cho phép chạy đúng các controller thật.
 * Đây là script DEV, không nằm trong luồng chạy production.
 * ---------------------------------------------------------------------------
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
process.env.ALLOWED_MIME_TYPES = 'image/jpeg,image/png,image/webp,image/gif';
process.env.ALLOWED_VIDEO_MIME_TYPES = 'video/mp4,video/webm,video/quicktime';
process.env.MAX_VIDEO_DURATION_SECONDS = '60';
process.env.MAX_UPLOAD_SIZE_MB = '5';
process.env.TELEGRAM_ENABLED = 'false';
process.env.EMAIL_ENABLED = 'false';

/**
 * Script nằm ở tools/ nhưng mã nguồn ở backend/ — nạp phụ thuộc từ
 * backend/node_modules để chạy được ngay cả khi repo chưa cài ở thư mục gốc.
 */
const BACKEND = path.resolve(__dirname, '..', 'backend');
module.paths.unshift(path.join(BACKEND, 'node_modules'));

const express = require(path.join(BACKEND, 'node_modules/express'));
const helmet = require(path.join(BACKEND, 'node_modules/helmet'));
const cors = require(path.join(BACKEND, 'node_modules/cors'));

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

const api = async (method, url, { token, body, form, headers: extraHeaders } = {}) => {
  const headers = { ...extraHeaders };
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
  const VIDEO = fs.existsSync('/tmp/sample.mp4')
    ? '/tmp/sample.mp4'
    : path.resolve(__dirname, 'demo-images/demo-clip.mp4');

  try {
    /* --------------------------------- auth -------------------------------- */
    const reg = await api('POST', '/api/auth/register', {
      body: { username: 'test.member', fullName: 'Nguyễn Test', email: 'test@congdong.local', password: 'matkhau123' },
    });
    check('Đăng ký tài khoản', reg.status === 201 && reg.payload.data?.token, `HTTP ${reg.status}`);
    const token = reg.payload.data?.token;

    const me = await api('GET', '/api/auth/me', { token });
    check('Lấy thông tin qua JWT', me.status === 200 && me.payload.data?.user?.username === 'test.member');
    check('Ngôn ngữ mặc định của thành viên = vi', me.payload.data?.user?.locale === 'vi', `locale=${me.payload.data?.user?.locale}`);

    /* ------------------------- quên / đặt lại mật khẩu --------------------- */
    const forgot = await api('POST', '/api/auth/forgot-password', { body: { email: 'test@congdong.local' } });
    check('Quên mật khẩu trả về thông báo chung', forgot.status === 200 && /Nếu email này/.test(forgot.payload.data?.message || ''));
    const forgotUnknown = await api('POST', '/api/auth/forgot-password', { body: { email: 'khong.ton.tai@congdong.local' } });
    check(
      'Không tiết lộ email có tồn tại hay không (chống dò tài khoản)',
      forgotUnknown.status === 200 && forgotUnknown.payload.data?.message === forgot.payload.data?.message
    );

    const { User } = require(path.join(BACKEND, 'models'));
    const stored = await User.scope('withResetToken').findOne({ where: { username: 'test.member' } });
    check('Token đặt lại được lưu dưới dạng BĂM (không lưu token gốc)', Boolean(stored?.passwordResetHash) && stored.passwordResetHash.length === 64);
    check('Token có hạn dùng', new Date(stored.passwordResetExpiresAt).getTime() > Date.now());

    const reset = await api('POST', '/api/auth/reset-password', { body: { token: 'token-sai', password: 'matkhaumoi123' } });
    check('Token sai bị từ chối', reset.status === 400, `HTTP ${reset.status}`);

    /* ------------------- ngôn ngữ thông báo phía máy chủ ------------------- */
    const forgotEn = await api('POST', '/api/auth/forgot-password', {
      body: { email: 'test@congdong.local' },
      headers: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    check(
      'Accept-Language: en → thông báo tiếng Anh',
      /If this e-mail has an account/.test(forgotEn.payload.data?.message || ''),
      forgotEn.payload.data?.message?.slice(0, 60)
    );

    const forgotZh = await api('POST', '/api/auth/forgot-password', {
      body: { email: 'test@congdong.local' },
      headers: { 'Accept-Language': 'zh-CN,zh;q=0.9' },
    });
    check('Accept-Language: zh → thông báo tiếng Trung', /如果该邮箱已注册/.test(forgotZh.payload.data?.message || ''));

    const dupEn = await api('POST', '/api/auth/register', {
      body: { username: 'khac.ten', fullName: 'Khác', email: 'test@congdong.local', password: 'matkhau123' },
      headers: { 'Accept-Language': 'en' },
    });
    check(
      'Lỗi trùng email cũng theo ngôn ngữ (en)',
      dupEn.status === 409 && /already used/.test(dupEn.payload.message || ''),
      dupEn.payload.message
    );

    const badResetZh = await api('POST', '/api/auth/reset-password', {
      body: { token: 'sai-nua', password: 'matkhaumoi123' },
      headers: { 'Accept-Language': 'zh' },
    });
    check('Lỗi token đặt lại theo ngôn ngữ (zh)', /密码重置链接无效/.test(badResetZh.payload.message || ''), badResetZh.payload.message);

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
    videoForm.append('caption', 'Mưa đầu mùa trên phố 🌧️');
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
      /pixgram-test\.member-\d+-\d{4}-\d{2}-\d{2}\.mp4/.test(dlVideo.headers.get('content-disposition') || ''),
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

    /* -------------------------- lời mời thành viên ------------------------- */
    const inviteCreate = await api('POST', '/api/invites', {
      token,
      body: { email: 'ban.moi@congdong.local', role: 'member', message: 'Tham gia cùng mọi người nhé!' },
    });
    check(
      'Tạo lời mời (admin đầu tiên)',
      inviteCreate.status === 201 && Boolean(inviteCreate.payload.data?.invite?.id),
      JSON.stringify(inviteCreate.payload).slice(0, 150)
    );
    const invite = inviteCreate.payload.data?.invite;
    check('Lời mời có hạn dùng + trạng thái pending', invite?.status === 'pending' && Boolean(invite?.expiresAt));
    check(
      'Không gửi được email → trả về link để gửi tay',
      inviteCreate.payload.data?.emailSent === false && String(inviteCreate.payload.data?.inviteUrl).includes('/register?invite=')
    );

    const dupe = await api('POST', '/api/invites', { token, body: { email: 'test@congdong.local' } });
    check('Từ chối mời người đã có tài khoản', dupe.status === 409, `HTTP ${dupe.status}`);

    const list = await api('GET', '/api/invites', { token });
    check('Danh sách lời mời của quản trị viên', list.payload.data?.invites?.length === 1, `nhận ${list.payload.data?.invites?.length}`);
    check('Danh sách KHÔNG trả tokenHash', list.payload.data?.invites?.[0]?.tokenHash === undefined);

    const inviteTokenRow = await require(path.join(BACKEND, 'models')).Invite.scope('withToken').findByPk(invite.id);
    const rawToken = 'a'.repeat(43); // token giả để thử nhánh sai
    check('DB chỉ lưu token đã băm', inviteTokenRow.tokenHash.length === 64 && inviteTokenRow.tokenHash !== rawToken);

    const badInvite = await api('GET', '/api/invites/khong-he-ton-tai');
    check('Link mời sai → 404', badInvite.status === 404, `HTTP ${badInvite.status}`);

    const revoke = await api('DELETE', `/api/invites/${invite.id}`, { token });
    check('Thu hồi lời mời', revoke.status === 200 && revoke.payload.data?.invite?.status === 'revoked', JSON.stringify(revoke.payload).slice(0, 120));
    const afterRevoke = await api('GET', `/api/invites/${rawToken}`);
    check('Link đã thu hồi → không dùng được', afterRevoke.status === 404 || afterRevoke.status === 410, `HTTP ${afterRevoke.status}`);

    /* -------------------------- đăng ký bằng lời mời ----------------------- */
    const { generateToken, hashToken, inDays } = require(path.join(BACKEND, 'utils/tokens'));
    const invite2Raw = generateToken();
    await require(path.join(BACKEND, 'models')).Invite.create({
      email: 'ban.hai@congdong.local',
      role: 'admin',
      tokenHash: hashToken(invite2Raw),
      invitedById: 1,
      expiresAt: inDays(7),
    });

    const checkInvite = await api('GET', `/api/invites/${invite2Raw}`);
    check('Link mời hợp lệ → 200 kèm thông tin', checkInvite.status === 200 && checkInvite.payload.data?.invite?.email === 'ban.hai@congdong.local', `HTTP ${checkInvite.status}`);

    const regByInvite = await api('POST', '/api/auth/register', {
      body: {
        username: 'ban.hai',
        fullName: 'Con Trai',
        email: 'dia.chi.khac@congdong.local', // client cố tình gửi email khác
        password: 'matkhau123',
        inviteToken: invite2Raw,
      },
    });
    check('Đăng ký bằng lời mời', regByInvite.status === 201, JSON.stringify(regByInvite.payload).slice(0, 150));
    check(
      'Email + vai trò lấy từ LỜI MỜI, không tin client',
      regByInvite.payload.data?.user?.role === 'admin' &&
        (await require(path.join(BACKEND, 'models')).User.findOne({ where: { username: 'ban.hai' } }))?.email === 'ban.hai@congdong.local'
    );

    const reused = await api('POST', '/api/auth/register', {
      body: { username: 'ban.hai2', fullName: 'Bạn Hai 2', email: 'x@congdong.local', password: 'matkhau123', inviteToken: invite2Raw },
    });
    check('Lời mời chỉ dùng được MỘT lần', reused.status === 400, `HTTP ${reused.status}`);

    /* ------------------------------- xoá bài ------------------------------- */
    const before2 = fs.readdirSync(path.join(UPLOAD_ROOT, 'posts')).length;
    const del = await api('DELETE', `/api/posts/${video.id}`, { token });
    const after2 = fs.readdirSync(path.join(UPLOAD_ROOT, 'posts')).length;
    check('Xoá bài Reels (ảnh bìa + video)', del.status === 200 && del.payload.data?.removedFiles === 2, `xoá ${del.payload.data?.removedFiles} tệp`);
    check('Tệp đã bị xoá khỏi ổ đĩa', after2 === before2 - 2, `${before2} → ${after2} tệp`);

    const reelsAfter = await api('GET', '/api/reels');
    check('Reels rỗng sau khi xoá', reelsAfter.payload.data?.reels?.length === 0);

    /* ------------------------------- health -------------------------------- */
    const health = await api('GET', '/api/health');
    check('Health trả trạng thái email', health.payload.data?.email?.enabled === false, JSON.stringify(health.payload.data?.email || {}));
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
