#!/usr/bin/env node
'use strict';

/**
 * tools/demo-api.js  —  DEV-ONLY preview harness (NOT part of production)
 * ===========================================================================
 * A dependency-free mock of the FamilyGram REST API so the React UI can be
 * previewed on a laptop/desktop *without* Termux, MariaDB or the tunnel.
 * It implements the exact same response contract as the real backend
 * (`{ success, data: { … } }`) and serves the demo photos/video from ./demo-images.
 * Hỗ trợ đầy đủ Reels (video dọc), Stories 24h, lượt xem và tải tệp về.
 *
 *   node tools/demo-api.js            # listens on :4000
 *   PORT=5000 node tools/demo-api.js
 *
 * Login with any password. Accounts:
 *   minh.nguyen (admin) · linh.tran · ba.noi · me.su
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
  { id: 1, username: 'minh.nguyen', fullName: 'Minh Nguyễn', role: 'admin', locale: 'vi', avatarUrl: null, bio: 'Giữ ảnh cho cả nhà 📷', createdAt: daysAgo(420) },
  { id: 2, username: 'linh.tran', fullName: 'Linh Trần', role: 'member', locale: 'vi', avatarUrl: null, bio: 'Mẹ của hai đứa nhỏ', createdAt: daysAgo(410) },
  { id: 3, username: 'ba.noi', fullName: 'Ông Bà Nội', role: 'member', locale: 'vi', avatarUrl: null, bio: 'Gia Lai', createdAt: daysAgo(400) },
  { id: 4, username: 'me.su', fullName: 'Mẹ Su', role: 'member', locale: 'en', avatarUrl: null, bio: 'Sunrise person 🌅', createdAt: daysAgo(300) },
];

let nextPostId = 7;
const posts = [
  { id: 1, userId: 1, imageFilename: 'demo-1.jpg', caption: 'Sunday dinner on the roof — bà nấu canh chua 🍲', location: 'Chư Ty, Gia Lai', likeCount: 12, commentCount: 3, createdAt: hoursAgo(5) },
  { id: 2, userId: 2, imageFilename: 'demo-2.jpg', caption: 'Mưa đầu mùa và hai đứa nhỏ 🤍', location: 'Gia Lai', likeCount: 8, commentCount: 2, createdAt: hoursAgo(26) },
  { id: 3, userId: 3, imageFilename: 'demo-3.jpg', caption: 'Bánh chưng for Tết, as every year.', location: null, likeCount: 21, commentCount: 4, createdAt: hoursAgo(50) },
  { id: 4, userId: 4, imageFilename: 'demo-4.jpg', caption: 'Sunrise walk before the boat left 🌅', location: 'Quy Nhơn', likeCount: 15, commentCount: 1, createdAt: hoursAgo(72) },
  { id: 5, userId: 4, imageFilename: 'demo-1.jpg', caption: 'Rooftop again — this time with a birthday cake 🎂', location: 'Chư Ty', likeCount: 9, commentCount: 1, createdAt: hoursAgo(96) },
  { id: 6, userId: 2, imageFilename: 'demo-4.jpg', caption: 'Same beach, one year later 🌊', location: 'Quy Nhơn', likeCount: 17, commentCount: 2, createdAt: hoursAgo(140) },

  // ---- Video cho Reels (mediaType: 'video') ----
  {
    id: 7, userId: 1, mediaType: 'video',
    imageFilename: 'demo-2.jpg', videoFilename: 'demo-clip.mp4',
    durationSeconds: 5.76, viewCount: 34,
    caption: 'Hai đứa nhỏ chơi mưa — quay bằng điện thoại 🎬', location: 'Chư Ty, Gia Lai',
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
  { id: 1, postId: 1, userId: 2, body: 'Ngon quá! Lần sau cho con xin suất 😋', createdAt: hoursAgo(4) },
  { id: 2, postId: 1, userId: 3, body: 'Cháu về ăn cơm với bà nhé.', createdAt: hoursAgo(3) },
  { id: 3, postId: 1, userId: 4, body: 'View đẹp thật 🌇', createdAt: hoursAgo(2) },
  { id: 4, postId: 2, userId: 1, body: 'Tắm mưa xong nhớ thay đồ nha hai đứa.', createdAt: hoursAgo(25) },
  { id: 5, postId: 2, userId: 4, body: 'Dễ thương quá 🥰', createdAt: hoursAgo(24) },
  { id: 6, postId: 3, userId: 1, body: 'Mùi Tết luôn 🎋', createdAt: hoursAgo(49) },
  { id: 7, postId: 4, userId: 2, body: 'Bình minh đẹp mê.', createdAt: hoursAgo(70) },
];

const likes = new Set(['1:2', '1:3', '1:4', '2:1', '3:1', '3:4', '4:1', '6:1']);
const tokens = new Map(); // token -> userId
const uploads = new Map(); // filename -> Buffer
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
      appName: 'FamilyGram',
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
      'Content-Disposition': `attachment; filename="familygram-${owner}-${post.id}-${date}${extension}"`,
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(buffer);
  }

  if (pathname === '/api/health') {
    return ok(res, { status: 'ok', env: 'demo', apiBase: `${PUBLIC_BASE}/api`, timestamp: new Date().toISOString() });
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
  console.log(`\n  FamilyGram DEMO API  →  http://127.0.0.1:${PORT}`);
  console.log('  Users: minh.nguyen · linh.tran · ba.noi · me.su   (any password)');
  console.log('  Routes: /api/reels · /api/stories · /api/posts/:id/views · /api/posts/:id/download\n');
});
