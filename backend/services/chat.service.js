'use strict';

/**
 * services/chat.service.js
 * ---------------------------------------------------------------------------
 * Toàn bộ nghiệp vụ nhắn tin 1-1 (kiểu Instagram Direct). Controller chỉ lo
 * đọc/ghi HTTP; luật chơi nằm hết ở đây để test được mà không cần server.
 *
 * Bốn luật đáng nhớ:
 *   1. MỘT cặp người dùng = MỘT hội thoại (`pairKey`) — không bao giờ nhân bản.
 *   2. Người lạ nhắn trước → tin nằm ở "Tin nhắn chờ" (status = 'requested').
 *      Người NHẬN bấm Đồng ý thì mới thành hội thoại bình thường.
 *   3. Số tin chưa đọc tính từ mốc `readAt` của từng người, KHÔNG đếm cột riêng
 *      (không dùng chung refreshCounters của likes/comments).
 *   4. Thu hồi tin nhắn = xoá mềm + xoá nội dung trong cùng một câu UPDATE.
 * ---------------------------------------------------------------------------
 */

const { Op } = require('sequelize');
const urls = require('../config/urls');
const { env } = require('../config/env');
const { User, Post, Conversation, Message } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const realtime = require('./realtime.service');
const { deleteStoredFile } = require('./storage.service');
const { t } = require('../i18n');

/** Lấy thông điệp theo ngôn ngữ người dùng (mặc định 'vi'). */
const msg = (locale, key, vars) => t(locale || 'vi', `chat.${key}`, vars);

/** Ảnh/nhãn xem trước khi tin chỉ có tệp. */
const PREVIEW = { image: '📷 Ảnh', video: '🎥 Video', post: '📎 Bài viết' };

/* -------------------------------------------------------------------------- */
/*                                 tiện ích                                   */
/* -------------------------------------------------------------------------- */

/**
 * Hồ sơ công khai của một người dùng (đủ để vẽ avatar + tên trong khung chat).
 * Dùng lại `toPublicJSON()` của User để tên trường LUÔN khớp phần còn lại của
 * ứng dụng (fullName / avatarUrl) — tránh lệch kiểu dữ liệu ở giao diện.
 */
function publicUser(user) {
  if (!user) return null;
  const base = typeof user.toPublicJSON === 'function' ? user.toPublicJSON() : {};
  return {
    id: Number(user.id),
    username: user.username,
    fullName: user.fullName || user.username,
    avatarUrl: base.avatarUrl ?? null,
  };
}

function messagePreview(message) {
  if (!message) return null;
  if (message.deletedAt) return t('vi', 'chat.recalled');
  if (message.sharedPostId) return PREVIEW.post;
  if (message.body && message.attachmentFilename) return `${PREVIEW[message.attachmentType] ?? '📷 Ảnh'} ${message.body}`;
  if (message.attachmentFilename) return PREVIEW[message.attachmentType] ?? PREVIEW.image;
  return message.body;
}

