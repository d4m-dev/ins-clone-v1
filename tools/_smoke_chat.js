#!/usr/bin/env node
'use strict';

/**
 * tools/_smoke_chat.js — kiểm thử tích hợp cho hệ thống CHAT (API thật + SQLite).
 * ---------------------------------------------------------------------------
 * Chạy đúng routes/controllers/services của backend trên SQLite tạm, rồi kiểm
 * tra từng hành vi giống Instagram:
 *
 *   node tools/_smoke_chat.js
 *
 * Phạm vi:
 *   • mỗi cặp người dùng chỉ có MỘT hội thoại (pairKey)
 *   • người lạ nhắn trước → "Tin nhắn chờ" → người nhận đồng ý / từ chối
 *   • đếm tin chưa đọc, đánh dấu đã đọc, "Đã xem" phía người gửi
 *   • phân trang tin nhắn (cuộn lên tải tin cũ hơn)
 *   • thu hồi tin nhắn (chỉ của mình, trong 60 phút), xoá nội dung trong DB
 *   • ẩn hội thoại khỏi hộp thư, tin mới làm hội thoại hiện lại
 *   • gửi ảnh (multipart), chia sẻ bài viết, tìm người để nhắn
 *   • bảo mật: không đọc/gửi được vào hội thoại của người khác
 *   • kênh realtime SSE: kết nối, nhận sự kiện 'ready'
 * ---------------------------------------------------------------------------
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

/* ------------------------- biến môi trường của test ------------------------ */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-chat-'));
process.env.NODE_ENV = 'development';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = path.join(TMP, 'chat.sqlite');
process.env.DB_LOGGING = 'false';
process.env.UPLOAD_DIR = path.join(TMP, 'uploads');
process.env.PUBLIC_BASE_URL = 'http://127.0.0.1:4200';
process.env.JWT_SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
process.env.ADMIN_SESSION_SECRET = 'test-admin-secret-0123456789abcdef0123456789';
process.env.TELEGRAM_ENABLED = 'false';
process.env.EMAIL_ENABLED = 'false';
process.env.MAX_UPLOAD_SIZE_MB = '5';
process.env.CHAT_MAX_MESSAGE_LENGTH = '500';
process.env.CHAT_PAGE_SIZE = '3'; // nhỏ để thử phân trang nhanh

const BACKEND = path.resolve(__dirname, '..', 'backend');
module.paths.unshift(path.join(BACKEND, 'node_modules'));

const express = require(path.join(BACKEND, 'node_modules/express'));
const helmet = require(path.join(BACKEND, 'node_modules/helmet'));
const cors = require(path.join(BACKEND, 'node_modules/cors'));

const { sequelize, User } = require(path.join(BACKEND, 'models'));
const apiRoutes = require(path.join(BACKEND, 'routes'));
const { notFoundHandler, errorHandler } = require(path.join(BACKEND, 'middleware/error.middleware'));
const chat = require(path.join(BACKEND, 'services/chat.service'));

const BASE = 'http://127.0.0.1:4200';
const results = [];
let failures = 0;

