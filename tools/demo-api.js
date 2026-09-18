#!/usr/bin/env node
'use strict';

/**
 * tools/demo-api.js  —  DEV-ONLY preview harness (NOT part of production)
 * ===========================================================================
 * A dependency-free mock of the PixGram REST API so the React UI can be
 * previewed on a laptop/desktop *without* Termux, MariaDB or the tunnel.
 * It implements the exact same response contract as the real backend
 * (`{ success, data: { … } }`) and serves the demo photos/video from ./demo-images.
 * Hỗ trợ đầy đủ Reels (video dọc), Stories 24h, lượt xem và tải tệp về.
 *
 *   node tools/demo-api.js            # listens on :4000
 *   PORT=5000 node tools/demo-api.js
 *
 * Login with any password. Accounts:
 *   minh.nguyen (admin) · linh.tran · bao.long · su.ha
 * ===========================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 4000);
const DEMO_IMAGES = path.join(__dirname, 'demo-images');
const UPLOAD_DIR = path.join(__dirname, '.demo-uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || ''; // empty → relative /uploads URLs

/* ------------------------------- seed data -------------------------------- */
const users = [
  { id: 1, username: 'minh.nguyen', fullName: 'Minh Nguyễn', role: 'admin', locale: 'vi', avatarUrl: null, bio: 'Chụp ảnh đường phố 📷', createdAt: daysAgo(420) },
  { id: 2, username: 'linh.tran', fullName: 'Linh Trần', role: 'member', locale: 'vi', avatarUrl: null, bio: 'Yêu biển và cà phê sáng', createdAt: daysAgo(410) },
  { id: 3, username: 'bao.long', fullName: 'Bảo Long', role: 'member', locale: 'vi', avatarUrl: null, bio: 'Nhiếp ảnh phong cảnh', createdAt: daysAgo(400) },
  { id: 4, username: 'su.ha', fullName: 'Su Hà', role: 'member', locale: 'en', avatarUrl: null, bio: 'Sunrise person 🌅', createdAt: daysAgo(300) },
];

let nextPostId = 7;
const posts = [
  { id: 1, userId: 1, imageFilename: 'demo-1.jpg', caption: 'Bữa tối trên sân thượng — canh chua tự nấu 🍲', location: 'Chư Ty, Gia Lai', likeCount: 12, commentCount: 3, createdAt: hoursAgo(5) },
  { id: 2, userId: 2, imageFilename: 'demo-2.jpg', caption: 'Mưa đầu mùa trên phố 🤍', location: 'Gia Lai', likeCount: 8, commentCount: 2, createdAt: hoursAgo(26) },
  { id: 3, userId: 3, imageFilename: 'demo-3.jpg', caption: 'Bánh chưng ngày Tết, năm nào cũng gói.', location: null, likeCount: 21, commentCount: 4, createdAt: hoursAgo(50) },
  { id: 4, userId: 4, imageFilename: 'demo-4.jpg', caption: 'Sunrise walk before the boat left 🌅', location: 'Quy Nhơn', likeCount: 15, commentCount: 1, createdAt: hoursAgo(72) },
  { id: 5, userId: 4, imageFilename: 'demo-1.jpg', caption: 'Rooftop again — this time with a birthday cake 🎂', location: 'Chư Ty', likeCount: 9, commentCount: 1, createdAt: hoursAgo(96) },
  { id: 6, userId: 2, imageFilename: 'demo-4.jpg', caption: 'Same beach, one year later 🌊', location: 'Quy Nhơn', likeCount: 17, commentCount: 2, createdAt: hoursAgo(140) },

  // ---- Video cho Reels (mediaType: 'video') ----
  {
    id: 7, userId: 1, mediaType: 'video',
    imageFilename: 'demo-2.jpg', videoFilename: 'demo-clip.mp4',
    durationSeconds: 5.76, viewCount: 34,
    caption: 'Mưa Sài Gòn — quay bằng điện thoại 🎬', location: 'Chư Ty, Gia Lai',
    likeCount: 14, commentCount: 2, createdAt: hoursAgo(3),
  },
  {
    id: 8, userId: 2, mediaType: 'video',
    imageFilename: 'demo-4.jpg', videoFilename: 'demo-clip.mp4',
    durationSeconds: 5.76, viewCount: 12,
    caption: 'Sóng biển Quy Nhơn, 6 giờ sáng 🌊', location: 'Quy Nhơn',
    likeCount: 6, commentCount: 1, createdAt: hoursAgo(20),
  },
];

/** Lượt xem (bài ảnh thường vẫn có) — bài nào không khai báo thì mặc định 0. */
const viewCounts = new Map([[1, 61], [2, 18], [3, 44], [4, 27], [5, 9], [6, 13], [7, 34], [8, 12]]);

let nextCommentId = 8;
const comments = [
  { id: 1, postId: 1, userId: 2, body: 'Ngon quá! Lần sau cho mình xin một suất 😋', createdAt: hoursAgo(4) },
  { id: 2, postId: 1, userId: 3, body: 'Nhìn hấp dẫn quá, hôm nào qua ăn với nhé!', createdAt: hoursAgo(3) },
  { id: 3, postId: 1, userId: 4, body: 'View đẹp thật 🌇', createdAt: hoursAgo(2) },
  { id: 4, postId: 2, userId: 1, body: 'Mưa kiểu này ngồi quán cà phê thì hết ý.', createdAt: hoursAgo(25) },
  { id: 5, postId: 2, userId: 4, body: 'Khung ảnh đẹp quá 🥰', createdAt: hoursAgo(24) },
  { id: 6, postId: 3, userId: 1, body: 'Mùi Tết luôn 🎋', createdAt: hoursAgo(49) },
  { id: 7, postId: 4, userId: 2, body: 'Bình minh đẹp mê.', createdAt: hoursAgo(70) },
];

const likes = new Set(['1:2', '1:3', '1:4', '2:1', '3:1', '3:4', '4:1', '6:1']);
const tokens = new Map(); // token -> userId
const uploads = new Map(); // filename -> Buffer
const invites = [
  // Hai lời mời mẫu để trang "Mời thành viên" không trống khi xem trước.
  {
    id: 1, email: 'ban.moi@example.com', role: 'member', message: 'Tham gia cùng mọi người nhé!',
    status: 'pending', invitedById: 1, expiresAt: daysAgo(-7), createdAt: daysAgo(1),
  },
  {
    id: 2, email: 'ban.hai@example.com', role: 'member', message: null,
    status: 'accepted', invitedById: 1, expiresAt: daysAgo(3), acceptedAt: daysAgo(2), createdAt: daysAgo(4),
  },
];
const CONTENT_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  // Video cho Reels + nhạc nền: mock phục vụ đúng như express.static ở production.
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};
const contentTypeOf = (name) => CONTENT_TYPES[path.extname(name).toLowerCase()] || 'application/octet-stream';

