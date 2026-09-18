'use strict';

/**
 * controllers/chat.controller.js
 * ---------------------------------------------------------------------------
 * Điểm cuối HTTP cho chat 1-1 (kiểu Instagram Direct):
 *
 *   GET    /api/chat/conversations            hộp thư (?box=inbox|requests)
 *   POST   /api/chat/conversations            mở hội thoại với một người
 *   GET    /api/chat/conversations/:id        chi tiết hội thoại (deep link)
 *   DELETE /api/chat/conversations/:id        xoá khỏi hộp thư (chỉ ẩn phía mình)
 *   GET    /api/chat/conversations/:id/messages        tin nhắn (phân trang ngược)
 *   POST   /api/chat/conversations/:id/messages        gửi tin (chữ/ảnh/bài viết)
 *   POST   /api/chat/conversations/:id/read            đánh dấu đã đọc
 *   POST   /api/chat/conversations/:id/accept          đồng ý tin nhắn chờ
 *   POST   /api/chat/conversations/:id/decline         từ chối tin nhắn chờ
 *   POST   /api/chat/messages                       gửi nhanh theo toUserId
 *   DELETE /api/chat/messages/:id                   thu hồi tin nhắn của mình
 *   GET    /api/chat/summary                        số tin chưa đọc (badge)
 *   GET    /api/chat/people                         tìm người để nhắn tin
 *   GET    /api/chat/stream                         kênh thời gian thực (SSE)
 *
 * Quy ước chung của dự án: mọi phản hồi là { success: true, data: {...} }.
 * ---------------------------------------------------------------------------
 */

const chat = require('../services/chat.service');
const realtime = require('../services/realtime.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { resolveLocale } = require('../utils/locale');

/* ------------------------------ hộp thư ---------------------------------- */

/** GET /api/chat/conversations?box=inbox|requests&limit=50 */
const listConversations = asyncHandler(async (req, res) => {
  const box = req.query.box === 'requests' ? 'requests' : 'inbox';
  const conversations = await chat.listConversations(req.user.id, {
    box,
    limit: Number(req.query.limit) || 50,
  });
  const summary = await chat.unreadSummary(req.user.id);
  res.json({ success: true, data: { conversations, box, summary } });
});

/** POST /api/chat/conversations { userId } — mở (hoặc tạo) hội thoại với một người. */
const openConversation = asyncHandler(async (req, res) => {
  const peerId = Number(req.body.userId);
  if (!peerId) throw ApiError.badRequest('Thiếu userId của người cần trò chuyện.');
  const locale = resolveLocale(req);
  const { conversation, created } = await chat.findOrCreateConversation(req.user.id, peerId, { locale });
  const detail = await chat.getConversation(req.user.id, conversation.id, { locale });

  // Người nhận biết ngay là có người vừa mở hội thoại với mình.
  realtime.emitToUser(conversation.peerIdOf(req.user.id), 'conversation', {
    conversation: {
      id: Number(conversation.id),
      status: conversation.status,
      peerId: Number(req.user.id),
    },
  });

  res.status(created ? 201 : 200).json({ success: true, data: { conversation: detail, created } });
});

/** GET /api/chat/conversations/:id */
const getConversation = asyncHandler(async (req, res) => {
  const conversation = await chat.getConversation(req.user.id, req.params.id, { locale: resolveLocale(req) });
  res.json({ success: true, data: { conversation } });
});

/** DELETE /api/chat/conversations/:id — chỉ ẩn khỏi hộp thư của mình. */
const hideConversation = asyncHandler(async (req, res) => {
  await chat.hideConversation(req.user.id, req.params.id, { locale: resolveLocale(req) });
  res.json({ success: true, data: { hidden: true } });
});

/* ------------------------------ tin nhắn --------------------------------- */

/** GET /api/chat/conversations/:id/messages?before=<id>&limit=<n> */
const listMessages = asyncHandler(async (req, res) => {
  const page = await chat.listMessages(req.params.id, req.user.id, {
    before: req.query.before,
    limit: req.query.limit,
    locale: resolveLocale(req),
  });
  res.json({ success: true, data: page });
});

/** POST /api/chat/conversations/:id/messages — gửi tin (multipart hoặc JSON). */
const sendToConversation = asyncHandler(async (req, res) => {
  const { message, conversation } = await chat.sendMessage(req.user.id, {
    conversationId: req.params.id,
    body: req.body.body,
    file: req.file || null,
    sharedPostId: req.body.sharedPostId ? Number(req.body.sharedPostId) : null,
    locale: resolveLocale(req),
  });
  res.status(201).json({
    success: true,
    data: {
      message,
      conversationId: Number(conversation.id),
      /** 'requested' = tin đang nằm trong mục "Tin nhắn chờ" của người nhận. */
      conversationStatus: conversation.status,
    },
  });
});

/** POST /api/chat/messages { toUserId | conversationId, body?, sharedPostId? } */
const sendMessage = asyncHandler(async (req, res) => {
  const { message, conversation } = await chat.sendMessage(req.user.id, {
    toUserId: req.body.toUserId ? Number(req.body.toUserId) : null,
    conversationId: req.body.conversationId ? Number(req.body.conversationId) : null,
    body: req.body.body,
    file: req.file || null,
    sharedPostId: req.body.sharedPostId ? Number(req.body.sharedPostId) : null,
    locale: resolveLocale(req),
  });
  res.status(201).json({
    success: true,
    data: {
      message,
      conversationId: Number(conversation.id),
      /** 'requested' = tin đang nằm trong mục "Tin nhắn chờ" của người nhận. */
      conversationStatus: conversation.status,
    },
  });
});

/** DELETE /api/chat/messages/:id — thu hồi tin nhắn của chính mình. */
const deleteMessage = asyncHandler(async (req, res) => {
  await chat.deleteMessage(req.user.id, req.params.id, { locale: resolveLocale(req) });
  res.json({ success: true, data: { deleted: true, id: Number(req.params.id) } });
});

/** POST /api/chat/conversations/:id/read */
const markRead = asyncHandler(async (req, res) => {
  const result = await chat.markRead(req.user.id, req.params.id, { locale: resolveLocale(req) });
  res.json({ success: true, data: { unread: result.unread, conversationId: Number(req.params.id) } });
});

/* --------------------------- tin nhắn chờ -------------------------------- */

const acceptRequest = asyncHandler(async (req, res) => {
  const { conversation } = await chat.acceptRequest(req.user.id, req.params.id, { locale: resolveLocale(req) });
  res.json({ success: true, data: { conversationId: Number(conversation.id), status: 'accepted' } });
});

const declineRequest = asyncHandler(async (req, res) => {
  const { conversation } = await chat.declineRequest(req.user.id, req.params.id, { locale: resolveLocale(req) });
  res.json({ success: true, data: { conversationId: Number(conversation.id), status: 'declined' } });
});

/** POST /api/chat/conversations/:id/typing — tín hiệu "đang nhập…" (không lưu DB). */
const typing = asyncHandler(async (req, res) => {
  await chat.emitTyping(req.user.id, req.params.id, req.body?.typing !== false, {
    locale: resolveLocale(req),
  });
  res.json({ success: true, data: { ok: true } });
});

/* ------------------------- badge / người dùng ---------------------------- */

/** GET /api/chat/summary — dùng cho badge trên thanh điều hướng. */
const summary = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await chat.unreadSummary(req.user.id) });
});

