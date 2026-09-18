'use strict';

/**
 * services/storage.service.js
 * All filesystem work for photos lives here, so controllers never touch `fs`.
 */

const fs = require('fs/promises');
const path = require('path');
const { env } = require('../config/env');
const logger = require('../utils/logger');
const { UPLOAD_ROOT } = require('../middleware/upload.middleware');

/**
 * Tên tệp do server sinh ra; đây là lớp phòng thủ thứ hai.
 * Chấp nhận cả video và nhạc nền (Reels) — vẫn chỉ gồm các đuôi trong danh sách trắng.
 */
const SAFE_FILENAME = /^[a-z0-9-]+\.(jpg|jpeg|png|webp|gif|mp4|webm|mov|mp3|m4a|aac|ogg|wav)$/i;

/** Resolves a stored filename to an absolute path, refusing escapes. */
function resolveStoredFile(filename, folder = 'posts') {
  if (!filename || !SAFE_FILENAME.test(filename)) return null;
  const absolute = path.resolve(UPLOAD_ROOT, folder, filename);
  const base = path.resolve(UPLOAD_ROOT, folder);
  // Belt & braces: never resolve outside the uploads root.
  if (!absolute.startsWith(base + path.sep)) return null;
  return absolute;
}

/** Deletes a stored image; never throws (a missing file is not an error). */
async function deleteStoredFile(filename, folder = 'posts') {
  const absolute = resolveStoredFile(filename, folder);
  if (!absolute) return false;
  try {
    await fs.unlink(absolute);
    logger.info(`Deleted file ${path.relative(UPLOAD_ROOT, absolute)}`);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') logger.warn(`Could not delete ${absolute}: ${error.message}`);
    return false;
  }
}

/** Disk usage report — surfaced on /api/health (useful on a phone). */
async function getStorageStats() {
  let files = 0;
  let bytes = 0;
  let videos = 0;
  // 'chat' = tệp gửi trong tin nhắn; tính vào dung lượng đĩa của điện thoại.
  for (const folder of ['posts', 'avatars', 'chat']) {
    const dir = path.join(UPLOAD_ROOT, folder);
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const stats = await fs.stat(path.join(dir, entry.name));
        files += 1;
        bytes += stats.size;
        if (/\.(mp4|webm|mov)$/i.test(entry.name)) videos += 1;
      }
    } catch {
      /* folder does not exist yet */
    }
  }
  return { files, videos, bytes, megabytes: Number((bytes / 1024 / 1024).toFixed(2)) };
}

async function ensureUploadFolders() {
  // 'chat' = tệp gửi trong tin nhắn (uploads/chat).
  for (const folder of ['posts', 'avatars', 'chat']) {
    await fs.mkdir(path.join(UPLOAD_ROOT, folder), { recursive: true });
  }
  logger.info(
    `Uploads directory ready: ${UPLOAD_ROOT} — ` +
      `ảnh ≤ ${env.uploads.maxSizeMb} MB · video ≤ ${env.uploads.maxVideoSizeMb} MB/` +
      `${env.uploads.maxVideoDurationSeconds}s · nhạc ≤ ${env.uploads.maxAudioSizeMb} MB`
  );
}

/**
 * Dung lượng đĩa còn trống (fs.statfs có từ Node 18.15+, Termux đều đạt).
 * Không hỗ trợ → trả null để phần còn lại vẫn chạy.
 */
async function getDiskSpace() {
  try {
    const stats = await fs.statfs(UPLOAD_ROOT);
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    return {
      totalBytes,
      freeBytes,
      freeMegabytes: Number((freeBytes / 1024 / 1024).toFixed(0)),
      freePercent: totalBytes ? Number(((freeBytes / totalBytes) * 100).toFixed(1)) : null,
    };
  } catch {
    return null;
  }
}

/**
 * Tình trạng lưu trữ + cảnh báo (nếu có).
 * Dùng cho /api/health và cho thông báo Telegram sau mỗi lần đăng ảnh.
 */
async function checkStorageHealth() {
  const [stats, disk] = await Promise.all([getStorageStats(), getDiskSpace()]);

  let warning = null;
  if (env.uploads.warnFreePercent > 0 && disk?.freePercent !== null && disk?.freePercent !== undefined) {
    if (disk.freePercent <= env.uploads.warnFreePercent) {
      warning = {
        code: 'DISK_LOW',
        level: 'critical',
        message:
          `Điện thoại chỉ còn ${disk.freePercent}% dung lượng trống (${disk.freeMegabytes} MB). ` +
          'Hãy xoá bớt ảnh/video cũ rồi sao lưu (npm run backup).',
      };
    }
  }
  if (!warning && env.uploads.warnTotalMb > 0 && stats.megabytes >= env.uploads.warnTotalMb) {
    warning = {
      code: 'UPLOADS_LARGE',
      level: 'warning',
      message:
        `Thư mục uploads đã chiếm ${stats.megabytes} MB (ngưỡng ${env.uploads.warnTotalMb} MB). ` +
        'Cân nhắc chạy: npm run backup rồi dọn bớt tệp cũ.',
    };
  }

  return { ...stats, disk, warning };
}

/**
 * Nhắc quản trị viên qua Telegram khi dung lượng tới ngưỡng.
 * Có chống spam: tối đa một lần mỗi 6 giờ cho mỗi mã cảnh báo (giữ trong RAM —
 * khởi động lại máy chủ thì nhắc lại một lần, không đáng lo).
 */
const warnedAt = new Map();
const WARN_COOLDOWN_MS = 6 * 60 * 60 * 1000;

async function maybeWarnStorage({ force = false } = {}) {
  const health = await checkStorageHealth();
  if (!health.warning) return { warning: null, notified: false };

  const last = warnedAt.get(health.warning.code) || 0;
  if (!force && Date.now() - last < WARN_COOLDOWN_MS) {
    return { warning: health.warning, notified: false };
  }

  try {
    // Nạp muộn để tránh vòng phụ thuộc (telegram.service dùng storage để gửi ảnh).
    const telegram = require('./telegram.service');
    const sent = await telegram.notifyAdmin(
      `💾 <b>Cảnh báo dung lượng</b>\n${health.warning.message}\n\n` +
        `Tệp: ${health.files} · Video: ${health.videos} · Tổng: ${health.megabytes} MB`
    );
    // Telegram đang tắt/hỏng → KHÔNG đánh dấu "đã nhắc", để lần đăng sau thử lại.
    if (!sent) return { warning: health.warning, notified: false };

    warnedAt.set(health.warning.code, Date.now());
    logger.warn(`Cảnh báo dung lượng (${health.warning.code}): ${health.warning.message}`);
    return { warning: health.warning, notified: true };
  } catch (error) {
    logger.warn(`Không gửi được cảnh báo dung lượng: ${error.message}`);
    return { warning: health.warning, notified: false };
  }
}

module.exports = {
  resolveStoredFile,
  deleteStoredFile,
  getStorageStats,
  getDiskSpace,
  checkStorageHealth,
  maybeWarnStorage,
  ensureUploadFolders,
};
