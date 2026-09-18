'use strict';

/**
 * admin/adminjs.config.js
 * ---------------------------------------------------------------------------
 * AdminJS (v7) is mounted INSIDE the Express app at /admin — no PHP, no
 * separate process. It provides full CRUD over Users / Posts / Comments /
 * Likes, plus the "ultimate privilege" to delete any post or user.
 *
 * Custom CSS injection
 *   AdminJS ships `assets.styles: []` (documented since v6.4). The file is
 *   served by our own express.static mount at /admin/assets, which keeps the
 *   uploads directory and the admin assets completely separate.
 * ---------------------------------------------------------------------------
 */

const path = require('path');
const express = require('express');
const AdminJS = require('adminjs');
const AdminJSExpress = require('@adminjs/express');
const AdminJSSequelize = require('@adminjs/sequelize');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.session);
const bcrypt = require('bcryptjs');
const { timingSafeEqual } = require('crypto');

const { env } = require('../config/env');
const urls = require('../config/urls');
const logger = require('../utils/logger');
const { sequelize, User, Post, Comment, Like } = require('../models');
const { buildAdminLocale } = require('./locales');

AdminJS.registerAdapter({ Database: AdminJSSequelize.Database, Resource: AdminJSSequelize.Resource });

/** Directory holding the CSS AdminJS will be told about. */
const PUBLIC_DIR = path.join(__dirname, 'public');

/** Route (relative to the app root) that serves PUBLIC_DIR. */
const ASSETS_ROUTE = urls.prefix.adminAssets; // '/admin/assets'

/* -------------------------------------------------------------------------- */
/*                        Resource customisations                            */
/* -------------------------------------------------------------------------- */

const userResource = {
  resource: User,
  options: {
    navigation: { name: 'Gia đình', icon: 'User' },
    listProperties: ['id', 'username', 'fullName', 'email', 'role', 'locale', 'isActive', 'createdAt'],
    showProperties: ['id', 'username', 'fullName', 'email', 'role', 'locale', 'avatarUrl', 'bio', 'isActive', 'lastLoginAt', 'createdAt'],
    editProperties: ['fullName', 'email', 'role', 'locale', 'isActive', 'bio'],
    filterProperties: ['username', 'email', 'role', 'isActive', 'createdAt'],
    properties: {
      // Nhãn tiếng Việt cho từng trường. Phần khung giao diện (nút, thông báo…)
      // do admin/locales/adminjs.vi.json phủ 103/103 khoá — xem README §4b.
      username: { label: 'Tên đăng nhập' },
      fullName: { label: 'Họ và tên' },
      email: { label: 'Email' },
      isActive: { label: 'Đang hoạt động' },
      lastLoginAt: { label: 'Đăng nhập lần cuối' },
      createdAt: { label: 'Ngày tạo' },
      password: {
        label: 'Mật khẩu',
        isVisible: { list: false, show: false, edit: false, filter: false },
        // Người dùng tạo từ trang quản trị phải có mật khẩu; model hook sẽ băm
        // mật khẩu trước khi ghi xuống database.
        type: 'password',
      },
      role: {
        label: 'Vai trò',
        availableValues: [
          { value: 'member', label: 'Thành viên' },
          { value: 'admin', label: 'Quản trị viên' },
        ],
      },
      /** Ngôn ngữ của thành viên — quyết định tiếng của thông báo Telegram. */
      locale: {
        label: 'Language / Ngôn ngữ',
        availableValues: [
          { value: 'vi', label: '🇻🇳 Tiếng Việt' },
          { value: 'en', label: '🇬🇧 English' },
          { value: 'zh', label: '🇨🇳 中文' },
        ],
      },
      avatarUrl: { label: 'Tên file ảnh đại diện' },
      bio: { label: 'Giới thiệu', type: 'textarea' },
    },
    actions: {
      /** Creating users from AdminJS: same hashing rules as the API. */
      new: {
        before: async (request) => {
          if (request.payload && !request.payload.password) {
            throw new Error('Bắt buộc nhập mật khẩu khi tạo thành viên mới.');
          }
          return request;
        },
      },
      /** Only a full admin may hard-delete a family member (cascades posts). */
      delete: {
        isAccessible: ({ currentAdmin }) => currentAdmin?.role === 'admin',
      },
    },
  },
};