/** GET /api/chat/people?q=... — tìm người để bắt đầu trò chuyện. */
const searchPeople = asyncHandler(async (req, res) => {
  const people = await chat.searchPeople(req.user.id, req.query.q, { limit: req.query.limit });
  res.json({ success: true, data: { people } });
});

/* --------------------------- realtime (SSE) ------------------------------ */

/**
 * GET /api/chat/stream — kênh đẩy sự kiện về trình duyệt.
 *
 * Lưu ý khi triển khai sau Cloudflare Tunnel: phải TẮT đệm (đã set header
 * X-Accel-Buffering: no) và gửi heartbeat đều đặn, nếu không proxy sẽ cắt
 * kết nối "im lặng". Nếu vẫn bị chặn, giao diện tự chuyển sang hỏi định kỳ
 * (env.chat.pollIntervalMs) — xem frontend/src/hooks/useChatStream.js.
 */
const stream = asyncHandler(async (req, res) => {
  // Không để Express/middleware nén hay đệm luồng này.
  res.set('Content-Encoding', 'identity');
  const { close } = realtime.openStream(res, req.user.id);

  const cleanup = () => close();
  req.on('close', cleanup);
  req.on('aborted', cleanup);
  // Giữ kết nối mở: không gọi res.end() ở đây.
  res.flushHeaders?.();
});

module.exports = {
  listConversations,
  openConversation,
  getConversation,
  hideConversation,
  listMessages,
  sendToConversation,
  sendMessage,
  deleteMessage,
  markRead,
  acceptRequest,
  declineRequest,
  typing,
  summary,
  searchPeople,
  stream,
};
