'use strict';

/**
 * middleware/static.middleware.js
 * ---------------------------------------------------------------------------
 * Hardening for the /uploads directory. User-uploaded content is the most
 * dangerous part of any photo app, so we:
 *
 *  1. Only answer GET/HEAD (no PUT/DELETE against the filesystem).
 *  2. Reject any path containing traversal, null bytes or dot-files.
 *  3. Whitelist extensions — an uploaded .svg/.html/.js can never execute.
 *  4. Send `X-Content-Type-Options: nosniff` so the browser cannot be tricked
 *     into interpreting a .jpg as HTML/JS.
 *  5. Send a restrictive CSP for every asset (defence in depth: even if a
 *     text/html file slipped in, no script can run).
 *  6. Never serve directory listings (`index: false`), reduce caching to
 *     immutable only for our generated filenames.
 * ---------------------------------------------------------------------------
 */

const path = require('path');
const express = require('express');
const { env } = require('../config/env');
const ApiError = require('../utils/ApiError');
const { UPLOAD_ROOT, ALLOWED_MIME } = require('./upload.middleware');

/**
 * Đuôi tệp được phép phục vụ tĩnh. Video và nhạc nền (Reels) nằm cùng thư mục
 * posts/, nhưng TUYỆT ĐỐI không có .svg/.html/.js → vẫn không thể biến upload
 * thành XSS.
 */
const SAFE_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.webp', '.gif',   // ảnh
  '.mp4', '.webm', '.mov',                     // video (Reels)
  '.mp3', '.m4a', '.aac', '.ogg', '.wav',      // nhạc nền
];
const TRAVERSAL = /(\.\.|%2e%2e|%00|\0)/i;

const uploadsUrlPrefix = '/uploads';

/** Gate-keeper that runs before express.static. */
function guardUploads(req, _res, next) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    return next(ApiError.forbidden('Method not allowed on static assets.'));
  }

  let decodedPath;
  try {
    // decodeURIComponent throws on malformed input such as "%E0%A4%A".
    decodedPath = decodeURIComponent(req.path);
  } catch {
    return next(ApiError.badRequest('Malformed path.'));
  }

  if (TRAVERSAL.test(decodedPath) || decodedPath.split('/').some((seg) => seg.startsWith('.'))) {
    return next(ApiError.forbidden('Invalid path.'));
  }

  const extension = path.extname(decodedPath).toLowerCase();
  if (!SAFE_EXTENSIONS.includes(extension)) {
    return next(ApiError.notFound('Not found.'));
  }
  return next();
}

/** Headers applied to every served image. */
function setUploadHeaders(res, filePath) {
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
}

function createUploadsRouter() {
  const router = express.Router();

  router.use(
    guardUploads,
    express.static(UPLOAD_ROOT, {
      index: false,
      dotfiles: 'deny',
      redirect: false,
      etag: true,
      lastModified: true,
      maxAge: '365d',
      immutable: true,
      acceptRanges: true, // cần cho việc tua video
      setHeaders: setUploadHeaders,
    }),
    // Reached only when the file does not exist.
    (_req, _res, next) => next(ApiError.notFound('Image not found.'))
  );

  return router;
}

module.exports = {
  guardUploads,
  createUploadsRouter,
  uploadsUrlPrefix,
  UPLOAD_ROOT,
  ALLOWED_MIME,
  maxUploadMb: env.uploads.maxSizeMb,
};
