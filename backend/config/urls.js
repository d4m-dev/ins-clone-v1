'use strict';

/**
 * config/urls.js  (BACKEND)
 * ---------------------------------------------------------------------------
 * THE single place where every URL / route path lives.
 * Controllers, services and the Telegram bot import from here — they must
 * NEVER build a URL with a literal string.
 *
 *   const urls = require('../config/urls');
 *   urls.uploads.absolute('abc123.jpg')  ->  https://api.d4mdev.click/uploads/abc123.jpg
 * ---------------------------------------------------------------------------
 */

const { env } = require('./env');

const BASE = env.urls.publicBaseUrl; // https://api.d4mdev.click
const FRONTEND = env.urls.frontendBaseUrl; // https://ins-clone-v1.vercel.app

const API_PREFIX = '/api';

const join = (...parts) =>
  parts
    .filter((part) => part !== undefined && part !== null && part !== '')
    .map((part, index) => (index === 0 ? String(part).replace(/\/+$/, '') : String(part).replace(/^\/+|\/+$/g, '')))
    .join('/');

const urls = {
  /** Origin of the API itself (Cloudflare Tunnel hostname). */
  base: BASE,
  frontendBase: FRONTEND,

  /** Local bindings — used by server.js for logging & health checks. */
  local: {
    base: `http://127.0.0.1:${env.server.port}`,
  },

  /** Route prefixes (mounted in routes/index.js). */
  prefix: {
    api: API_PREFIX,
    uploads: '/uploads',
    admin: '/admin',
    adminAssets: '/admin/assets',
  },

  /** Absolute API endpoints — handy for the Telegram bot & docs. */
  api: {
    base: join(BASE, API_PREFIX),
    health: join(BASE, API_PREFIX, 'health'),
    auth: {
      register: join(BASE, API_PREFIX, 'auth/register'),
      login: join(BASE, API_PREFIX, 'auth/login'),
      me: join(BASE, API_PREFIX, 'auth/me'),
    },
    posts: {
      list: join(BASE, API_PREFIX, 'posts'),
      create: join(BASE, API_PREFIX, 'posts'),
      byId: (id) => join(BASE, API_PREFIX, 'posts', id),
      like: (id) => join(BASE, API_PREFIX, 'posts', id, 'likes'),
      comments: (id) => join(BASE, API_PREFIX, 'posts', id, 'comments'),
      views: (id) => join(BASE, API_PREFIX, 'posts', id, 'views'),
      download: (id) => join(BASE, API_PREFIX, 'posts', id, 'download'),
    },
    /** Reels — dòng video dọc. */
    reels: {
      list: join(BASE, API_PREFIX, 'reels'),
      byId: (id) => join(BASE, API_PREFIX, 'reels', id),
    },
    /** Khoảnh khắc 24 giờ (Stories). */
    stories: {
      list: join(BASE, API_PREFIX, 'stories'),
    },
    users: {
      byId: (id) => join(BASE, API_PREFIX, 'users', id),
      posts: (id) => join(BASE, API_PREFIX, 'users', id, 'posts'),
    },
    /** Chat 1-1 (kiểu Instagram Direct). */
    chat: {
      conversations: join(BASE, API_PREFIX, 'chat/conversations'),
      conversation: (id) => join(BASE, API_PREFIX, 'chat/conversations', id),
      messages: (id) => join(BASE, API_PREFIX, 'chat/conversations', id, 'messages'),
      read: (id) => join(BASE, API_PREFIX, 'chat/conversations', id, 'read'),
      accept: (id) => join(BASE, API_PREFIX, 'chat/conversations', id, 'accept'),
      decline: (id) => join(BASE, API_PREFIX, 'chat/conversations', id, 'decline'),
      message: (id) => join(BASE, API_PREFIX, 'chat/messages', id),
      summary: join(BASE, API_PREFIX, 'chat/summary'),
      people: join(BASE, API_PREFIX, 'chat/people'),
    },
  },

  /**
   * Phục vụ tệp tĩnh (express.static trên UPLOAD_ROOT).
   *
   * ⚠️ QUAN TRỌNG: tệp nằm trong thư mục con (`posts/`, `avatars/`) nên URL
   * BẮT BUỘC kèm thư mục — /uploads/posts/<tệp>, /uploads/avatars/<tệp>.
   * `folder` được truyền tường minh để không bao giờ sinh ra URL 404.
   */
  uploads: {
    /** Route prefix, e.g. /uploads — mount it with this exact value. */
    route: '/uploads',
    /** Absolute base, e.g. https://api.d4mdev.click/uploads */
    base: join(BASE, '/uploads'),
    folders: { posts: 'posts', avatars: 'avatars', chat: 'chat' },
    /** filename + thư mục -> URL tuyệt đối */
    absolute: (filename, folder = 'posts') => (filename ? join(BASE, '/uploads', folder, filename) : null),
    /** filename + thư mục -> đường dẫn cùng origin (dùng khi cần relative) */
    relative: (filename, folder = 'posts') => (filename ? join('/uploads', folder, filename) : null),
    /** Tiện dụng cho hai thư mục đang dùng */
    post: (filename) => (filename ? join(BASE, '/uploads', 'posts', filename) : null),
    avatar: (filename) => (filename ? join(BASE, '/uploads', 'avatars', filename) : null),
    relativePost: (filename) => (filename ? join('/uploads', 'posts', filename) : null),
    relativeAvatar: (filename) => (filename ? join('/uploads', 'avatars', filename) : null),

    /** Ảnh/video gửi trong tin nhắn: /uploads/chat/<tệp> */
    chat: {
      file: (filename) => (filename ? join(BASE, '/uploads', 'chat', filename) : null),
      relative: (filename) => (filename ? join('/uploads', 'chat', filename) : null),
    },
  },

  /**
   * Đường dẫn phía FRONTEND — dùng để dựng liên kết trong email (mời thành viên,
   * đặt lại mật khẩu). PHẢI khớp với ROUTES trong frontend/config/urls.js.
   */
  routes: {
    home: '/',
    login: '/login',
    register: '/register',
    resetPassword: '/reset-password',
    post: (id) => `/p/${id}`,
    profile: (username) => `/u/${username}`,
    messages: '/messages',
    conversation: (id) => `/messages/${id}`,
  },

  /** AdminJS dashboard + its static assets (custom CSS lives here). */
  admin: {
    dashboard: join(BASE, '/admin'),
    customCss: join(BASE, '/admin', 'assets', 'custom-admin.css'),
    customCssRoute: '/admin/assets/custom-admin.css',
  },

  /** Frontend deep links used by Telegram notifications. */
  frontend: {
    base: FRONTEND,
    home: join(FRONTEND, '/'),
    login: join(FRONTEND, '/login'),
    post: (id) => join(FRONTEND, '/p', id),
    profile: (username) => join(FRONTEND, `/u/${username}`),
    messages: join(FRONTEND, '/messages'),
    conversation: (id) => join(FRONTEND, '/messages', id),
  },
};

module.exports = urls;
