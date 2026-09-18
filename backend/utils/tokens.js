/**
 * utils/tokens.js
 * ---------------------------------------------------------------------------
 * Token dùng một lần cho lời mời và đặt lại mật khẩu.
 *
 * Quy tắc: **chỉ lưu SHA-256 của token** trong database. Token gốc chỉ xuất hiện
 * trong email gửi cho người dùng. Kẻ tấn công đọc được bảng `invites` hay `users`
 * cũng không thể tạo liên kết hợp lệ.
 * ---------------------------------------------------------------------------
 */

'use strict';

const crypto = require('crypto');

/** Token 32 byte ngẫu nhiên, dạng base64url (an toàn trong URL). */
function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Băm để lưu/đối chiếu — không cần salt vì token đã đủ entropy. */
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** So sánh hai hash trong thời gian hằng định (chống timing attack). */
function safeEqual(a, b) {
  const bufferA = Buffer.from(String(a || ''), 'utf8');
  const bufferB = Buffer.from(String(b || ''), 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

/** Cộng thêm phút/ngày vào thời điểm hiện tại. */
const inMinutes = (minutes) => new Date(Date.now() + minutes * 60 * 1000);
const inDays = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

module.exports = { generateToken, hashToken, safeEqual, inMinutes, inDays };
