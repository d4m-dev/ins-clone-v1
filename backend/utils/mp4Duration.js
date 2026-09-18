'use strict';

/**
 * utils/mp4Duration.js
 * ---------------------------------------------------------------------------
 * Đọc thời lượng video MP4/MOV **không cần ffmpeg/ffprobe** — quan trọng vì
 * Termux trên điện thoại không cài sẵn ffmpeg và muxing video rất tốn CPU.
 *
 * Cách làm: quét atom `mvhd` (movie header) trong container ISO-BMFF và đọc
 * cặp (timescale, duration). Cấu trúc:
 *
 *   'mvhd' | version(1) | flags(3) |
 *     v0: creation(4) modification(4) timescale(4) duration(4)
 *     v1: creation(8) modification(8) timescale(4) duration(8)
 *
 * Trả về null khi không phải MP4 (ví dụ WebM) — khi đó controller dùng thời
 * lượng do client khai báo và vẫn áp trần MAX_VIDEO_DURATION_SECONDS.
 * ---------------------------------------------------------------------------
 */

const fs = require('fs/promises');

const CONTAINER_HEADER_SCAN_LIMIT = 2 * 1024 * 1024; // 2 MB đầu là đủ cho hầu hết file

/** Tìm và giải mã atom mvhd trong Buffer. */
function parseMvhd(buffer) {
  const marker = buffer.indexOf('mvhd');
  if (marker === -1) return null;
  // 4 byte 'mvhd' + 1 byte version + 3 byte flags
  const version = buffer.readUInt8(marker + 4);
  if (version === 0) {
    // bỏ qua creation(4) + modification(4)
    const timescale = buffer.readUInt32BE(marker + 4 + 4 + 4 + 4);
    const duration = buffer.readUInt32BE(marker + 4 + 4 + 4 + 4 + 4);
    if (!timescale) return null;
    return duration / timescale;
  }
  if (version === 1) {
    const timescale = buffer.readUInt32BE(marker + 4 + 4 + 8 + 8);
    const duration = Number(buffer.readBigUInt64BE(marker + 4 + 4 + 8 + 8 + 4));
    if (!timescale) return null;
    return duration / timescale;
  }
  return null;
}

/**
 * @param {string} absolutePath đường dẫn file video
 * @returns {Promise<number|null>} thời lượng tính bằng giây, hoặc null
 */
async function readMp4DurationSeconds(absolutePath) {
  try {
    const handle = await fs.open(absolutePath, 'r');
    try {
      const stats = await handle.stat();
      const length = Math.min(stats.size, CONTAINER_HEADER_SCAN_LIMIT);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, 0);

      const seconds = parseMvhd(buffer);
      // Một số file đặt moov ở cuối (faststart chưa chạy) → đọc 2 MB cuối.
      if (seconds === null && stats.size > length) {
        const tailLength = Math.min(stats.size, CONTAINER_HEADER_SCAN_LIMIT);
        const tail = Buffer.alloc(tailLength);
        await handle.read(tail, 0, tailLength, stats.size - tailLength);
        return parseMvhd(tail);
      }
      return seconds;
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

/** Làm tròn thời lượng để gửi lên client (giữ 2 chữ số thập phân). */
const roundSeconds = (value) => (value == null ? null : Math.round(Number(value) * 100) / 100);

/** Định dạng mm:ss để hiển thị. */
function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return null;
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

module.exports = { readMp4DurationSeconds, roundSeconds, formatDuration, parseMvhd };