const postResource = {
  resource: Post,
  options: {
    navigation: { name: 'Gia đình', icon: 'Image' },
    listProperties: ['id', 'imageFilename', 'mediaType', 'caption', 'userId', 'likeCount', 'commentCount', 'viewCount', 'isArchived', 'createdAt'],
    showProperties: ['id', 'imageFilename', 'mediaType', 'videoFilename', 'durationSeconds', 'audioTitle', 'mimeType', 'sizeBytes', 'caption', 'location', 'userId', 'likeCount', 'commentCount', 'viewCount', 'isArchived', 'createdAt'],
    editProperties: ['caption', 'location', 'isArchived'],
    filterProperties: ['mediaType', 'caption', 'userId', 'isArchived', 'createdAt'],
    properties: {
      caption: { label: 'Chú thích', type: 'textarea' },
      location: { label: 'Địa điểm' },
      userId: { label: 'Mã thành viên' },
      mimeType: { label: 'Định dạng' },
      sizeBytes: { label: 'Dung lượng (byte)' },
      isArchived: { label: 'Đã ẩn khỏi album' },
      createdAt: { label: 'Ngày đăng' },
      imageFilename: {
        label: 'Ảnh',
        // Renders the actual picture inside the dashboard (served by /uploads).
        type: 'string',
        isVisible: { list: true, show: true, edit: false, filter: false },
      },
      likeCount: { label: 'Lượt thích', isVisible: { list: true, show: true, edit: false, filter: false } },
      commentCount: { label: 'Bình luận', isVisible: { list: true, show: true, edit: false, filter: false } },
      /** Các trường của tính năng Reels (xem README §5). */
      mediaType: {
        label: 'Loại nội dung',
        availableValues: [
          { value: 'photo', label: 'Ảnh' },
          { value: 'video', label: 'Video (Reels)' },
        ],
        isVisible: { list: true, show: true, edit: false, filter: true },
      },
      videoFilename: {
        label: 'Tệp video',
        isVisible: { list: false, show: true, edit: false, filter: false },
      },
      durationSeconds: {
        label: 'Thời lượng (giây)',
        isVisible: { list: false, show: true, edit: false, filter: false },
      },
      audioTitle: {
        label: 'Tên nhạc nền',
        isVisible: { list: false, show: true, edit: false, filter: false },
      },
      viewCount: {
        label: 'Lượt xem',
        isVisible: { list: true, show: true, edit: false, filter: false },
      },
    },
    actions: {
      /**
       * Không cho tạo Post từ dashboard: mỗi bài viết phải gắn với một tệp ảnh
       * thật trong uploads/ (do app React tải lên). Tạo tay ở đây sẽ sinh bản ghi
       * trỏ tới file không tồn tại → ảnh vỡ trong album.
       */
      new: { isAccessible: false },
      list: {
        after: async (response) => {
          // Inject a clickable thumbnail next to every filename.
          response.records = response.records.map((record) => {
            const filename = record.params.imageFilename;
            if (filename) {
              record.params.imageFilename = `${urls.uploads.post(filename)}`;
            }
            return record;
          });
          return response;
        },
      },
      /** AdminJS admins can delete ANY post — the ultimate privilege. */
      delete: {
        isAccessible: () => true,
        after: async (response) => {
          logger.warn(`Quản trị viên đã xoá ảnh #${response.record?.params?.id} qua AdminJS.`);
          return response;
        },
      },
    },
  },
};

const commentResource = {
  resource: Comment,
  options: {
    navigation: { name: 'Tương tác', icon: 'Chat' },
    listProperties: ['id', 'postId', 'userId', 'body', 'createdAt'],
    editProperties: ['body'],
    properties: {
      body: { label: 'Nội dung' },
      postId: { label: 'Mã ảnh' },
      userId: { label: 'Mã thành viên' },
      createdAt: { label: 'Thời điểm' },
    },
    actions: { new: { isAccessible: false } },
  },
};

const likeResource = {
  resource: Like,
  options: {
    navigation: { name: 'Tương tác', icon: 'Heart' },
    listProperties: ['id', 'postId', 'userId', 'createdAt'],
    properties: {
      postId: { label: 'Mã ảnh' },
      userId: { label: 'Mã thành viên' },
      createdAt: { label: 'Thời điểm' },
    },
    actions: { new: { isAccessible: false }, edit: { isAccessible: false } },
  },
};

/* -------------------------------------------------------------------------- */
/*                             AdminJS instance                              */
/* -------------------------------------------------------------------------- */