for (const file of fs.readdirSync(DEMO_IMAGES)) {
  /** Ảnh demo → uploads/posts/… ; video demo → cũng nằm trong posts/ như production. */
  uploads.set(file, fs.readFileSync(path.join(DEMO_IMAGES, file)));
}
/** Thời lượng video là số cố định để UI/test ổn định (mvhd không có ffprobe). */
const VIDEO_DURATIONS = new Map([['demo-clip.mp4', 5.76]]);

/* -------------------------------- helpers --------------------------------- */
function hoursAgo(h) { return new Date(Date.now() - h * 3600 * 1000).toISOString(); }
function daysAgo(d) { return new Date(Date.now() - d * 86400 * 1000).toISOString(); }
const findUser = (id) => users.find((user) => user.id === Number(id)) || null;
const tokenUser = (req) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  return token && tokens.has(token) ? findUser(tokens.get(token)) : null;
};
const publicUser = (user) => ({ id: user.id, username: user.username, fullName: user.fullName, avatarUrl: user.avatarUrl, bio: user.bio, locale: user.locale || 'vi', role: user.role, createdAt: user.createdAt });
// Mock phản chiếu ĐÚNG cấu trúc production: tệp nằm trong posts/ và avatars/.
const imageUrl = (filename, folder = 'posts') => `${PUBLIC_BASE}/uploads/${folder}/${filename}`;
const isVideo = (post) => post.mediaType === 'video';
/** 5.76 → "0:06" — cùng quy tắc với utils/mp4Duration.js ở backend. */
const durationLabel = (seconds) => {
  if (!Number.isFinite(seconds)) return null;
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
const postJSON = (post, viewer) => ({
  id: post.id,
  mediaType: post.mediaType || 'photo',
  isVideo: isVideo(post),
  imageUrl: imageUrl(post.imageFilename, 'posts'),
  imagePath: `/uploads/posts/${post.imageFilename}`,
  // Video (null với bài ảnh) — URL tách riêng như Post.toPublicJSON ở backend.
  videoUrl: post.videoFilename ? imageUrl(post.videoFilename, 'posts') : null,
  videoPath: post.videoFilename ? `/uploads/posts/${post.videoFilename}` : null,
  durationSeconds: post.videoFilename ? (VIDEO_DURATIONS.get(post.videoFilename) ?? post.durationSeconds ?? null) : null,
  durationLabel: post.videoFilename ? durationLabel(VIDEO_DURATIONS.get(post.videoFilename) ?? post.durationSeconds) : null,
  audioUrl: post.audioFilename ? imageUrl(post.audioFilename, 'posts') : null,
  audioTitle: post.audioTitle || null,
  viewCount: viewCounts.get(post.id) ?? 0,
  caption: post.caption,
  location: post.location,
  likeCount: post.likeCount,
  commentCount: post.commentCount,
  likedByViewer: likes.has(`${post.id}:${viewer?.id}`),
  canDelete: Boolean(viewer && (viewer.id === post.userId || viewer.role === 'admin')),
  downloadUrl: `${PUBLIC_BASE}/api/posts/${post.id}/download`,
  createdAt: post.createdAt,
  author: publicUser(findUser(post.userId)),
});
const commentJSON = (comment, viewer) => ({
  id: comment.id, postId: comment.postId, body: comment.body, createdAt: comment.createdAt,
  canDelete: Boolean(viewer && viewer.id === comment.userId), author: publicUser(findUser(comment.userId)),
});
const json = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' });
  res.end(body);
};
const ok = (res, data, status = 200) => json(res, status, { success: true, data });
const fail = (res, status, message, code = 'ERROR') => json(res, status, { success: false, code, message });

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Minimal multipart/form-data parser (fields + the single "image" file). */
function parseMultipart(buffer, boundary) {
  const files = {};
  const fields = {};
  const delimiter = Buffer.from(`--${boundary}`);
  let cursor = buffer.indexOf(delimiter);

  while (cursor !== -1) {
    const next = buffer.indexOf(delimiter, cursor + delimiter.length);
    if (next === -1) break;
    const part = buffer.slice(cursor + delimiter.length, next);
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const header = part.slice(0, headerEnd).toString('utf8');
      let content = part.slice(headerEnd + 4);
      if (content.slice(-2).toString() === '\r\n') content = content.slice(0, -2);
      const name = /name="([^"]+)"/.exec(header)?.[1];
      const filename = /filename="([^"]*)"/.exec(header)?.[1];
      const type = /Content-Type:\s*([^\r\n]+)/i.exec(header)?.[1]?.trim();
      if (name) {
        if (filename) files[name] = { filename, contentType: type || 'image/jpeg', data: content };
        else fields[name] = content.toString('utf8');
      }
    }
    cursor = next;
  }
  return { files, fields };
}

/* =========================== chat (tin nhắn 1-1) ===========================
 * Giả lập ĐÚNG hợp đồng của backend thật (services/chat.service.js) để giao
 * diện Hộp thư chạy được khi xem trước mà không cần MariaDB:
 *   • mỗi cặp người dùng đúng MỘT hội thoại
 *   • người lạ nhắn trước → status 'requested' (mục "Tin nhắn chờ")
 *   • số tin chưa đọc tính từ mốc đã đọc của từng người
 *   • tin nhắn chứa chữ / ảnh / bài viết chia sẻ / tin đã thu hồi
 * ========================================================================== */

/** Tệp cho tin nhắn nằm trong uploads/chat/ (giống thật) — sao chép từ ảnh demo. */
uploads.set('chat-quynhon.jpg', uploads.get('demo-2.jpg') || fs.readFileSync(path.join(DEMO_IMAGES, 'demo-2.jpg')));
uploads.set('chat-bien.jpg', uploads.get('demo-4.jpg') || fs.readFileSync(path.join(DEMO_IMAGES, 'demo-4.jpg')));
if (uploads.has('demo-clip.mp4')) uploads.set('chat-clip.mp4', uploads.get('demo-clip.mp4'));

let nextConversationId = 1;
let nextMessageId = 1;

const conversations = [];
const messagesOf = (conversation) => conversation.messages;

function seedConversation({ userOneId, userTwoId, status = 'accepted', requestedById = null, readAt = {}, messages = [] }) {
  const conversation = {
    id: nextConversationId++,
    userOneId: Math.min(userOneId, userTwoId),
    userTwoId: Math.max(userOneId, userTwoId),
    status,
    requestedById,
    // readAt: { [userId]: ISO } — mốc đã đọc của từng người
    readAt: { ...readAt },
    hiddenAt: {},
    messages: messages.map((message) => ({
      id: nextMessageId++,
      conversationId: 0,
      isDeleted: false,
      attachmentUrl: null,
      attachmentType: null,
      sharedPostId: null,
      readAt: null,
      ...message,
    })),
  };
  conversation.messages.forEach((message) => {
    message.conversationId = conversation.id;
  });
  conversations.push(conversation);
  return conversation;
}

