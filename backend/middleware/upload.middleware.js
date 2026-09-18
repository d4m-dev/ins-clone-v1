'use strict';

/**
 * middleware/upload.middleware.js
 * ---------------------------------------------------------------------------
 * Multer cho ảnh, video (Reels) và nhạc nền — chạy trên Termux/Android.
 *
 * Quyết định bảo mật & hiệu năng:
 *  1. `diskStorage` + tên tệp NGẪU NHIÊN — không bao giờ tin tên do client gửi
 *     (chặn path traversal và các đuôi .php/.html).
 *  2. Phần mở rộng suy ra từ MIME type trong danh sách trắng, không từ tên tệp.
 *  3. `limits.fileSize` riêng cho ảnh / video / nhạc → không làm tràn RAM điện thoại.
 *  4. `fileFilter` kiểm tra cả fieldname LẪN mime type.
 *  5. Video và nhạc nằm cùng thư mục posts/ nhưng có tiền tố tên khác nhau
 *     (v-… cho video, a-… cho audio) để dễ nhận biết khi dọn dẹp.
 * ---------------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { env } = require('../config/env');
const ApiError = require('../utils/ApiError');

/** Thư mục gốc chứa toàn bộ tệp tải lên. */
const UPLOAD_ROOT = path.resolve(__dirname, '..', env.uploads.dir);

/** MIME → đuôi chuẩn. Bất cứ thứ gì không có trong bảng này đều bị từ chối. */
const EXTENSION_BY_MIME = {
  // ảnh
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  // video (Reels)
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  // nhạc nền
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
};

const IMAGE_MIME = env.uploads.allowedMimeTypes.filter((mime) => mime.startsWith('image/'));
const VIDEO_MIME = env.uploads.allowedVideoMimeTypes.filter((mime) => mime.startsWith('video/'));
const AUDIO_MIME = env.uploads.allowedAudioMimeTypes.filter((mime) => mime.startsWith('audio/'));
/** Tệp gửi trong tin nhắn = ảnh ∪ video. */
const ATTACHMENT_MIME = [...IMAGE_MIME, ...VIDEO_MIME];

/** Tiền tố tên tệp theo loại — giúp phân biệt khi liệt kê thư mục. */
const PREFIX = { image: '', video: 'v-', audio: 'a-', attachment: 'c-' };

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** MIME hợp lệ cho một fieldname của form. */
function isAllowed(fieldName, mimeType) {
  if (fieldName === 'image') return IMAGE_MIME.includes(mimeType);
  if (fieldName === 'video') return VIDEO_MIME.includes(mimeType);
  if (fieldName === 'audio') return AUDIO_MIME.includes(mimeType);
  // Tệp gửi trong tin nhắn: ảnh HOẶC video, ngưỡng riêng (env.chat).
  if (fieldName === 'attachment') return ATTACHMENT_MIME.includes(mimeType);
  return false;
}

/** Giới hạn dung lượng (byte) theo fieldname. */
function limitFor(fieldName) {
  if (fieldName === 'video') return env.uploads.maxVideoSizeMb * 1024 * 1024;
  if (fieldName === 'audio') return env.uploads.maxAudioSizeMb * 1024 * 1024;
  if (fieldName === 'attachment') return env.chat.maxAttachmentSizeMb * 1024 * 1024;
  return env.uploads.maxSizeMb * 1024 * 1024;
}

/**
 * Tạo multer instance ghi vào <uploads>/<folder>.
 * @param {'posts'|'avatars'|'chat'} folder
 * @param {Array<'image'|'video'|'audio'|'attachment'>} fields  các trường tệp được phép
 */
function createMediaUploader(folder, fields = ['image']) {
  const destination = ensureDir(path.join(UPLOAD_ROOT, folder));

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, destination),
    filename: (_req, file, cb) => {
      const extension = EXTENSION_BY_MIME[file.mimetype] || '.bin';
      const random = crypto.randomBytes(env.uploads.filenameBytes).toString('hex');
      const stamp = Date.now().toString(36);
      const prefix = PREFIX[file.fieldname] ?? '';
      cb(null, `${prefix}${stamp}-${random}${extension}`);
    },
  });

  return multer({
    storage,
    limits: {
      // Multer áp dụng limit chung; ta kiểm tra lại theo từng field trong fileFilter.
      fileSize: Math.max(limitFor('image'), limitFor('video'), limitFor('audio')),
      files: fields.length,
      fields: 8,
      fieldSize: 2048,
    },
    fileFilter: (_req, file, cb) => {
      if (!fields.includes(file.fieldname)) {
        return cb(ApiError.badRequest(`Trường tệp không hợp lệ: "${file.fieldname}".`));
      }
      if (!isAllowed(file.fieldname, file.mimetype)) {
        const allowed = {
          image: IMAGE_MIME,
          video: VIDEO_MIME,
          audio: AUDIO_MIME,
          attachment: ATTACHMENT_MIME,
        }[file.fieldname];
        return cb(
          ApiError.badRequest(
            `Định dạng "${file.mimetype}" không được hỗ trợ cho ${file.fieldname}. ` +
              `Chấp nhận: ${allowed.join(', ')}`
          )
        );
      }
      return cb(null, true);
    },
  });
}

