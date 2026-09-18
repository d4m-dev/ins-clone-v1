'use strict';

/**
 * services/realtime.service.js
 * ---------------------------------------------------------------------------
 * Kênh đẩy sự kiện THỜI GIAN THỰC cho tính năng chat.
 *
 * Chọn SSE (Server-Sent Events) thay vì Socket.IO, vì:
 *   1. Termux/Android + Cloudflare Tunnel: SSE chỉ là HTTP thường → không cần
 *      mở thêm cổng, không cần thư viện nặng, tunnel đã cấu hình là chạy được.
 *   2. Tự động nối lại: trình duyệt có sẵn cơ chế `retry` của EventSource.
 *   3. Một chiều (server → client) là đủ: mọi thao tác gửi tin đi bằng POST.
 *
 * Giao thức: mỗi kết nối nhận các sự kiện
 *    event: ready        { userId }               – vừa kết nối xong
 *    event: message      { message, conversation } – tin mới (ở mọi hội thoại của bạn)
 *    event: read         { conversationId, readerId, readAt }
 *    event: conversation { conversation }          – có hội thoại mới / đổi trạng thái
 *    event: typing       { conversationId, userId, typing }
 *    : ping                                        – heartbeat giữ kết nối
 *
 * Không có trạng thái nào được lưu ở đây; mất kết nối chỉ là mở lại là xong.
 * ---------------------------------------------------------------------------
 */

const { env } = require('../config/env');
const logger = require('../utils/logger');

/** userId (chuỗi) → Set<{ res, userId }> — một người có thể mở nhiều tab/thiết bị. */
const clients = new Map();

function register(userId, res, extra = {}) {
  const key = String(userId);
  const entry = { res, userId: Number(userId), connectedAt: Date.now(), ...extra };
  if (!clients.has(key)) clients.set(key, new Set());
  clients.get(key).add(entry);
  return entry;
}

function unregister(entry) {
  const key = String(entry.userId);
  const set = clients.get(key);
  if (!set) return;
  set.delete(entry);
  if (!set.size) clients.delete(key);
}

/** Ghi một sự kiện SSE đúng chuẩn (event + id + data JSON). */
function write(entry, event, payload, id) {
  try {
    if (id !== undefined) entry.res.write(`id: ${id}\n`);
    entry.res.write(`event: ${event}\n`);
    entry.res.write(`data: ${JSON.stringify(payload)}\n\n`);
    return true;
  } catch (error) {
    logger.warn(`SSE write failed for user ${entry.userId}: ${error.message}`);
    unregister(entry);
    return false;
  }
}

/** Gửi tới MỌI thiết bị của một người dùng. Trả về số kết nối đã nhận. */
function emitToUser(userId, event, payload, id) {
  const set = clients.get(String(userId));
  if (!set || !set.size) return 0;
  let sent = 0;
  for (const entry of [...set]) if (write(entry, event, payload, id)) sent += 1;
  return sent;
}

/** Gửi tới nhiều người cùng lúc (bỏ qua id trùng). */
function emitToUsers(userIds, event, payload, id) {
  const unique = [...new Set(userIds.filter(Boolean).map(Number))];
  return unique.reduce((total, id) => total + emitToUser(id, event, payload, id), 0);
}

/** Số người đang mở kết nối — dùng cho /api/health và gỡ lỗi. */
function stats() {
  let connections = 0;
  for (const set of clients.values()) connections += set.size;
  return { users: clients.size, connections };
}

/**
 * Bắt tay một kết nối SSE trên `res`.
 * Trả về hàm `close()` để dọn dẹp (gọi trong sự kiện 'close' của Express).
 */
function openStream(res, userId) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Tắt đệm của proxy (nginx/Cloudflare) để tin nhắn tới ngay lập tức.
    'X-Accel-Buffering': 'no',
  });
  // Gợi ý EventSource thử lại sau 3 giây nếu đứt kết nối.
  res.write('retry: 3000\n\n');

  const entry = register(userId, res);
  write(entry, 'ready', { userId: Number(userId), at: new Date().toISOString() });

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      close();
    }
  }, env.chat.sseHeartbeatMs);
  if (heartbeat.unref) heartbeat.unref();

  function close() {
    clearInterval(heartbeat);
    unregister(entry);
    try {
      res.end();
    } catch {
      /* kết nối đã đóng phía client — không sao */
    }
  }

  return { entry, close };
}

module.exports = { openStream, emitToUser, emitToUsers, stats, __clients: clients };
