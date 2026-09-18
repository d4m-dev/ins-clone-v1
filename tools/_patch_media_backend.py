#!/usr/bin/env python3
"""Patch backend cho tính năng Reels/Stories (chạy 1 lần)."""
import pathlib
import sys

ROOT = pathlib.Path('/home/user/familygram/backend')


def patch(rel, old, new, label):
    p = ROOT / rel
    s = p.read_text()
    if old not in s:
        print(f'❌ KHÔNG TÌM THẤY trong {rel}: {label}')
        sys.exit(1)
    p.write_text(s.replace(old, new, 1))
    print(f'✅ {rel} — {label}')


# 1) config/env.js — cấu hình video & nhạc nền
patch('config/env.js', """  uploads: {
    dir: optional('UPLOAD_DIR', 'uploads'),
    maxSizeMb: int('MAX_UPLOAD_SIZE_MB', 15),
    allowedMimeTypes: list('ALLOWED_MIME_TYPES', [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ]),
    filenameBytes: int('IMAGE_FILENAME_BYTES', 16),
  },""", """  uploads: {
    dir: optional('UPLOAD_DIR', 'uploads'),
    maxSizeMb: int('MAX_UPLOAD_SIZE_MB', 15),
    allowedMimeTypes: list('ALLOWED_MIME_TYPES', [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ]),
    filenameBytes: int('IMAGE_FILENAME_BYTES', 16),

    /* --- Reels (video) --- */
    maxVideoSizeMb: int('MAX_VIDEO_SIZE_MB', 60),
    // Trần thời lượng; server tự đọc từ atom mvhd nên KHÔNG cần ffprobe.
    maxVideoDurationSeconds: int('MAX_VIDEO_DURATION_SECONDS', 60),
    allowedVideoMimeTypes: list('ALLOWED_VIDEO_MIME_TYPES', [
      'video/mp4',
      'video/webm',
      'video/quicktime',
    ]),

    /* --- Nhạc nền (không mux, phát đồng bộ ở client) --- */
    maxAudioSizeMb: int('MAX_AUDIO_SIZE_MB', 10),
    allowedAudioMimeTypes: list('ALLOWED_AUDIO_MIME_TYPES', [
      'audio/mpeg',
      'audio/mp4',
      'audio/aac',
      'audio/ogg',
      'audio/wav',
    ]),
  },""", 'cấu hình video/nhạc nền')

# 2) storage.service.js — danh sách trắng tên tệp + thống kê video
patch('services/storage.service.js',
      '/** Filenames are generated server-side; this is a second line of defence. */\nconst SAFE_FILENAME = /^[a-z0-9-]+\\.(jpg|jpeg|png|webp|gif)$/i;',
      """/**
 * Tên tệp do server sinh ra; đây là lớp phòng thủ thứ hai.
 * Chấp nhận cả video và nhạc nền (Reels) — vẫn chỉ gồm các đuôi trong danh sách trắng.
 */
const SAFE_FILENAME = /^[a-z0-9-]+\\.(jpg|jpeg|png|webp|gif|mp4|webm|mov|mp3|m4a|aac|ogg|wav)$/i;""",
      'SAFE_FILENAME mở rộng')

patch('services/storage.service.js', """async function getStorageStats() {
  let files = 0;
  let bytes = 0;
  for (const folder of ['posts', 'avatars']) {""", """async function getStorageStats() {
  let files = 0;
  let bytes = 0;
  let videos = 0;
  for (const folder of ['posts', 'avatars']) {""", 'đếm video')

patch('services/storage.service.js', """        const stats = await fs.stat(path.join(dir, entry.name));
        files += 1;
        bytes += stats.size;""", """        const stats = await fs.stat(path.join(dir, entry.name));
        files += 1;
        bytes += stats.size;
        if (/\\.(mp4|webm|mov)$/i.test(entry.name)) videos += 1;""", 'phân loại video')

patch('services/storage.service.js',
      '  return { files, bytes, megabytes: Number((bytes / 1024 / 1024).toFixed(2)) };',
      '  return { files, videos, bytes, megabytes: Number((bytes / 1024 / 1024).toFixed(2)) };',
      'trả về số video')

patch('services/storage.service.js',
      '  logger.info(`Uploads directory ready: ${UPLOAD_ROOT} (max ${env.uploads.maxSizeMb} MB/image)`);',
      """  logger.info(
    `Uploads directory ready: ${UPLOAD_ROOT} — ` +
      `ảnh ≤ ${env.uploads.maxSizeMb} MB · video ≤ ${env.uploads.maxVideoSizeMb} MB/` +
      `${env.uploads.maxVideoDurationSeconds}s · nhạc ≤ ${env.uploads.maxAudioSizeMb} MB`
  );""", 'log khởi động')