/* ------------------------------ các instance ------------------------------ */

/** Ảnh đơn (ảnh đại diện). */
const avatarUploader = createMediaUploader('avatars', ['image']);

/** Bài đăng: poster/ảnh + video + nhạc nền. */
const postMediaUploader = createMediaUploader('posts', ['image', 'video', 'audio']);

/**
 * Tệp gửi trong tin nhắn (chat): ảnh hoặc video, tối đa env.chat.maxAttachmentSizeMb.
 * Ghi vào uploads/chat/ — vẫn nằm dưới cây /uploads đã được siết bảo mật
 * (middleware/static.middleware.js), không mở thêm thư mục tĩnh nào khác.
 */
const chatAttachmentUploader = createMediaUploader('chat', ['attachment']);

/** Giữ tên cũ để không phá vỡ import ở nơi khác. */
const postImageUploader = postMediaUploader;

/* ------------------------------- xử lý lỗi -------------------------------- */

/** Dịch lỗi multer thành lỗi JSON nhất quán (kèm ngưỡng đúng của từng loại). */
function handleUploadErrors(err, req, _res, next) {
  if (err instanceof multer.MulterError) {
    const fieldName = err.field || 'image';
    if (err.code === 'LIMIT_FILE_SIZE') {
      const mb =
        {
          video: env.uploads.maxVideoSizeMb,
          audio: env.uploads.maxAudioSizeMb,
          attachment: env.chat.maxAttachmentSizeMb,
        }[fieldName] ?? env.uploads.maxSizeMb;
      const label = { video: 'Video', audio: 'Tệp nhạc', attachment: 'Tệp đính kèm' }[fieldName] ?? 'Ảnh';
      return next(ApiError.tooLarge(`${label} lớn hơn ${mb} MB cho phép.`));
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(
        ApiError.badRequest(
          fieldName === 'attachment'
            ? 'Mỗi tin nhắn chỉ gửi được 1 tệp.'
            : 'Chỉ được tải lên 1 ảnh, 1 video và 1 tệp nhạc mỗi bài.'
        )
      );
    }
    return next(ApiError.badRequest(`Tải tệp bị từ chối: ${err.message}`));
  }
  // fileFilter ném ApiError qua cb(error) → multer trả về nguyên lỗi đó.
  return next(err);
}

/** Kiểm tra lại dung lượng thật của từng tệp sau khi multer ghi xong. */
function assertFileSizes(files = {}) {
  const checks = [
    ['image', files.image?.[0], env.uploads.maxSizeMb, 'Ảnh'],
    ['video', files.video?.[0], env.uploads.maxVideoSizeMb, 'Video'],
    ['audio', files.audio?.[0], env.uploads.maxAudioSizeMb, 'Tệp nhạc'],
    ['attachment', files.attachment?.[0], env.chat.maxAttachmentSizeMb, 'Tệp đính kèm'],
  ];
  for (const [, file, maxMb, label] of checks) {
    if (file && file.size > maxMb * 1024 * 1024) {
      throw ApiError.tooLarge(`${label} lớn hơn ${maxMb} MB cho phép.`);
    }
  }
}

module.exports = {
  UPLOAD_ROOT,
  EXTENSION_BY_MIME,
  IMAGE_MIME,
  VIDEO_MIME,
  AUDIO_MIME,
  ATTACHMENT_MIME,
  ALLOWED_MIME: IMAGE_MIME, // tương thích ngược
  createMediaUploader,
  avatarUploader,
  postMediaUploader,
  postImageUploader,
  chatAttachmentUploader,
  handleUploadErrors,
  assertFileSizes,
  ensureDir,
};