function check(label, condition, detail = '') {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  results.push(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
}

const api = async (method, url, { token, body, form, headers: extraHeaders } = {}) => {
  const headers = { ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${BASE}${url}`, { method, headers, body: payload });
  const text = await response.text();
  let parsed = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, payload: parsed, text };
};

/** Đọc vài dòng đầu của luồng SSE để kiểm tra kênh realtime. */
function readSse(url) {
  return new Promise((resolve) => {
    const chunks = [];
    const req = http.get(url, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        chunks.push(chunk);
        if (chunks.join('').includes('event: ready')) {
          req.destroy();
          resolve({ status: res.statusCode, text: chunks.join('') });
        }
      });
    });
    req.on('error', () => resolve({ status: 0, text: chunks.join('') }));
    setTimeout(() => {
      req.destroy();
      resolve({ status: 0, text: chunks.join('') });
    }, 2500);
  });
}

(async () => {
  const app = express();
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use('/api', apiRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  await sequelize.sync({ force: true });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(4200, '127.0.0.1', resolve));

  const PHOTO = path.resolve(__dirname, 'demo-images/demo-1.jpg');
  const fileBlob = (p, type) => new Blob([fs.readFileSync(p)], { type });

  try {
    /* ------------------------------- tài khoản ------------------------------ */
    const register = async (username, fullName) => {
      const res = await api('POST', '/api/auth/register', {
        body: { username, fullName, email: `${username}@congdong.local`, password: 'matkhau123' },
      });
      return res.payload.data?.token;
    };
    const ann = await register('an.nguyen', 'An Nguyễn');
    const binh = await register('binh.tran', 'Bình Trần');
    const chi = await register('chi.le', 'Chi Lê');
    check('Đăng ký 3 tài khoản công khai (không cần lời mời)', Boolean(ann && binh && chi));

    /* --------------------------- mở hội thoại ------------------------------ */
    const open = await api('POST', '/api/chat/conversations', { token: ann, body: { userId: 2 } });
    check('Mở hội thoại An → Bình', open.status === 201 && open.payload.data?.conversation?.id, `HTTP ${open.status}`);
    const conversationId = open.payload.data?.conversation?.id;
    check(
      'Người lạ nhắn trước → tin nhắn CHỜ (requested)',
      open.payload.data?.conversation?.status === 'requested',
      `status=${open.payload.data?.conversation?.status}`
    );

    const reopen = await api('POST', '/api/chat/conversations', { token: ann, body: { userId: 2 } });
    check(
      'Mở lại đúng hội thoại cũ (mỗi cặp chỉ có 1 hội thoại)',
      reopen.status === 200 && reopen.payload.data?.conversation?.id === conversationId && reopen.payload.data?.created === false
    );
    const reopenReversed = await api('POST', '/api/chat/conversations', { token: binh, body: { userId: 1 } });
    check('Mở từ phía người kia cũng ra đúng hội thoại đó', reopenReversed.payload.data?.conversation?.id === conversationId);

    const self = await api('POST', '/api/chat/conversations', { token: ann, body: { userId: 1 } });
    check('Không thể tự nhắn tin cho chính mình', self.status === 400, `HTTP ${self.status}`);
    const missing = await api('POST', '/api/chat/conversations', { token: ann, body: { userId: 9999 } });
    check('Báo lỗi khi người nhận không tồn tại', missing.status === 404, `HTTP ${missing.status}`);

    /* ------------------------------ gửi tin -------------------------------- */
    const first = await api('POST', `/api/chat/conversations/${conversationId}/messages`, {
      token: ann,
      body: { body: 'Chào Bình, ảnh mới của mình đẹp không?' },
    });
    check('Gửi tin nhắn chữ', first.status === 201 && first.payload.data?.message?.body, `HTTP ${first.status}`);
    check('Tin của mình được đánh dấu mine=true', first.payload.data?.message?.mine === true);

    const empty = await api('POST', `/api/chat/conversations/${conversationId}/messages`, { token: ann, body: { body: '   ' } });
    check('Tin rỗng bị từ chối', empty.status === 400, `HTTP ${empty.status}`);
    const tooLong = await api('POST', `/api/chat/conversations/${conversationId}/messages`, {
      token: ann,
      body: { body: 'x'.repeat(600) },
    });
    check(
      'Tin quá dài bị từ chối (CHAT_MAX_MESSAGE_LENGTH=500)',
      [400, 422].includes(tooLong.status),
      `HTTP ${tooLong.status}`
    );

    /* -------------------------- hộp thư 2 phía ------------------------------ */
    const annInbox = await api('GET', '/api/chat/conversations', { token: ann });
    check('An: hội thoại còn ở dạng chờ nên KHÔNG nằm trong hộp thư chính', annInbox.payload.data?.conversations?.length === 0);

    const binhRequests = await api('GET', '/api/chat/conversations?box=requests', { token: binh });
    const request = binhRequests.payload.data?.conversations?.[0];
    check('Bình thấy tin nhắn trong mục "Tin nhắn chờ"', binhRequests.payload.data?.conversations?.length === 1);
    check('Người nhận được phép Đồng ý / Từ chối', request?.canRespond === true && request?.isRequest === true);
    check('Tiêu đề tin nhắn chờ hiện trích đoạn tin cuối', /Chào Bình/.test(request?.lastMessage?.preview || ''), request?.lastMessage?.preview);
    check('Badge: số tin nhắn chờ = 1', binhRequests.payload.data?.summary?.pendingRequests === 1);

    const senderInbox = await api('GET', '/api/chat/conversations', { token: ann });
    check('Người GỬI không thấy tin của mình trong mục chờ', senderInbox.payload.data?.summary?.pendingRequests === 0);

    /* ------------------------- đồng ý tin nhắn chờ -------------------------- */
    const acceptBySender = await api('POST', `/api/chat/conversations/${conversationId}/accept`, { token: ann });
    check('Người GỬI không được tự đồng ý tin nhắn chờ', acceptBySender.status === 403, `HTTP ${acceptBySender.status}`);

    const accept = await api('POST', `/api/chat/conversations/${conversationId}/accept`, { token: binh });
    check('Người nhận đồng ý → hội thoại thành bình thường', accept.status === 200 && accept.payload.data?.status === 'accepted');

    const annInbox2 = await api('GET', '/api/chat/conversations', { token: ann });
    check('Sau khi đồng ý, hội thoại vào hộp thư cả hai', annInbox2.payload.data?.conversations?.length === 1);

    const binhInbox = await api('GET', '/api/chat/conversations', { token: binh });
    check('Bình có 1 tin chưa đọc từ An', binhInbox.payload.data?.conversations?.[0]?.unreadCount === 1);
    check('Badge tổng tin chưa đọc của Bình = 1', binhInbox.payload.data?.summary?.totalUnread === 1);

    /* ----------------------------- đã đọc / đã xem -------------------------- */
    const read = await api('POST', `/api/chat/conversations/${conversationId}/read`, { token: binh });
    check('Đánh dấu đã đọc trả về số tin vừa đọc', read.payload.data?.unread === 1, `unread=${read.payload.data?.unread}`);

    const readAgain = await api('POST', `/api/chat/conversations/${conversationId}/read`, { token: binh });
    check('Đọc lại lần hai không còn tin mới', readAgain.payload.data?.unread === 0);

    const annSeesSeen = await api('GET', `/api/chat/conversations/${conversationId}/messages`, { token: ann });
    const myMessage = annSeesSeen.payload.data?.messages?.[0];
    check('Người gửi thấy "Đã xem" sau khi người nhận đọc', myMessage?.seen === true);
    check('Tin nhắn trả về đúng thứ tự cũ → mới', myMessage?.body === 'Chào Bình, ảnh mới của mình đẹp không?');

    /* ------------------------- trả lời + chưa đọc --------------------------- */
    await api('POST', `/api/chat/conversations/${conversationId}/messages`, { token: binh, body: { body: 'Quá đẹp luôn!' } });
    const annUnread = await api('GET', '/api/chat/summary', { token: ann });
    check('Badge của An nhảy lên 1 khi Bình trả lời', annUnread.payload.data?.totalUnread === 1);
    const annInbox3 = await api('GET', '/api/chat/conversations', { token: ann });
    check('Hộp thư An hiện "Bạn: …" hay trích đoạn của người kia', /Quá đẹp/.test(annInbox3.payload.data?.conversations?.[0]?.lastMessage?.preview || ''));
    check('Trích đoạn tin cuối của Bình là của người khác (mine=false)', annInbox3.payload.data?.conversations?.[0]?.lastMessage?.mine === false);

    /* ------------------------------ phân trang ------------------------------ */
    // Tạo lịch sử trò chuyện (do hai người trong hội thoại gửi, xen kẽ nhau).
    for (const [token, text] of [
      [binh, 'tin 2'],
      [ann, 'tin 3'],
      [binh, 'tin 4'],
      [ann, 'tin 5'],
    ]) {
      await api('POST', `/api/chat/conversations/${conversationId}/messages`, { token, body: { body: text } });
    }

    const deniedSend = await api('POST', `/api/chat/conversations/${conversationId}/messages`, { token: chi, body: { body: 'xin chào' } });
    check('Người ngoài hội thoại KHÔNG gửi được tin', deniedSend.status === 403, `HTTP ${deniedSend.status}`);
    const deniedRead = await api('GET', `/api/chat/conversations/${conversationId}/messages`, { token: chi });
    check('Người ngoài hội thoại KHÔNG đọc được tin', deniedRead.status === 403, `HTTP ${deniedRead.status}`);
    const deniedDelete = await api('DELETE', `/api/chat/conversations/${conversationId}`, { token: chi });
    check('Người ngoài hội thoại KHÔNG xoá được hội thoại', deniedDelete.status === 403, `HTTP ${deniedDelete.status}`);

    const page1 = await api('GET', `/api/chat/conversations/${conversationId}/messages?limit=3`, { token: binh });
    const page1Ids = (page1.payload.data?.messages || []).map((m) => m.id);
    check('Trang đầu lấy 3 tin mới nhất (CHAT_PAGE_SIZE=3)', page1Ids.length === 3, `${page1Ids.length} tin`);
    check('Tin trong trang xếp cũ → mới', page1Ids.every((id, i) => i === 0 || id > page1Ids[i - 1]), page1Ids.join(' < '));
    check('Còn tin cũ hơn → hasMore = true', page1.payload.data?.hasMore === true);

    const page2 = await api(
      'GET',
      `/api/chat/conversations/${conversationId}/messages?limit=3&before=${page1.payload.data?.nextBefore}`,
      { token: binh }
    );
    const page2Ids = (page2.payload.data?.messages || []).map((m) => m.id);
    check(
      'Trang sau lấy đúng các tin CŨ HƠN (before=…)',
      page2Ids.length === 3 && page2Ids.every((id) => id < Math.min(...page1Ids)),
      `${page2Ids.length} tin`
    );
    check('Hết tin cũ → hasMore = false', page2.payload.data?.hasMore === false);

    const page3 = await api(
      'GET',
      `/api/chat/conversations/${conversationId}/messages?limit=3&before=${page2.payload.data?.nextBefore}`,
      { token: binh }
    );
    check('Cuộn tiếp khi đã hết tin → trang rỗng', (page3.payload.data?.messages || []).length === 0);
    const union = new Set([...page1Ids, ...page2Ids]);
    const allMessages = await api('GET', `/api/chat/conversations/${conversationId}/messages?limit=100`, { token: binh });
    check(
      'Ghép các trang phủ đủ toàn bộ tin nhắn, không trùng lặp',
      union.size === page1Ids.length + page2Ids.length && allMessages.payload.data?.messages?.length >= union.size,
      `${union.size} tin duy nhất / ${allMessages.payload.data?.messages?.length} tin trong hội thoại`
    );

    /* ------------------------ ảnh & chia sẻ bài viết ------------------------ */
    const form = new FormData();
    form.append('attachment', fileBlob(PHOTO, 'image/jpeg'), 'anh.jpg');
    form.append('body', 'Ảnh mình mới chụp nè');
    const withPhoto = await api('POST', `/api/chat/conversations/${conversationId}/messages`, { token: ann, form });
    check('Gửi ảnh trong tin nhắn', withPhoto.status === 201 && withPhoto.payload.data?.message?.attachmentType === 'image', `HTTP ${withPhoto.status}`);
    const attachmentUrl = withPhoto.payload.data?.message?.attachmentUrl || '';
    check('Ảnh trả về đúng URL /uploads/chat/<tệp>', /\/uploads\/chat\/.+\.[a-z]+$/i.test(attachmentUrl), attachmentUrl);
    const storedFile = path.join(process.env.UPLOAD_DIR, 'chat', path.basename(attachmentUrl));
    check('Tệp ảnh thật sự nằm trong uploads/chat/', fs.existsSync(storedFile), path.basename(attachmentUrl));

    const annInboxPhoto = await api('GET', '/api/chat/conversations', { token: binh });
    check(
      'Hộp thư hiện trích đoạn "📷 Ảnh" cho tin chỉ có ảnh',
      /📷/.test(annInboxPhoto.payload.data?.conversations?.[0]?.lastMessage?.preview || ''),
      annInboxPhoto.payload.data?.conversations?.[0]?.lastMessage?.preview
    );

    const badFile = new FormData();
    badFile.append('attachment', new Blob([Buffer.from('not an image')], { type: 'application/x-msdownload' }), 'virus.exe');
    const rejected = await api('POST', `/api/chat/conversations/${conversationId}/messages`, { token: ann, form: badFile });
    check('Tệp không phải ảnh/video bị từ chối', rejected.status === 400, `HTTP ${rejected.status}`);

    const post = await api('POST', '/api/posts', {
      token: ann,
      form: (() => {
        const f = new FormData();
        f.append('image', fileBlob(PHOTO, 'image/jpeg'), 'bai-viet.jpg');
        f.append('caption', 'Ảnh cho cộng đồng');
        return f;
      })(),
    });
    const postId = post.payload.data?.post?.id;
    check('Tạo bài viết để chia sẻ vào chat', Boolean(postId), `HTTP ${post.status}`);
    const shared = await api('POST', `/api/chat/conversations/${conversationId}/messages`, {
      token: ann,
      body: { body: 'Xem bài này nhé', sharedPostId: postId },
    });
    check('Chia sẻ bài viết vào hội thoại', shared.payload.data?.message?.sharedPostId === postId);
    const listAfterShare = await api('GET', `/api/chat/conversations/${conversationId}/messages?limit=1`, { token: ann });
    check('Tin chia sẻ bài viết giữ đúng sharedPostId', listAfterShare.payload.data?.messages?.[0]?.sharedPostId === postId);

    /* ------------------------------ thu hồi tin ----------------------------- */
    const lastMine = await api('POST', `/api/chat/conversations/${conversationId}/messages`, { token: ann, body: { body: 'tin này sẽ bị thu hồi' } });
    const recallId = lastMine.payload.data?.message?.id;
    const recallByOther = await api('DELETE', `/api/chat/messages/${recallId}`, { token: binh });
    check('Không thu hồi được tin của người khác', recallByOther.status === 403, `HTTP ${recallByOther.status}`);

    const recall = await api('DELETE', `/api/chat/messages/${recallId}`, { token: ann });
    check('Thu hồi tin nhắn của chính mình', recall.status === 200, `HTTP ${recall.status}`);
    const afterRecall = await api('GET', `/api/chat/conversations/${conversationId}/messages?limit=1`, { token: ann });
    check('Tin đã thu hồi: nội dung bị xoá, có cờ isDeleted', afterRecall.payload.data?.messages?.[0]?.isDeleted === true && afterRecall.payload.data?.messages?.[0]?.body === null);

    const rowInDb = await sequelize.query('SELECT body, attachment_filename FROM messages WHERE id = :id', {
      replacements: { id: recallId },
      type: sequelize.QueryTypes.SELECT,
    });
    check('Database KHÔNG còn nội dung của tin đã thu hồi', rowInDb[0]?.body === null && rowInDb[0]?.attachment_filename === null);

    /* ------------------------- ẩn hội thoại khỏi hộp thư --------------------- */
    const hide = await api('DELETE', `/api/chat/conversations/${conversationId}`, { token: binh });
    check('Xoá hội thoại khỏi hộp thư (chỉ phía mình)', hide.status === 200);
    const binhAfterHide = await api('GET', '/api/chat/conversations', { token: binh });
    check('Hội thoại đã biến mất khỏi hộp thư của Bình', binhAfterHide.payload.data?.conversations?.length === 0);
    const annStillThere = await api('GET', '/api/chat/conversations', { token: ann });
    check('Hộp thư của An KHÔNG bị ảnh hưởng', annStillThere.payload.data?.conversations?.length === 1);

    await api('POST', `/api/chat/conversations/${conversationId}/messages`, { token: ann, body: { body: 'tin mới làm hội thoại hiện lại' } });
    const binhAfterNew = await api('GET', '/api/chat/conversations', { token: binh });
    check('Tin mới làm hội thoại hiện lại trong hộp thư', binhAfterNew.payload.data?.conversations?.length === 1);

    /* -------------------------------- từ chối ------------------------------- */
    const stranger = await api('POST', '/api/chat/messages', { token: ann, body: { toUserId: 3, body: 'Xin chào Chi!' } });
    check('Gửi nhanh bằng toUserId (không cần id hội thoại)', stranger.status === 201, `HTTP ${stranger.status}`);
    const chiRequests = await api('GET', '/api/chat/conversations?box=requests', { token: chi });
    const chiConversationId = chiRequests.payload.data?.conversations?.[0]?.id;
    check('Chi nhận được tin nhắn chờ', Boolean(chiConversationId));
    const decline = await api('POST', `/api/chat/conversations/${chiConversationId}/decline`, { token: chi });
    check('Chi từ chối tin nhắn chờ', decline.payload.data?.status === 'declined');
    const sendAfterDecline = await api('POST', `/api/chat/conversations/${chiConversationId}/messages`, { token: ann, body: { body: 'nhắn tiếp' } });
    check('Không nhắn tiếp được sau khi bị từ chối', sendAfterDecline.status === 403, `HTTP ${sendAfterDecline.status}`);

    /* ---------------------------- tìm người để nhắn -------------------------- */
    const people = await api('GET', '/api/chat/people?q=binh', { token: ann });
    check('Tìm người để nhắn tin theo username', people.status === 200 && people.payload.data?.people?.length === 1, `HTTP ${people.status}`);
    check('Kết quả tìm người có username đúng', people.payload.data?.people?.[0]?.username === 'binh.tran');
    check('Kèm sẵn id hội thoại đã có', people.payload.data?.people?.[0]?.conversationId === conversationId);
    check('Hồ sơ tìm được có fullName + avatarUrl (đúng chuẩn dự án)', 'fullName' in (people.payload.data?.people?.[0] || {}) && 'avatarUrl' in (people.payload.data?.people?.[0] || {}));
    const peopleByFullName = await api('GET', '/api/chat/people?q=Trần', { token: ann });
    check('Tìm được theo tên hiển thị (có dấu tiếng Việt)', peopleByFullName.payload.data?.people?.length === 1, `HTTP ${peopleByFullName.status}`);
    const peopleNoSelf = await api('GET', '/api/chat/people', { token: ann });
    check('Danh sách người KHÔNG chứa chính mình', peopleNoSelf.status === 200 && !peopleNoSelf.payload.data?.people?.some((p) => p.id === 1));
    const peopleEmpty = await api('GET', '/api/chat/people?q=khong-co-ai-ten-nay', { token: ann });
    check('Tìm không thấy ai → danh sách rỗng', peopleEmpty.status === 200 && peopleEmpty.payload.data?.people?.length === 0, `HTTP ${peopleEmpty.status}`);

    /* --------------------------- dịch lỗi theo ngôn ngữ ---------------------- */
    const enError = await api('POST', `/api/chat/conversations/${conversationId}/messages`, {
      token: ann,
      body: {},
      headers: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    check('Thông báo lỗi chat dịch theo Accept-Language', /needs text|photo/i.test(enError.payload?.message || ''), enError.payload?.message);

    /* ------------------------------- realtime -------------------------------- */
    const sse = await readSse(`${BASE}/api/chat/stream?token=${encodeURIComponent(binh)}`);
    check('Kênh SSE mở được và gửi sự kiện "ready"', sse.status === 200 && sse.text.includes('event: ready'), `HTTP ${sse.status}`);
    const sseNoAuth = await api('GET', '/api/chat/stream');
    check('SSE yêu cầu đăng nhập khi thiếu token', sseNoAuth.status === 401, `HTTP ${sseNoAuth.status}`);

    const realtime = require(path.join(BACKEND, 'services/realtime.service'));
    const before = realtime.stats().connections;
    const probe = new Promise((resolve) => {
      const entry = realtime.openStream(
        { writeHead() {}, write() {}, end() {}, flushHeaders() {} },
        99
      );
      resolve(entry);
    });
    await probe;
    check('Hub realtime theo dõi được kết nối (dùng cho /api/health)', realtime.stats().connections === before + 1);

    /* ------------------------- đếm chưa đọc chính xác ------------------------ */
    const summaryBefore = await api('GET', '/api/chat/summary', { token: ann });
    const previewBefore = summaryBefore.payload.data?.totalUnread;
    await api('POST', `/api/chat/conversations/${conversationId}/messages`, { token: binh, body: { body: 'Bình nhắn thêm' } });
    const summaryAfter = await api('GET', '/api/chat/summary', { token: ann });
    check('Tin mới làm tăng đúng 1 đơn vị chưa đọc', summaryAfter.payload.data?.totalUnread === previewBefore + 1, `${previewBefore} → ${summaryAfter.payload.data?.totalUnread}`);

    /* --------------------------- dữ liệu liên quan --------------------------- */
    const messagesInDb = await sequelize.query('SELECT COUNT(*) AS total FROM messages', {
      type: sequelize.QueryTypes.SELECT,
    });
    check('Bảng messages có dữ liệu thật (SQLite)', Number(messagesInDb[0]?.total) > 5, `${messagesInDb[0]?.total} tin`);
    const conversationsInDb = await sequelize.query('SELECT COUNT(*) AS total FROM conversations', {
      type: sequelize.QueryTypes.SELECT,
    });
    check('Số hội thoại = số cặp người dùng đã nhắn (2)', Number(conversationsInDb[0]?.total) === 2, `${conversationsInDb[0]?.total} hội thoại`);

    const unreadDirect = await chat.unreadSummary(1);
    check('Hàm unreadSummary dùng được trực tiếp (không cần HTTP)', typeof unreadDirect.totalUnread === 'number', `tổng=${unreadDirect.totalUnread}`);
  } catch (error) {
    failures += 1;
    results.push(`❌ Lỗi không mong đợi: ${error.stack?.split('\n').slice(0, 4).join('\n    ')}`);
  } finally {
    server.close();
    await sequelize.close().catch(() => {});
    fs.rmSync(TMP, { recursive: true, force: true });
  }

  /* --------------------------------- kết quả -------------------------------- */
  console.log('\n💬  Kiểm thử chat (API thật + SQLite)\n');
  results.forEach((line) => console.log(`   ${line}`));
  const passed = results.length - failures;
  console.log(`\n   ${failures === 0 ? '🎉' : '⚠️ '} ${passed}/${results.length} đạt · ${failures} hỏng\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