const MINUTE = 60 * 1000;
const minutesAgo = (m) => new Date(Date.now() - m * MINUTE).toISOString();

// --- 1) Minh ↔ Linh: hội thoại đầy đủ (ảnh, video, bài viết, tin thu hồi) ----
seedConversation({
  userOneId: 1,
  userTwoId: 2,
  // Minh đọc tới tin gần cuối → còn 1 tin của Linh chưa đọc (badge = 1)
  readAt: { 1: minutesAgo(4), 2: minutesAgo(9) },
  messages: [
    { senderId: 2, body: 'Minh ơi, cuối tuần này đi Quy Nhơn không?', createdAt: minutesAgo(180), readAt: minutesAgo(175) },
    { senderId: 1, body: 'Đi chứ! Để mình đặt vé tàu.', createdAt: minutesAgo(176), readAt: minutesAgo(170) },
    { senderId: 2, body: 'Ảnh hôm qua mình chụp nè', attachmentUrl: '/uploads/chat/chat-quynhon.jpg', attachmentType: 'image', attachmentWidth: 1080, attachmentHeight: 1350, createdAt: minutesAgo(90), readAt: minutesAgo(85) },
    { senderId: 1, body: 'Đẹp ghê 😍', createdAt: minutesAgo(88), readAt: minutesAgo(80) },
    { senderId: 2, body: 'Nhớ hồi năm ngoái quá', sharedPostId: 6, createdAt: minutesAgo(30), readAt: minutesAgo(25) },
    { senderId: 1, body: 'Mưa Sài Gòn, quay bằng điện thoại 🎬', attachmentUrl: '/uploads/chat/chat-clip.mp4', attachmentType: 'video', createdAt: minutesAgo(20), readAt: minutesAgo(18) },
    { senderId: 1, body: 'tin này gửi nhầm, thôi thu hồi 😅', createdAt: minutesAgo(12), readAt: minutesAgo(12), isDeleted: true },
    { senderId: 2, body: 'Vé tàu đặt mấy giờ vậy?', createdAt: minutesAgo(3), readAt: null },
  ],
});

// --- 2) Minh ↔ Bảo Long: chuyện ngắn, đã đọc hết -----------------------------
seedConversation({
  userOneId: 1,
  userTwoId: 3,
  readAt: { 1: minutesAgo(400), 3: minutesAgo(390) },
  messages: [
    { senderId: 3, body: 'Minh ơi, bánh chưng năm nay gói ngày nào?', createdAt: minutesAgo(420), readAt: minutesAgo(415) },
    { senderId: 1, body: '28 Tết mình gói nhé, lá dong mua rồi.', createdAt: minutesAgo(410), readAt: minutesAgo(405) },
    { senderId: 3, body: 'Ừ, nhớ mua thêm ít đậu xanh nhé.', createdAt: minutesAgo(402), readAt: minutesAgo(400) },
  ],
});

// --- 3) Su Hà → Minh: TIN NHẮN CHỜ (chưa đồng ý) ---------------------------
seedConversation({
  userOneId: 1,
  userTwoId: 4,
  status: 'requested',
  requestedById: 4,
  readAt: {},
  messages: [
    { senderId: 4, body: 'Chào Minh, mình là Su Hà — ảnh biển của bạn đẹp quá!', createdAt: minutesAgo(45) },
    { senderId: 4, body: 'Cho mình hỏi bạn chụp ở Quy Nhơn chỗ nào vậy?', createdAt: minutesAgo(44) },
  ],
});

// --- 4) Linh ↔ Su Hà: hai tài khoản kia cũng có hộp thư -------------------
seedConversation({
  userOneId: 2,
  userTwoId: 4,
  readAt: { 2: minutesAgo(700), 4: minutesAgo(690) },
  messages: [
    { senderId: 4, body: 'Linh ơi, mai mình ghé chơi được không?', createdAt: minutesAgo(720), readAt: minutesAgo(710) },
    { senderId: 2, body: 'Được luôn, mình nấu canh chua nha 🌊', createdAt: minutesAgo(705), readAt: minutesAgo(700) },
  ],
});

// --- 5) Câu chuyện dài để thử cuộn tải tin cũ (phân trang) -----------------
const filler = [];
for (let index = 40; index >= 1; index -= 1) {
  filler.push({
    senderId: index % 2 === 0 ? 1 : 2,
    body: `Tin cũ số ${index} — trò chuyện lưu lại để thử cuộn lên tải thêm.`,
    createdAt: minutesAgo(60 * 24 * 3 + index * 3),
    readAt: minutesAgo(60 * 24 * 3 + index * 3 - 2),
  });
}
// Cặp (3,4) chưa dùng ở trên → vẫn giữ đúng luật "mỗi cặp một hội thoại".
const longChat = seedConversation({
  userOneId: 3,
  userTwoId: 4,
  readAt: { 3: minutesAgo(60 * 24 * 2), 4: minutesAgo(60 * 24 * 2) },
  messages: [],
});
filler.forEach((message) => {
  longChat.messages.push({
    ...message,
    id: nextMessageId++,
    conversationId: longChat.id,
    isDeleted: false,
    attachmentUrl: null,
    attachmentType: null,
    sharedPostId: null,
  });
});

const conversationById = (id) => conversations.find((item) => item.id === Number(id)) || null;
const isMemberOf = (conversation, userId) =>
  Boolean(conversation && userId && (conversation.userOneId === userId || conversation.userTwoId === userId));
const peerIdOf = (conversation, userId) =>
  conversation.userOneId === Number(userId) ? conversation.userTwoId : conversation.userOneId;

/** Trích đoạn tin cuối — cùng luật với services/chat.service.js. */
function previewOf(message) {
  if (!message) return null;
  if (message.isDeleted) return 'Tin nhắn đã được thu hồi';
  if (message.sharedPostId) return '📎 Bài viết';
  if (message.body && message.attachmentUrl) return `${message.attachmentType === 'video' ? '🎥 Video' : '📷 Ảnh'} ${message.body}`;
  if (message.attachmentUrl) return message.attachmentType === 'video' ? '🎥 Video' : '📷 Ảnh';
  return message.body;
}

const lastMessageOf = (conversation) => conversation.messages[conversation.messages.length - 1] || null;

function unreadCountFor(conversation, userId) {
  const peerId = peerIdOf(conversation, userId);
  const readAt = conversation.readAt[userId] ? new Date(conversation.readAt[userId]).getTime() : 0;
  return conversation.messages.filter(
    (message) => message.senderId === peerId && !message.isDeleted && new Date(message.createdAt).getTime() > readAt
  ).length;
}

