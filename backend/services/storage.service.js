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
  for (const folder of ['posts', 'avatars']) {
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
  for (const folder of ['posts', 'avatars']) {
    await fs.mkdir(path.join(UPLOAD_ROOT, folder), { recursive: true });
  }
  logger.info(
    `Uploads directory ready: ${UPLOAD_ROOT} — ` +
      `ảnh ≤ ${env.uploads.maxSizeMb} MB · video ≤ ${env.uploads.maxVideoSizeMb} MB/` +
      `${env.uploads.maxVideoDurationSeconds}s · nhạc ≤ ${env.uploads.maxAudioSizeMb} MB`
  );
}

module.exports = { resolveStoredFile, deleteStoredFile, getStorageStats, ensureUploadFolders };