/** Credential check driven exclusively by .env values. */
async function authenticateAdmin(email, password) {
  if (!email || !password) return null;
  if (String(email).trim().toLowerCase() !== env.admin.email.toLowerCase()) {
    // Still spend time so that a wrong e-mail is not measurably faster.
    await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
    return null;
  }

  if (env.admin.passwordHash) {
    const ok = await bcrypt.compare(password, env.admin.passwordHash);
    return ok ? { email: env.admin.email, role: 'admin' } : null;
  }

  const expected = Buffer.from(env.admin.passwordFallback || '');
  const provided = Buffer.from(password);
  if (expected.length !== provided.length) return null;
  return timingSafeEqual(expected, provided) ? { email: env.admin.email, role: 'admin' } : null;
}

const adminJsOptions = {
  rootPath: urls.prefix.admin, // '/admin'
  loginPath: `${urls.prefix.admin}/login`,
  logoutPath: `${urls.prefix.admin}/logout`,

  branding: {
    companyName: 'Quản trị FamilyGram',
    withMadeWithLove: false,
    theme: {
      colors: {
        primary100: '#c13584', // Instagram-ish gradient accent
        primary80: '#e1306c',
        accent: '#e1306c',
        love: '#e1306c',
      },
    },
  },

  /**
   * ⬇⬇⬇  CUSTOM CSS INJECTION  ⬇⬇⬇
   * AdminJS appends <link rel="stylesheet" href="/admin/assets/custom-admin.css">
   * to the dashboard HTML. The file itself is plain CSS (no build step), so it
   * can be edited on a phone with nano and reloaded with a browser refresh.
   */
  assets: {
    styles: [`${ASSETS_ROUTE}/custom-admin.css`],
  },

  dashboard: {
    component: undefined, // default dashboard
    handler: async () => {
      const [users, posts, comments, likes] = await Promise.all([
        User.count(),
        Post.count(),
        Comment.count(),
        Like.count(),
      ]);
      return { users, posts, comments, likes, apiBase: urls.api.base };
    },
  },

  resources: [userResource, postResource, commentResource, likeResource],

  /**
   * ⬇⬇⬇  VIỆT HOÁ TOÀN BỘ KHUNG GIAO DIỆN  ⬇⬇⬇
   * AdminJS v7 KHÔNG có gói tiếng Việt (chỉ de/en/es/it/ja/pl/pt-BR/ua/zh-CN),
   * nên admin/locales/adminjs.vi.json cung cấp đủ 7 nhóm khoá:
   * actions · buttons · labels · properties · resources · components · messages
   * → nút Lưu/Huỷ/Xoá, bộ lọc, thông báo, trang đăng nhập, kéo–thả tệp… đều tiếng Việt.
   * Người dùng còn đổi được sang English / 中文 ngay trên thanh trên (nút 🌐),
   * lựa chọn được ghi nhớ qua `localeDetection`.
   */
  locale: buildAdminLocale({
    language: env.admin.locale,
    availableLanguages: env.admin.availableLocales,
  }),
};

const admin = new AdminJS(adminJsOptions);

/**
 * Builds the authenticated router (session-based login form) that server.js
 * mounts at `/admin`.
 */
function buildAdminRouter(app) {
  const sessionStore = new SequelizeStore({
    db: sequelize,
    tableName: 'admin_sessions',
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: env.admin.sessionMaxAgeMs,
  });

  const router = AdminJSExpress.buildAuthenticatedRouter(
    admin,
    {
      authenticate: authenticateAdmin,
      cookieName: env.admin.cookieName,
      cookiePassword: env.admin.sessionSecret,
    },
    null,
    {
      store: sessionStore,
      secret: env.admin.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        // Cloudflare terminates TLS, so we still need secure cookies in prod.
        secure: env.isProd,
        maxAge: env.admin.sessionMaxAgeMs,
      },
      name: env.admin.cookieName,
    }
  );

  // Static assets for the dashboard, mounted BEFORE the AdminJS router.
  app.use(
    ASSETS_ROUTE,
    express.static(PUBLIC_DIR, {
      index: false,
      dotfiles: 'deny',
      maxAge: '1h',
      setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
    })
  );

  // First request creates the session table (and any missing tables).
  sessionStore.sync().catch((error) => logger.warn(`AdminJS session sync failed: ${error.message}`));

  logger.success(
    `AdminJS ready → ${urls.admin.dashboard} ` +
      `(ngôn ngữ: ${env.admin.locale} · bản dịch: ${env.admin.availableLocales.join(', ')} · ` +
      `custom CSS: ${urls.admin.customCssRoute})`
  );

  return router;
}

module.exports = { admin, buildAdminRouter, adminJsOptions, ASSETS_ROUTE, PUBLIC_DIR, authenticateAdmin };