function conversationJSON(conversation, viewerId) {
  const me = Number(viewerId);
  const peer = findUser(peerIdOf(conversation, me));
  const last = lastMessageOf(conversation);
  const peerReadAt = conversation.readAt[peerIdOf(conversation, me)]
    ? new Date(conversation.readAt[peerIdOf(conversation, me)]).getTime()
    : 0;
  const hidden = conversation.hiddenAt[me] ? new Date(conversation.hiddenAt[me]).getTime() : 0;
  return {
    id: conversation.id,
    status: conversation.status,
    isRequest: conversation.status === 'requested' && conversation.requestedById !== me,
    canRespond: conversation.status === 'requested' && conversation.requestedById !== me,
    peer: peer ? publicUser(peer) : null,
    lastMessage: last
      ? {
          id: last.id,
          preview: previewOf(last),
          mine: last.senderId === me,
          seen: last.senderId === me ? peerReadAt >= new Date(last.createdAt).getTime() : true,
          at: last.createdAt,
        }
      : null,
    unreadCount: unreadCountFor(conversation, me),
    updatedAt: last ? last.createdAt : new Date().toISOString(),
    _hidden: hidden && (!last || new Date(last.createdAt).getTime() <= hidden),
  };
}

function messageJSON(message, viewerId) {
  const me = Number(viewerId);
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    mine: message.senderId === me,
    body: message.isDeleted ? null : message.body,
    isDeleted: Boolean(message.isDeleted),
    attachmentUrl: message.isDeleted ? null : message.attachmentUrl,
    attachmentType: message.isDeleted ? null : message.attachmentType,
    attachmentWidth: message.attachmentWidth || null,
    attachmentHeight: message.attachmentHeight || null,
    sharedPostId: message.isDeleted ? null : message.sharedPostId,
    seen: message.senderId === me ? Boolean(message.readAt) : true,
    readAt: message.readAt,
    createdAt: message.createdAt,
  };
}

function visibleConversations(viewerId, box) {
  const me = Number(viewerId);
  return conversations
    .filter((conversation) => isMemberOf(conversation, me))
    .filter((conversation) =>
      box === 'requests'
        ? conversation.status === 'requested' && conversation.requestedById !== me
        : conversation.status === 'accepted'
    )
    .filter((conversation) => !conversationJSON(conversation, me)._hidden)
    .sort((a, b) => new Date(lastMessageOf(b)?.createdAt || 0) - new Date(lastMessageOf(a)?.createdAt || 0));
}

function chatSummary(viewerId) {
  const inbox = visibleConversations(viewerId, 'inbox');
  const requests = visibleConversations(viewerId, 'requests');
  return {
    totalUnread: inbox.reduce((sum, conversation) => sum + unreadCountFor(conversation, viewerId), 0),
    pendingRequests: requests.reduce((sum, conversation) => sum + Math.max(unreadCountFor(conversation, viewerId), 1), 0),
  };
}

/** Tạo hội thoại mới nếu chưa có (đúng luật: mỗi cặp chỉ một hội thoại). */
function openConversationBetween(viewerId, peerId) {
  const me = Number(viewerId);
  const other = Number(peerId);
  const existing = conversations.find(
    (conversation) =>
      (conversation.userOneId === Math.min(me, other) && conversation.userTwoId === Math.max(me, other))
  );
  if (existing) return { conversation: existing, created: false };
  const conversation = seedConversation({
    userOneId: me,
    userTwoId: other,
    // Người chưa từng trò chuyện → tin nhắn chờ (giống thật, cờ CHAT_MESSAGE_REQUESTS=true)
    status: conversations.length ? 'requested' : 'requested',
    requestedById: me,
    readAt: {},
    messages: [],
  });
  return { conversation, created: true };
}