/** Chuỗi xem trước gọn lại cho hợp một dòng hộp thư. */
function tidyPreview(text, max = 120) {
  if (!text) return null;
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/* -------------------------------------------------------------------------- */
/*                              hội thoại                                     */
/* -------------------------------------------------------------------------- */

/** Tìm hội thoại giữa hai người (không tạo mới). */
async function findConversation(userId, peerId) {
  return Conversation.findOne({ where: { pairKey: Conversation.pairKeyFor(userId, peerId) } });
}

/**
 * Lấy hội thoại, tạo mới nếu chưa có.
 * Trả về `{ conversation, created }`.
 */
async function findOrCreateConversation(userId, peerId, { transaction, locale = 'vi' } = {}) {
  if (Number(userId) === Number(peerId)) {
    throw ApiError.badRequest(msg(locale, 'self'));
  }
  const peer = await User.findByPk(peerId);
  if (!peer) throw ApiError.notFound(msg(locale, 'peerNotFound'));

  const pairKey = Conversation.pairKeyFor(userId, peerId);
  const existing = await Conversation.findOne({ where: { pairKey }, transaction });
  if (existing) return { conversation: existing, created: false, peer };

  // Người lạ nhắn lần đầu → "Tin nhắn chờ" để chống spam (giống Instagram).
  const needsRequest = env.chat.messageRequests;
  const [one, two] = Number(userId) <= Number(peerId) ? [userId, peerId] : [peerId, userId];

  const conversation = await Conversation.create(
    {
      pairKey,
      userOneId: one,
      userTwoId: two,
      status: needsRequest ? 'requested' : 'accepted',
      requestedById: needsRequest ? userId : null,
    },
    { transaction }
  );
  logger.info(`Chat: hội thoại #${conversation.id} (${pairKey}) — ${needsRequest ? 'tin nhắn chờ' : 'mở'}`);
  return { conversation, created: true, peer };
}

/** Kiểm tra quyền truy cập hội thoại, ném 403/404 nếu sai. */
async function requireParticipant(conversationId, userId, { transaction, locale = 'vi' } = {}) {
  const conversation = await Conversation.findByPk(conversationId, { transaction });
  if (!conversation) throw ApiError.notFound(msg(locale, 'conversationNotFound'));
  if (!conversation.isMember(userId)) {
    throw ApiError.forbidden(msg(locale, 'notMember'));
  }
  return conversation;
}

/**
 * Danh sách hội thoại cho hộp thư.
 * @param {'inbox'|'requests'} box  hộp thư chính hay mục tin nhắn chờ
 */
async function listConversations(userId, { box = 'inbox', limit = 50 } = {}) {
  const me = Number(userId);
  const where = {
    [Op.or]: [{ userOneId: me }, { userTwoId: me }],
    ...(box === 'requests'
      ? { status: 'requested', requestedById: { [Op.ne]: me } }
      : { status: 'accepted' }),
  };

  const rows = await Conversation.findAll({
    where,
    order: [['lastMessageAt', 'DESC']],
    limit,
  });

  // Ẩn khỏi hộp thư: bỏ qua những hội thoại đã "xoá" mà chưa có tin mới hơn.
  const visible = rows.filter((row) => !row.isHiddenFor(me));
  if (!visible.length) return [];

  const peerIds = [...new Set(visible.map((row) => row.peerIdOf(me)))];
  const peerUsers = await User.findAll({ where: { id: { [Op.in]: peerIds } } });
  const peerById = new Map(peerUsers.map((user) => [Number(user.id), user]));

  // Một truy vấn duy nhất đếm tin chưa đọc cho mọi hội thoại.
  const unreadByConversation = await countUnreadPerConversation(
    visible.map((row) => ({ id: Number(row.id), peerId: row.peerIdOf(me), readAt: row.readAtFor(me) })),
    me
  );

  return visible.map((row) => {
    const peer = peerById.get(row.peerIdOf(me));
    const peerReadAt = row.readAtFor(row.peerIdOf(me));
    return {
      id: Number(row.id),
      status: row.status,
      isRequest: row.status === 'requested' && Number(row.requestedById) !== me,
      canRespond: row.canRespondToRequest(me),
      peer: publicUser(peer),
      lastMessage: {
        id: row.lastMessageId ? Number(row.lastMessageId) : null,
        preview: row.lastMessagePreview,
        mine: row.lastMessageSenderId ? Number(row.lastMessageSenderId) === me : false,
        /** Tin cuối là của mình và người kia đã xem → "Đã xem". */
        seen:
          row.lastMessageSenderId && Number(row.lastMessageSenderId) === me
            ? Boolean(peerReadAt && row.lastMessageAt && new Date(peerReadAt) >= new Date(row.lastMessageAt))
            : true,
        at: row.lastMessageAt,
      },
      unreadCount: unreadByConversation.get(Number(row.id)) ?? 0,
      updatedAt: row.lastMessageAt || row.updatedAt,
    };
  });
}

/**
 * Đếm tin chưa đọc của nhiều hội thoại trong MỘT câu SQL.
 * Điều kiện: tin do người kia gửi, chưa thu hồi, tạo SAU mốc đã đọc của mình.
 */
async function countUnreadPerConversation(items, viewerId) {
  const result = new Map();
  if (!items.length) return result;

  const conditions = items.map((item) =>
    item.readAt
      ? {
          [Op.and]: [
            { conversationId: item.id },
            { senderId: item.peerId },
            { createdAt: { [Op.gt]: item.readAt } },
          ],
        }
      : { conversationId: item.id, senderId: item.peerId }
  );

  const rows = await Message.findAll({
    attributes: ['conversationId', [Message.sequelize.fn('COUNT', Message.sequelize.col('id')), 'unread']],
    where: { deletedAt: null, [Op.or]: conditions },
    group: ['conversationId'],
    raw: true,
  });

  items.forEach((item) => result.set(item.id, 0));
  rows.forEach((row) => result.set(Number(row.conversationId), Number(row.unread)));
  // Người nhận chưa từng đọc gì (`readAt` null) đã được tính ở nhánh else.
  void viewerId;
  return result;
}

/** Tổng số tin chưa đọc + số tin nhắn chờ — hiển thị trên badge điều hướng. */
async function unreadSummary(userId) {
  const me = Number(userId);
  const rows = await Conversation.findAll({
    where: { [Op.or]: [{ userOneId: me }, { userTwoId: me }] },
    limit: 500,
  });

  const visible = rows.filter((row) => !row.isHiddenFor(me));
  const inbox = visible.filter((row) => row.status === 'accepted');
  const requests = visible.filter((row) => row.status === 'requested' && Number(row.requestedById) !== me);

  const inboxUnread = await countUnreadPerConversation(
    inbox.map((row) => ({ id: Number(row.id), peerId: row.peerIdOf(me), readAt: row.readAtFor(me) })),
    me
  );

  const totalUnread = [...inboxUnread.values()].reduce((sum, value) => sum + value, 0);
  const pendingRequests = requests.filter((row) => {
    const readAt = row.readAtFor(me);
    return !readAt || !row.lastMessageAt || new Date(row.lastMessageAt) > new Date(readAt);
  }).length;

  return { totalUnread, pendingRequests };
}

/* -------------------------------------------------------------------------- */
/*                                tin nhắn                                    */
/* -------------------------------------------------------------------------- */

/** Danh sách tin nhắn, mới nhất trước; dùng `before` để tải thêm tin cũ hơn. */
async function listMessages(conversationId, userId, { before = null, limit = env.chat.pageSize, locale = 'vi' } = {}) {
  await requireParticipant(conversationId, userId, { locale });
  const size = Math.min(Math.max(Number(limit) || env.chat.pageSize, 1), 100);

  const where = { conversationId: Number(conversationId) };
  if (before && Number(before) > 0) where.id = { [Op.lt]: Number(before) };

  // Lấy dư 1 bản ghi để biết còn tin cũ hơn hay không (không cần COUNT).
  const rows = await Message.findAll({
    where,
    order: [['id', 'DESC']],
    limit: size + 1,
  });

  const hasMore = rows.length > size;
  const page = rows.slice(0, size).reverse();

  return {
    messages: page.map((message) => message.toPublicJSON({ viewerId: userId, urls })),
    hasMore,
    nextBefore: page.length ? Number(page[0].id) : null,
  };
}

/**
 * Gửi tin nhắn. `payload` nhận:
 *   conversationId | toUserId (bắt buộc một trong hai)
 *   body           chữ (có thể rỗng nếu có tệp)
 *   file            { filename, mimetype, size, width?, height? } do multer trả về
 *   sharedPostId   chia sẻ một bài đăng
 */
async function sendMessage(userId, payload = {}) {
  const { body = '', file = null, sharedPostId = null, locale = 'vi' } = payload;
  const text = String(body || '').trim();

  if (text.length > env.chat.maxMessageLength) {
    throw ApiError.badRequest(msg(locale, 'tooLong', { max: env.chat.maxMessageLength }));
  }
  if (!text && !file && !sharedPostId) {
    throw ApiError.badRequest(msg(locale, 'empty'));
  }

  let conversation;
  let peerId;
  if (payload.conversationId) {
    conversation = await requireParticipant(payload.conversationId, userId, { locale });
    peerId = conversation.peerIdOf(userId);
  } else if (payload.toUserId) {
    const found = await findOrCreateConversation(userId, payload.toUserId, { locale });
    conversation = found.conversation;
    peerId = Number(payload.toUserId);
  } else {
    throw ApiError.badRequest(msg(locale, 'empty'));
  }

  // Không thể nhắn tiếp khi đã bị TỪ CHỐI (giống Instagram: người nhận chặn luồng).
  if (conversation.status === 'declined') {
    throw ApiError.forbidden(msg(locale, 'declined'));
  }

  if (sharedPostId) {
    const post = await Post.findByPk(sharedPostId);
    if (!post) throw ApiError.notFound(msg(locale, 'postNotFound'));
  }

  const attachmentType = file ? (String(file.mimetype || '').startsWith('video/') ? 'video' : 'image') : null;

  const message = await Message.create({
    conversationId: conversation.id,
    senderId: userId,
    body: text || null,
    attachmentFilename: file ? file.filename : null,
    attachmentType,
    attachmentWidth: file?.width ?? null,
    attachmentHeight: file?.height ?? null,
    sharedPostId: sharedPostId || null,
  });

  // Cập nhật bản chụp tin cuối + tự bỏ ẩn hộp thư cho cả hai bên.
  const preview = tidyPreview(messagePreview(message));
  conversation.lastMessageId = message.id;
  conversation.lastMessageSenderId = userId;
  conversation.lastMessagePreview = preview;
  conversation.lastMessageAt = message.createdAt || new Date();
  if (conversation.isHiddenFor(userId)) conversation.userOneHiddenAt = conversation.userTwoHiddenAt = null;
  else {
    // Người gửi chắc chắn đã đọc tin của chính mình.
    conversation.markReadBy(userId, conversation.lastMessageAt);
  }
  await conversation.save();

  const outgoing = message.toPublicJSON({ viewerId: userId, urls });
  outgoing.preview = preview;

  // Đẩy realtime cho người nhận và cho các thiết bị khác của người gửi.
  const conversationPayload = serializeConversationFor(conversation, peerId);
  realtime.emitToUser(peerId, 'message', { message: { ...outgoing, mine: false }, conversation: conversationPayload });
  realtime.emitToUser(userId, 'message', { message: outgoing, conversation: serializeConversationFor(conversation, userId) });

  return { message: outgoing, conversation };
}

/** Gọn hoá hội thoại cho một người xem cụ thể (dùng trong payload realtime). */
function serializeConversationFor(conversation, viewerId) {
  return {
    id: Number(conversation.id),
    status: conversation.status,
    peerId: conversation.peerIdOf(viewerId),
    lastMessagePreview: conversation.lastMessagePreview,
    lastMessageAt: conversation.lastMessageAt,
  };
}

/** Đánh dấu đã đọc tới thời điểm hiện tại; trả về số tin vừa được đọc. */
async function markRead(userId, conversationId, { locale = 'vi' } = {}) {
  const conversation = await requireParticipant(conversationId, userId, { locale });
  const peerId = conversation.peerIdOf(userId);
  const readAt = conversation.readAtFor(userId) || new Date(0);

  const unread = await Message.count({
    where: { conversationId: conversation.id, senderId: peerId, deletedAt: null, createdAt: { [Op.gt]: readAt } },
  });

  if (unread > 0) {
    // Đánh dấu từng tin "đã xem" (cột readAt) — nguồn sự thật cho "Đã xem".
    await Message.update(
      { readAt: new Date() },
      { where: { conversationId: conversation.id, senderId: peerId, deletedAt: null, readAt: null } }
    );
  }

  conversation.markReadBy(userId, new Date());
  await conversation.save();

  // Báo cho người gửi biết tin của họ vừa được xem.
  realtime.emitToUser(peerId, 'read', {
    conversationId: Number(conversation.id),
    readerId: Number(userId),
    readAt: conversation.readAtFor(userId),
  });

  return { unread, conversation };
}

/** Thu hồi tin nhắn (chỉ người gửi, trong vòng 1 giờ — giống Instagram). */
async function deleteMessage(userId, messageId, { windowMinutes = 60, locale = 'vi' } = {}) {
  const message = await Message.findByPk(messageId);
  if (!message) throw ApiError.notFound(msg(locale, 'messageNotFound'));
  if (Number(message.senderId) !== Number(userId)) {
    throw ApiError.forbidden(msg(locale, 'recallOwnOnly'));
  }
  if (message.deletedAt) return { message };

  const ageMinutes = (Date.now() - new Date(message.createdAt).getTime()) / 60000;
  if (ageMinutes > windowMinutes) {
    throw ApiError.badRequest(msg(locale, 'recallWindow', { minutes: windowMinutes }));
  }

  // Xoá nội dung NGAY trong câu UPDATE: đọc thẳng database cũng không cứu được.
  await message.update({
    body: null,
    attachmentFilename: null,
    attachmentType: null,
    attachmentWidth: null,
    attachmentHeight: null,
    sharedPostId: null,
    deletedAt: new Date(),
  });
  if (message.attachmentFilename) {
    // Tệp đã bị xoá khỏi DB ở trên → dọn luôn tệp trên đĩa.
    await deleteStoredFile(message.getDataValue('attachmentFilename') || '', 'chat');
  }

  const conversation = await Conversation.findByPk(message.conversationId);
  if (conversation && Number(conversation.lastMessageId) === Number(message.id)) {
    conversation.lastMessagePreview = msg(locale, 'recalled');
    await conversation.save();
  }

  // Cập nhật lại tin cuối cho cả hai bên.
  if (conversation) {
    const payload = { messageId: Number(message.id), conversationId: Number(conversation.id), at: new Date() };
    realtime.emitToUser(conversation.userOneId, 'deleted', payload);
    realtime.emitToUser(conversation.userTwoId, 'deleted', payload);
  }
  return { message };
}

/* -------------------------------------------------------------------------- */
/*                        tin nhắn chờ / ẩn hội thoại                         */
/* -------------------------------------------------------------------------- */

/** Người NHẬN đồng ý → hội thoại thành bình thường. */
async function acceptRequest(userId, conversationId, { locale = 'vi' } = {}) {
  const conversation = await requireParticipant(conversationId, userId);
  if (conversation.status === 'accepted') return { conversation };
  if (!conversation.canRespondToRequest(userId)) {
    throw ApiError.forbidden(msg(locale, 'acceptOnlyRecipient'));
  }
  conversation.status = 'accepted';
  await conversation.save();

  const peerId = conversation.peerIdOf(userId);
  const payload = serializeConversationFor(conversation, peerId);
  realtime.emitToUser(peerId, 'conversation', { conversation: { ...payload, status: 'accepted' } });
  realtime.emitToUser(userId, 'conversation', { conversation: serializeConversationFor(conversation, userId) });
  return { conversation };
}

/** Người nhận TỪ CHỐI → đánh dấu declined (không xoá dữ liệu, có thể xem lại sau). */
async function declineRequest(userId, conversationId, { locale = 'vi' } = {}) {
  const conversation = await requireParticipant(conversationId, userId);
  if (!conversation.canRespondToRequest(userId)) {
    throw ApiError.forbidden(msg(locale, 'declineOnlyRecipient'));
  }
  conversation.status = 'declined';
  await conversation.save();

  const peerId = conversation.peerIdOf(userId);
  realtime.emitToUser(peerId, 'conversation', {
    conversation: { ...serializeConversationFor(conversation, peerId), status: 'declined' },
  });
  return { conversation };
}

/** "Xoá" hội thoại khỏi hộp thư của mình (chỉ ẩn phía mình). */
async function hideConversation(userId, conversationId, { locale = 'vi' } = {}) {
  const conversation = await requireParticipant(conversationId, userId, { locale });
  conversation.hideFor(userId, new Date());
  await conversation.save();
  return { conversation };
}

/**
 * Báo "đang nhập…" cho người kia. KHÔNG ghi database (chỉ là tín hiệu tạm thời):
 * máy chủ trên điện thoại không nên ghi đĩa cho mỗi lần gõ phím.
 */
async function emitTyping(userId, conversationId, typing = true, { locale = 'vi' } = {}) {
  const conversation = await requireParticipant(conversationId, userId, { locale });
  realtime.emitToUser(conversation.peerIdOf(userId), 'typing', {
    conversationId: Number(conversation.id),
    userId: Number(userId),
    typing: Boolean(typing),
  });
  return { ok: true };
}

/** Danh sách người để bắt đầu trò chuyện — tìm theo username hoặc tên hiển thị. */
async function searchPeople(userId, query, { limit = 20 } = {}) {
  const q = String(query || '').trim();
  const where = { id: { [Op.ne]: Number(userId) } };
  if (q) {
    where[Op.or] = [
      { username: { [Op.like]: `%${q}%` } },
      { fullName: { [Op.like]: `%${q}%` } },
    ];
  }

  const users = await User.findAll({
    where,
    attributes: ['id', 'username', 'fullName', 'avatarUrl'],
    order: [['username', 'ASC']],
    limit: Math.min(Number(limit) || 20, 50),
  });

  // Kèm sẵn hội thoại đã có (nếu có) để giao diện mở thẳng khung chat.
  const keys = users.map((user) => Conversation.pairKeyFor(userId, user.id));
  const existing = keys.length
    ? await Conversation.findAll({ where: { pairKey: { [Op.in]: keys } } })
    : [];
  const byPairKey = new Map(existing.map((row) => [row.pairKey, row]));

  return users.map((user) => {
    const conversation = byPairKey.get(Conversation.pairKeyFor(userId, user.id));
    return {
      ...publicUser(user),
      conversationId: conversation ? Number(conversation.id) : null,
    };
  });
}

/** Chi tiết một hội thoại (kèm hồ sơ người kia) — dùng khi mở deep link /messages/:id. */
async function getConversation(userId, conversationId, { locale = 'vi' } = {}) {
  const conversation = await requireParticipant(conversationId, userId, { locale });
  const peer = await User.findByPk(conversation.peerIdOf(userId));
  return {
    id: Number(conversation.id),
    status: conversation.status,
    isRequest: conversation.status === 'requested' && Number(conversation.requestedById) !== Number(userId),
    canRespond: conversation.canRespondToRequest(userId),
    createdAt: conversation.createdAt,
    lastMessageAt: conversation.lastMessageAt,
    peer: publicUser(peer),
  };
}

module.exports = {
  publicUser,
  messagePreview,
  findConversation,
  findOrCreateConversation,
  requireParticipant,
  listConversations,
  unreadSummary,
  listMessages,
  sendMessage,
  markRead,
  deleteMessage,
  acceptRequest,
  declineRequest,
  hideConversation,
  emitTyping,
  searchPeople,
  getConversation,
  serializeConversationFor,
};