# 3) static.middleware.js — cho phép video/nhạc, hỗ trợ Range request
patch('middleware/static.middleware.js',
      "const SAFE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];",
      """/**
 * Đuôi tệp được phép phục vụ tĩnh. Video và nhạc nền (Reels) nằm cùng thư mục
 * posts/, nhưng TUYỆT ĐỐI không có .svg/.html/.js → vẫn không thể biến upload
 * thành XSS.
 */
const SAFE_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.webp', '.gif',   // ảnh
  '.mp4', '.webm', '.mov',                     // video (Reels)
  '.mp3', '.m4a', '.aac', '.ogg', '.wav',      // nhạc nền
];""", 'danh sách đuôi tệp')

patch('middleware/static.middleware.js', """function setUploadHeaders(res, filePath) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // Vercel frontend needs the bytes
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
  // Filenames contain 16 random bytes → content is effectively immutable.
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
}""", """function setUploadHeaders(res, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const isMedia = ['.mp4', '.webm', '.mov', '.mp3', '.m4a', '.aac', '.ogg', '.wav'].includes(extension);

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox"
  );
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // Vercel frontend needs the bytes
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Ảnh, video và nhạc đều phục vụ inline để thẻ <img>/<video>/<audio> dùng được.
  // Chức năng "tải về" do route /api/posts/:id/download lo (attachment).
  res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
  // Tên tệp chứa 16 byte ngẫu nhiên → nội dung bất biến.
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

  if (isMedia) {
    // Bắt buộc để <video> tua được và trình phát nhạc gửi Range request.
    res.setHeader('Accept-Ranges', 'bytes');
  }
}""", 'header cho media')

patch('middleware/static.middleware.js', """    express.static(UPLOAD_ROOT, {
      index: false,
      dotfiles: 'deny',
      redirect: false,
      etag: true,
      lastModified: true,
      maxAge: '365d',
      immutable: true,
      setHeaders: setUploadHeaders,
    }),""", """    express.static(UPLOAD_ROOT, {
      index: false,
      dotfiles: 'deny',
      redirect: false,
      etag: true,
      lastModified: true,
      maxAge: '365d',
      immutable: true,
      acceptRanges: true, // cần cho việc tua video
      setHeaders: setUploadHeaders,
    }),""", 'acceptRanges')

# 4) config/urls.js — endpoint mới
patch('config/urls.js', """    posts: {
      list: join(BASE, API_PREFIX, 'posts'),
      create: join(BASE, API_PREFIX, 'posts'),
      byId: (id) => join(BASE, API_PREFIX, 'posts', id),
      like: (id) => join(BASE, API_PREFIX, 'posts', id, 'likes'),
      comments: (id) => join(BASE, API_PREFIX, 'posts', id, 'comments'),
    },""", """    posts: {
      list: join(BASE, API_PREFIX, 'posts'),
      create: join(BASE, API_PREFIX, 'posts'),
      byId: (id) => join(BASE, API_PREFIX, 'posts', id),
      like: (id) => join(BASE, API_PREFIX, 'posts', id, 'likes'),
      comments: (id) => join(BASE, API_PREFIX, 'posts', id, 'comments'),
      views: (id) => join(BASE, API_PREFIX, 'posts', id, 'views'),
      download: (id) => join(BASE, API_PREFIX, 'posts', id, 'download'),
    },
    /** Reels — dòng video dọc. */
    reels: {
      list: join(BASE, API_PREFIX, 'reels'),
      byId: (id) => join(BASE, API_PREFIX, 'reels', id),
    },
    /** Khoảnh khắc 24 giờ (Stories). */
    stories: {
      list: join(BASE, API_PREFIX, 'stories'),
    },""", 'endpoint reels/stories/download/views')

# 5) .env.example
patch('.env.example', """UPLOAD_DIR=uploads
MAX_UPLOAD_SIZE_MB=15
ALLOWED_MIME_TYPES=image/jpeg,image/png,image/webp,image/gif
IMAGE_FILENAME_BYTES=16""", """UPLOAD_DIR=uploads
MAX_UPLOAD_SIZE_MB=15
ALLOWED_MIME_TYPES=image/jpeg,image/png,image/webp,image/gif
IMAGE_FILENAME_BYTES=16

# --- Reels (video) — KHÔNG cần ffmpeg: server tự đọc thời lượng từ atom mvhd ---
MAX_VIDEO_SIZE_MB=60
MAX_VIDEO_DURATION_SECONDS=60
ALLOWED_VIDEO_MIME_TYPES=video/mp4,video/webm,video/quicktime

# --- Nhạc nền cho Reels (phát đồng bộ ở client, KHÔNG mux vào video) ---
MAX_AUDIO_SIZE_MB=10
ALLOWED_AUDIO_MIME_TYPES=audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav""",
      'biến môi trường video/nhạc')

print('\nXong 5 tệp cấu hình/hạ tầng.')