/* --------------------------------- router --------------------------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;
  const viewer = tokenUser(req);

  if (req.method === 'OPTIONS') return json(res, 204, {});

  /* ------------------------------ static images --------------------------- */
  if (pathname.startsWith('/uploads/')) {
    const name = path.basename(pathname);
    const buffer = uploads.get(name) || (() => {
      const diskPath = path.join(UPLOAD_DIR, name);
      return fs.existsSync(diskPath) ? fs.readFileSync(diskPath) : null;
    })();
    if (!buffer) return fail(res, 404, 'File not found', 'NOT_FOUND');

    const headers = {
      'Content-Type': contentTypeOf(name),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': 'bytes',
    };

    // Video/audio: hỗ trợ Range request để <video> tua được (giống express.static).
    const range = req.headers.range;
    const match = range && /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), buffer.length - 1) : buffer.length - 1;
      res.writeHead(206, {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${buffer.length}`,
        'Content-Length': end - start + 1,
      });
      return res.end(buffer.subarray(start, end + 1));
    }

    res.writeHead(200, { ...headers, 'Content-Length': buffer.length });
    return res.end(buffer);
  }

  /* --------------------------------- auth --------------------------------- */
  if (pathname === '/api/auth/config') {
    return ok(res, {
      appName: 'PixGram',
      maxUploadMb: 15,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      maxVideoMb: 60,
      maxVideoDurationSeconds: 60,
      allowedVideoMimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
      maxAudioMb: 10,
      allowedAudioMimeTypes: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav'],
      uploadsBaseUrl: `${PUBLIC_BASE}/uploads`,
      apiBaseUrl: `${PUBLIC_BASE}/api`,
      defaultLocale: 'vi',
      supportedLocales: ['vi', 'en', 'zh'],
    });
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    const identifier = String(body.identifier || '').toLowerCase();
    const user = users.find((item) => item.username === identifier || `${item.username}@d4mdev.click` === identifier) || users[0];
    const token = `demo-${user.id}-${Date.now()}`;
    tokens.set(token, user.id);
    return ok(res, { token, user: publicUser(user) });
  }

  /* ------------------- quên mật khẩu / đặt lại (giả lập) ------------------ */
  if (pathname === '/api/auth/forgot-password' && req.method === 'POST') {
    // Giống backend thật: LUÔN trả cùng một thông báo để không lộ email nào có tài khoản.
    return ok(res, {
      message: 'Nếu email này có tài khoản, chúng tôi đã gửi liên kết đặt lại mật khẩu.',
      expiresInMinutes: 30,
      // Chỉ bản xem trước mới có: mở luôn liên kết để thử trang đặt lại mật khẩu.
      demoResetUrl: `${PUBLIC_BASE}${'/reset-password'}?token=demo-token`,
    });
  }

  if (pathname === '/api/auth/reset-password' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    if (body.token !== 'demo-token' || String(body.password || '').length < 8) {
      return fail(res, 400, 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.', 'BAD_REQUEST');
    }
    return ok(res, { message: 'Mật khẩu đã được đổi. Hãy đăng nhập bằng mật khẩu mới.' });
  }

  /* ------------------------------ lời mời -------------------------------- */
  if (pathname === '/api/invites' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    const invite = {
      id: invites.length + 1,
      email: String(body.email || '').toLowerCase(),
      role: body.role === 'admin' ? 'admin' : 'member',
      message: body.message || null,
      status: 'pending',
      invitedById: 1,
      expiresAt: daysAgo(-7),
      createdAt: new Date().toISOString(),
    };
    invites.push(invite);
    return ok(res, { invite, emailSent: false, inviteUrl: `${PUBLIC_BASE}/register?invite=demo-invite` }, 201);
  }

  if (pathname === '/api/invites' && req.method === 'GET') {
    return ok(res, { invites: invites.map((invite) => ({ ...invite, inviter: publicUser(users[0]) })) });
  }

  if (pathname === '/api/invites/stats' && req.method === 'GET') {
    return ok(res, {
      pending: invites.filter((invite) => invite.status === 'pending').length,
      accepted: 0,
      expired: 0,
      ttlDays: 7,
    });
  }

  // Thu hồi lời mời: nút × trong trang "Mời thành viên".
  if (pathname.startsWith('/api/invites/') && req.method === 'DELETE') {
    const id = Number(pathname.replace('/api/invites/', ''));
    const found = invites.find((invite) => invite.id === id);
    if (!found) return fail(res, 404, 'Không tìm thấy lời mời.', 'NOT_FOUND');
    found.status = 'revoked';
    return ok(res, { invite: found });
  }

  if (pathname.startsWith('/api/invites/') && req.method === 'GET') {
    const token = decodeURIComponent(pathname.replace('/api/invites/', ''));
    if (token === 'demo-invite') {
      return ok(res, {
        invite: {
          id: 1,
          email: 'nguoi.moi@example.com',
          role: 'member',
          status: 'pending',
          message: 'Tham gia cùng mọi người nhé!',
          inviter: publicUser(users[0]),
          expiresAt: daysAgo(-7),
        },
      });
    }
    if (token === 'demo-expired') {
      return json(res, 410, { success: false, code: 'INVITE_EXPIRED', message: 'Lời mời đã hết hạn hoặc đã được sử dụng.' });
    }
    return fail(res, 404, 'Liên kết mời không tồn tại hoặc đã bị thu hồi.', 'NOT_FOUND');
  }

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    const user = {
      id: users.length + 1,
      username: String(body.username || 'new.member').toLowerCase(),
      fullName: body.fullName || 'New Member',
      role: 'member', avatarUrl: null, bio: null, createdAt: new Date().toISOString(),
    };
    users.push(user);
    const token = `demo-${user.id}-${Date.now()}`;
    tokens.set(token, user.id);
    return ok(res, { token, user: publicUser(user) }, 201);
  }

  if (pathname === '/api/auth/me') {
    if (!viewer) return fail(res, 401, 'Missing bearer token.', 'UNAUTHORIZED');
    return ok(res, { user: publicUser(viewer) });
  }

  /* --------------------------------- posts -------------------------------- */
  if (pathname === '/api/posts' && req.method === 'GET') {
    const page = Number(url.searchParams.get('page') || 1);
    const limit = Number(url.searchParams.get('limit') || 12);
    const userId = url.searchParams.get('userId');
    const mediaType = url.searchParams.get('mediaType');
    const filtered = posts.filter(
      (post) =>
        (!userId || post.userId === Number(userId)) &&
        (!mediaType || (post.mediaType || 'photo') === mediaType)
    );
    const slice = filtered.slice((page - 1) * limit, page * limit);
    return ok(res, {
      posts: slice.map((post) => postJSON(post, viewer)),
      pagination: { page, limit, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / limit)), hasMore: page * limit < filtered.length },
    });
  }

  if (pathname === '/api/posts/stats') {
    return ok(res, { users: users.length, posts: posts.length, likes: likes.size, comments: comments.length, storage: { bytes: 4_200_000, megabytes: 4.2 } });
  }

  if (pathname === '/api/posts' && req.method === 'POST') {
    if (!viewer) return fail(res, 401, 'Authentication required', 'UNAUTHORIZED');
    const contentType = req.headers['content-type'] || '';
    const boundary = /boundary=(.+)$/.exec(contentType)?.[1];
    const buffer = await readBody(req);
    const { files, fields } = boundary ? parseMultipart(buffer, boundary) : { files: {}, fields: {} };
    const file = files.image;
    const videoFile = files.video;
    const audioFile = files.audio;
    if (!file && !videoFile) {
      return fail(res, 400, 'Cần ít nhất một ảnh ("image") hoặc một video ("video").', 'BAD_REQUEST');
    }

    const save = (upload) => {
      const extension = (upload.contentType.split('/')[1] || 'bin').replace('jpeg', 'jpg');
      const filename = `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}.${extension}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, filename), upload.data);
      uploads.set(filename, upload.data);
      return filename;
    };

    const imageFilename = file ? save(file) : null;
    const videoFilename = videoFile ? save(videoFile) : null;
    const audioFilename = audioFile ? save(audioFile) : null;

    // Backend thật đọc thời lượng từ atom mvhd; mock dùng số client gửi lên.
    const clientDuration = Number(fields.durationSeconds) || null;
    const durationSeconds = videoFilename ? VIDEO_DURATIONS.get(videoFilename) ?? clientDuration : null;

    if (videoFilename && durationSeconds && durationSeconds > 60) {
      return fail(res, 422, `Video dài ${durationLabel(durationSeconds)} — vượt giới hạn 60 giây của Reels.`, 'UNPROCESSABLE_ENTITY');
    }

    const post = {
      id: nextPostId++, userId: viewer.id, mediaType: videoFilename ? 'video' : 'photo',
      imageFilename, videoFilename, audioFilename, durationSeconds,
      audioTitle: fields.audioTitle || null,
      caption: fields.caption || null, location: fields.location || null,
      likeCount: 0, commentCount: 0, createdAt: new Date().toISOString(),
    };
    if (videoFilename) VIDEO_DURATIONS.set(videoFilename, durationSeconds);
    viewCounts.set(post.id, 0);
    posts.unshift(post);
    return ok(res, { post: postJSON(post, viewer) }, 201);
  }

  const postMatch = /^\/api\/posts\/(\d+)$/.exec(pathname);
  if (postMatch && req.method === 'GET') {
    const post = posts.find((item) => item.id === Number(postMatch[1]));
    if (!post) return fail(res, 404, 'Post not found.', 'NOT_FOUND');
    return ok(res, { post: { ...postJSON(post, viewer), comments: comments.filter((c) => c.postId === post.id).map((c) => commentJSON(c, viewer)) } });
  }

  if (postMatch && req.method === 'DELETE') {
    if (!viewer) return fail(res, 401, 'Authentication required', 'UNAUTHORIZED');
    const index = posts.findIndex((item) => item.id === Number(postMatch[1]));
    if (index === -1) return fail(res, 404, 'Post not found.', 'NOT_FOUND');
    const post = posts[index];
    if (post.userId !== viewer.id && viewer.role !== 'admin') return fail(res, 403, 'You can only delete your own photos.', 'FORBIDDEN');
    posts.splice(index, 1);
    return ok(res, { deletedId: post.id });
  }

  const likeMatch = /^\/api\/posts\/(\d+)\/likes$/.exec(pathname);
  if (likeMatch && req.method === 'POST') {
    if (!viewer) return fail(res, 401, 'Authentication required', 'UNAUTHORIZED');
    const post = posts.find((item) => item.id === Number(likeMatch[1]));
    if (!post) return fail(res, 404, 'Post not found.', 'NOT_FOUND');
    const key = `${post.id}:${viewer.id}`;
    if (likes.has(key)) { likes.delete(key); post.likeCount = Math.max(0, post.likeCount - 1); return ok(res, { postId: post.id, liked: false, likeCount: post.likeCount, commentCount: post.commentCount }); }
    likes.add(key); post.likeCount += 1;
    return ok(res, { postId: post.id, liked: true, likeCount: post.likeCount, commentCount: post.commentCount });
  }

  const commentMatch = /^\/api\/posts\/(\d+)\/comments$/.exec(pathname);
  if (commentMatch && req.method === 'GET') {
    const postId = Number(commentMatch[1]);
    return ok(res, { comments: comments.filter((c) => c.postId === postId).map((c) => commentJSON(c, viewer)) });
  }
  if (commentMatch && req.method === 'POST') {
    if (!viewer) return fail(res, 401, 'Authentication required', 'UNAUTHORIZED');
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    const post = posts.find((item) => item.id === Number(commentMatch[1]));
    if (!post) return fail(res, 404, 'Post not found.', 'NOT_FOUND');
    const comment = { id: nextCommentId++, postId: post.id, userId: viewer.id, body: String(body.body || '').slice(0, 400), createdAt: new Date().toISOString() };
    comments.push(comment); post.commentCount += 1;
    return ok(res, { comment: commentJSON(comment, viewer) }, 201);
  }

  const commentDelete = /^\/api\/comments\/(\d+)$/.exec(pathname);
  if (commentDelete && req.method === 'DELETE') {
    const index = comments.findIndex((item) => item.id === Number(commentDelete[1]));
    if (index === -1) return fail(res, 404, 'Comment not found.', 'NOT_FOUND');
    const [removed] = comments.splice(index, 1);
    const post = posts.find((item) => item.id === removed.postId);
    if (post) post.commentCount = Math.max(0, post.commentCount - 1);
    return ok(res, { deletedId: removed.id });
  }

  /* --------------------------------- users -------------------------------- */
  if (pathname === '/api/users/me/posts') {
    if (!viewer) return fail(res, 401, 'Authentication required', 'UNAUTHORIZED');
    return profileResponse(res, viewer, viewer);
  }
  const userPosts = /^\/api\/users\/([^/]+)\/posts$/.exec(pathname);
  if (userPosts) {
    const identifier = decodeURIComponent(userPosts[1]);
    const user = /^\d+$/.test(identifier) ? findUser(identifier) : users.find((item) => item.username === identifier.toLowerCase());
    if (!user) return fail(res, 404, 'User not found.', 'NOT_FOUND');
    return profileResponse(res, user, viewer);
  }

  /* --------------------------------- reels -------------------------------- */
  if (pathname === '/api/reels' && req.method === 'GET') {
    const page = Number(url.searchParams.get('page') || 1);
    const limit = Math.min(Number(url.searchParams.get('limit') || 6), 20);
    const reelsOnly = posts.filter(isVideo);
    const slice = reelsOnly.slice((page - 1) * limit, page * limit);
    return ok(res, {
      reels: slice.map((post) => postJSON(post, viewer)),
      maxDurationSeconds: 60,
      pagination: {
        page, limit, total: reelsOnly.length,
        totalPages: Math.max(1, Math.ceil(reelsOnly.length / limit)),
        hasMore: page * limit < reelsOnly.length,
      },
    });
  }

  const reelMatch = /^\/api\/reels\/(\d+)$/.exec(pathname);
  if (reelMatch && req.method === 'GET') {
    const post = posts.find((item) => item.id === Number(reelMatch[1]) && isVideo(item));
    if (!post) return fail(res, 404, 'Reel not found.', 'NOT_FOUND');
    return ok(res, { reel: postJSON(post, viewer) });
  }

  /* -------------------------------- stories ------------------------------- */
  if (pathname === '/api/stories' && req.method === 'GET') {
    const windowHours = 24;
    // Cửa sổ 24h: chỉ lấy bài trong 24 giờ gần nhất, gom theo tác giả.
    const since = Date.now() - windowHours * 3600 * 1000;
    const fresh = posts
      .filter((post) => new Date(post.createdAt).getTime() >= since)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const byAuthor = new Map();
    fresh.forEach((post) => {
      const list = byAuthor.get(post.userId) || [];
      list.push(postJSON(post, viewer));
      byAuthor.set(post.userId, list);
    });

    const groups = [...byAuthor.entries()]
      .map(([userId, items]) => ({
        author: publicUser(findUser(userId)),
        posts: items,
        latestAt: items[0]?.createdAt || null,
      }))
      // nhóm có bài mới nhất đứng trước
      .sort((a, b) => new Date(b.latestAt) - new Date(a.latestAt));

    return ok(res, { windowHours, total: fresh.length, groups });
  }

  /* --------------------------- lượt xem · tải về -------------------------- */
  const viewMatch = /^\/api\/posts\/(\d+)\/views$/.exec(pathname);
  if (viewMatch && req.method === 'POST') {
    const post = posts.find((item) => item.id === Number(viewMatch[1]));
    if (!post) return fail(res, 404, 'Post not found.', 'NOT_FOUND');
    const next = (viewCounts.get(post.id) ?? 0) + 1;
    viewCounts.set(post.id, next);
    return ok(res, { postId: post.id, viewCount: next });
  }

  const downloadMatch = /^\/api\/posts\/(\d+)\/download$/.exec(pathname);
  if (downloadMatch && req.method === 'GET') {
    const post = posts.find((item) => item.id === Number(downloadMatch[1]));
    if (!post) return fail(res, 404, 'Post not found.', 'NOT_FOUND');

    const filename = post.videoFilename || post.imageFilename;
    const buffer = uploads.get(filename) || (() => {
      const diskPath = path.join(UPLOAD_DIR, filename);
      return fs.existsSync(diskPath) ? fs.readFileSync(diskPath) : null;
    })();
    if (!buffer) return fail(res, 404, 'File not found.', 'NOT_FOUND');

    // Tên tệp thân thiện, cùng quy tắc với downloadPost ở backend thật.
    const owner = findUser(post.userId)?.username || 'member';
    const date = new Date(post.createdAt).toISOString().slice(0, 10);
    const extension = path.extname(filename) || (post.videoFilename ? '.mp4' : '.jpg');
    res.writeHead(200, {
      'Content-Type': contentTypeOf(filename),
      'Content-Length': buffer.length,
      'Content-Disposition': `attachment; filename="pixgram-${owner}-${post.id}-${date}${extension}"`,
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(buffer);
  }

  /* --------------------------------- chat --------------------------------- */
  /**
   * Kênh thời gian thực (SSE) — giống backend thật. Sau ~8 giây, người kia
   * "đang nhập…" rồi gửi một tin để thấy ngay giao diện nhảy tin realtime.
   */
  if (pathname === '/api/chat/stream' && req.method === 'GET') {
    if (!viewer) return fail(res, 401, 'Cần đăng nhập.', 'UNAUTHORIZED');
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });
    const send = (event, payload) => res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    res.write('retry: 3000\n\n');
    send('ready', { userId: viewer.id, at: new Date().toISOString() });

    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
    const timers = [heartbeat];

    // Kịch bản demo: đồng nghiệp/bạn bè nhắn tới sau vài giây.
    const target = visibleConversations(viewer.id, 'inbox')[0];
    if (target) {
      const peerId = peerIdOf(target, viewer.id);
      timers.push(
        setTimeout(() => send('typing', { conversationId: target.id, userId: peerId, typing: true }), 8000),
        setTimeout(() => {
          const message = {
            id: nextMessageId++,
            conversationId: target.id,
            senderId: peerId,
            body: 'Tin nhắn realtime từ bản xem trước 👋',
            isDeleted: false,
            attachmentUrl: null,
            attachmentType: null,
            sharedPostId: null,
            readAt: null,
            createdAt: new Date().toISOString(),
          };
          target.messages.push(message);
          send('typing', { conversationId: target.id, userId: peerId, typing: false });
          send('message', {
            message: messageJSON(message, viewer.id),
            conversation: { id: target.id, status: target.status, peerId, lastMessagePreview: message.body, lastMessageAt: message.createdAt },
          });
        }, 12000)
      );
    }

    const cleanup = () => {
      timers.forEach(clearTimeout);
      timers.forEach(clearInterval);
      res.end();
    };
    req.on('close', cleanup);
    req.on('aborted', cleanup);
    return undefined;
  }

  if (pathname === '/api/chat/summary' && req.method === 'GET') {
    if (!viewer) return fail(res, 401, 'Cần đăng nhập.', 'UNAUTHORIZED');
    return ok(res, chatSummary(viewer.id));
  }

  if (pathname === '/api/chat/people' && req.method === 'GET') {
    if (!viewer) return fail(res, 401, 'Cần đăng nhập.', 'UNAUTHORIZED');
    const query = (url.searchParams.get('q') || '').toLowerCase();
    const people = users
      .filter((user) => user.id !== viewer.id)
      .filter((user) => !query || user.username.toLowerCase().includes(query) || user.fullName.toLowerCase().includes(query))
      .map((user) => {
        const existing = conversations.find(
          (conversation) =>
            conversation.userOneId === Math.min(user.id, viewer.id) &&
            conversation.userTwoId === Math.max(user.id, viewer.id)
        );
        return { ...publicUser(user), conversationId: existing ? existing.id : null };
      });
    return ok(res, { people });
  }

  if (pathname === '/api/chat/conversations' && req.method === 'GET') {
    if (!viewer) return fail(res, 401, 'Cần đăng nhập.', 'UNAUTHORIZED');
    const box = url.searchParams.get('box') === 'requests' ? 'requests' : 'inbox';
    const limit = Number(url.searchParams.get('limit') || 50);
    return ok(res, {
      box,
      conversations: visibleConversations(viewer.id, box).slice(0, limit).map((conversation) => conversationJSON(conversation, viewer.id)),
      summary: chatSummary(viewer.id),
    });
  }

  if (pathname === '/api/chat/conversations' && req.method === 'POST') {
    if (!viewer) return fail(res, 401, 'Cần đăng nhập.', 'UNAUTHORIZED');
    const body = JSON.parse((await readBody(req)) || '{}');
    const peer = findUser(body.userId);
    if (!peer) return fail(res, 404, 'Người dùng không tồn tại.', 'NOT_FOUND');
    if (peer.id === viewer.id) return fail(res, 400, 'Không thể tự nhắn tin cho chính mình.', 'BAD_REQUEST');
    const { conversation, created } = openConversationBetween(viewer.id, peer.id);
    return json(res, created ? 201 : 200, {
      success: true,
      data: { conversation: conversationJSON(conversation, viewer.id), created },
    });
  }

  const chatMessages = /^\/api\/chat\/conversations\/(\d+)\/messages$/.exec(pathname);
  if (chatMessages) {
    if (!viewer) return fail(res, 401, 'Cần đăng nhập.', 'UNAUTHORIZED');
    const conversation = conversationById(chatMessages[1]);
    if (!conversation) return fail(res, 404, 'Hội thoại không tồn tại.', 'NOT_FOUND');
    if (!isMemberOf(conversation, viewer.id)) return fail(res, 403, 'Bạn không thuộc hội thoại này.', 'FORBIDDEN');

    if (req.method === 'GET') {
      const limit = Number(url.searchParams.get('limit') || 30);
      const before = Number(url.searchParams.get('before') || 0);
      const pool = before
        ? conversation.messages.filter((message) => message.id < before)
        : conversation.messages;
      const page = pool.slice(-limit);
      const hasMore = pool.length > page.length;
      return ok(res, {
        messages: page.map((message) => messageJSON(message, viewer.id)),
        hasMore,
        nextBefore: page.length ? page[0].id : null,
      });
    }

    if (req.method === 'POST') {
      const raw = await readBody(req);
      let body = '';
      let sharedPostId = null;
      let attachment = null;
      const type = req.headers['content-type'] || '';
      if (type.includes('multipart/form-data')) {
        const boundary = /boundary=(.+)$/.exec(type)?.[1];
        const parsed = parseMultipart(raw, boundary);
        body = parsed.fields.body || '';
        sharedPostId = parsed.fields.sharedPostId ? Number(parsed.fields.sharedPostId) : null;
        const file = parsed.files.attachment;
        if (file) {
          const extension = path.extname(file.filename || '') || '.jpg';
          const stored = `chat-upload-${Date.now()}${extension}`;
          uploads.set(stored, file.data);
          attachment = {
            url: imageUrl(stored, 'chat'),
            type: file.contentType.startsWith('video/') ? 'video' : 'image',
          };
        }
      } else {
        const parsed = JSON.parse(raw || '{}');
        body = parsed.body || '';
        sharedPostId = parsed.sharedPostId ? Number(parsed.sharedPostId) : null;
      }

      if (!body.trim() && !attachment && !sharedPostId) {
        return fail(res, 400, 'Tin nhắn phải có nội dung, ảnh hoặc bài viết được chia sẻ.', 'BAD_REQUEST');
      }

      const message = {
        id: nextMessageId++,
        conversationId: conversation.id,
        senderId: viewer.id,
        body: body.trim() || null,
        isDeleted: false,
        attachmentUrl: attachment ? attachment.url : null,
        attachmentType: attachment ? attachment.type : null,
        sharedPostId: sharedPostId || null,
        readAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      conversation.messages.push(message);
      conversation.readAt[viewer.id] = message.createdAt;
      return json(res, 201, {
        success: true,
        data: {
          message: messageJSON(message, viewer.id),
          conversationId: conversation.id,
          conversationStatus: conversation.status,
        },
      });
    }
  }

  const chatAction = /^\/api\/chat\/conversations\/(\d+)\/(read|accept|decline|typing)$/.exec(pathname);
  if (chatAction && req.method === 'POST') {
    if (!viewer) return fail(res, 401, 'Cần đăng nhập.', 'UNAUTHORIZED');
    const conversation = conversationById(chatAction[1]);
    if (!conversation) return fail(res, 404, 'Hội thoại không tồn tại.', 'NOT_FOUND');
    if (!isMemberOf(conversation, viewer.id)) return fail(res, 403, 'Bạn không thuộc hội thoại này.', 'FORBIDDEN');

    const peerId = peerIdOf(conversation, viewer.id);
    if (chatAction[2] === 'read') {
      const unread = unreadCountFor(conversation, viewer.id);
      conversation.readAt[viewer.id] = new Date().toISOString();
      conversation.messages
        .filter((message) => message.senderId === peerId && !message.isDeleted)
        .forEach((message) => {
          message.readAt = message.readAt || conversation.readAt[viewer.id];
        });
      return ok(res, { unread, conversationId: conversation.id });
    }
    if (chatAction[2] === 'accept') {
      if (conversation.status !== 'requested' || conversation.requestedById === viewer.id) {
        return fail(res, 403, 'Chỉ người nhận mới đồng ý được tin nhắn chờ.', 'FORBIDDEN');
      }
      conversation.status = 'accepted';
      return ok(res, { conversationId: conversation.id, status: 'accepted' });
    }
    if (chatAction[2] === 'decline') {
      conversation.status = 'declined';
      return ok(res, { conversationId: conversation.id, status: 'declined' });
    }
    // typing — chỉ là tín hiệu, không lưu gì
    return ok(res, { ok: true });
  }

  const chatConversation = /^\/api\/chat\/conversations\/(\d+)$/.exec(pathname);
  if (chatConversation) {
    if (!viewer) return fail(res, 401, 'Cần đăng nhập.', 'UNAUTHORIZED');
    const conversation = conversationById(chatConversation[1]);
    if (!conversation) return fail(res, 404, 'Hội thoại không tồn tại.', 'NOT_FOUND');
    if (!isMemberOf(conversation, viewer.id)) return fail(res, 403, 'Bạn không thuộc hội thoại này.', 'FORBIDDEN');

    if (req.method === 'GET') return ok(res, { conversation: conversationJSON(conversation, viewer.id) });
    if (req.method === 'DELETE') {
      conversation.hiddenAt[viewer.id] = new Date().toISOString();
      return ok(res, { hidden: true });
    }
  }

  if (pathname === '/api/chat/messages' && req.method === 'POST') {
    if (!viewer) return fail(res, 401, 'Cần đăng nhập.', 'UNAUTHORIZED');
    const body = JSON.parse((await readBody(req)) || '{}');
    const peer = findUser(body.toUserId);
    if (!peer) return fail(res, 404, 'Người dùng không tồn tại.', 'NOT_FOUND');
    const { conversation } = openConversationBetween(viewer.id, peer.id);
    const message = {
      id: nextMessageId++,
      conversationId: conversation.id,
      senderId: viewer.id,
      body: body.body || null,
      isDeleted: false,
      attachmentUrl: null,
      attachmentType: null,
      sharedPostId: body.sharedPostId ? Number(body.sharedPostId) : null,
      readAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    conversation.messages.push(message);
    conversation.readAt[viewer.id] = message.createdAt;
    return json(res, 201, {
      success: true,
      data: { message: messageJSON(message, viewer.id), conversationId: conversation.id, conversationStatus: conversation.status },
    });
  }

  const chatMessage = /^\/api\/chat\/messages\/(\d+)$/.exec(pathname);
  if (chatMessage && req.method === 'DELETE') {
    if (!viewer) return fail(res, 401, 'Cần đăng nhập.', 'UNAUTHORIZED');
    const found = conversations.flatMap((conversation) => conversation.messages).find((message) => message.id === Number(chatMessage[1]));
    if (!found) return fail(res, 404, 'Tin nhắn không tồn tại.', 'NOT_FOUND');
    if (found.senderId !== viewer.id) return fail(res, 403, 'Chỉ thu hồi được tin nhắn của chính mình.', 'FORBIDDEN');
    // Thu hồi = xoá nội dung + đánh dấu (đúng như backend thật).
    found.isDeleted = true;
    found.body = null;
    found.attachmentUrl = null;
    return ok(res, { deleted: true, id: found.id });
  }

  if (pathname === '/api/health') {
    return ok(res, {
      status: 'ok',
      env: 'demo',
      apiBase: `${PUBLIC_BASE}/api`,
      // Bản giả lập không có SMTP thật.
      email: { enabled: true, ready: false, reason: 'bản demo không gửi email', from: 'demo@example.com' },
      timestamp: new Date().toISOString(),
    });
  }

  return fail(res, 404, `Route ${req.method} ${pathname} does not exist.`, 'NOT_FOUND');
});

function profileResponse(res, user, viewer) {
  return ok(res, {
    profile: publicUser(user),
    avatarUrl: user.avatarUrl ? imageUrl(user.avatarUrl, 'avatars') : null,
    posts: posts.filter((post) => post.userId === user.id).map((post) => postJSON(post, viewer)),
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  PixGram DEMO API  →  http://127.0.0.1:${PORT}`);
  console.log('  Users: minh.nguyen · linh.tran · bao.long · su.ha   (any password)');
  console.log('  Routes: /api/reels · /api/stories · /api/posts/:id/views · /api/posts/:id/download\n');
});
