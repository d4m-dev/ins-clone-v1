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
// `adminjs` (lõi) nạp được bằng require(), NHƯNG kết quả là một namespace:
// lớp thật nằm ở `module.AdminJS` (hoặc `module.default`). Nếu dùng thẳng
// namespace thì `AdminJS.registerAdapter` là undefined —
// "TypeError: AdminJS.registerAdapter is not a function".
const AdminJSModule = require('adminjs');
const AdminJS = AdminJSModule.AdminJS ?? AdminJSModule.default ?? AdminJSModule;
if (typeof AdminJS?.registerAdapter !== 'function') {
  // Sai hình dạng export ⇒ nói thẳng ra thay vì chết mơ hồ ở giữa chừng.
  throw new Error(
    'Không tìm thấy lớp AdminJS (cần adminjs >= 7). Hãy chạy: cd backend && npm install'
  );
}
// ⚠️ BẪY ESM — ghi lại để không ai sửa nhầm:
// @adminjs/express và @adminjs/sequelize được phát hành dạng "type": "module"
// và package.json của chúng CHỈ khai báo điều kiện "import" (không có "require").
// Vì vậy `require('@adminjs/express')` ném ERR_PACKAGE_PATH_NOT_EXPORTED —
// đúng cả với mọi bản 6.x/4.x hiện có. Bắt buộc nạp bằng import() động:
// xem loadAdminPlugins() bên dưới.
const session = require('express-session');
// connect-session-sequelize cần LỚP Store của express-session.
// (Đã từng viết nhầm `session.session` → TypeError: Class extends value
// undefined… ngay khi khởi động. Đúng phải là `session.Store`.)
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const bcrypt = require('bcryptjs');
const { timingSafeEqual } = require('crypto');

const { env } = require('../config/env');
const urls = require('../config/urls');
const logger = require('../utils/logger');
const { sequelize, User, Post, Comment, Like, Invite } = require('../models');
const { buildAdminLocale } = require('./locales');

/* -------------------------------------------------------------------------- */
/*              Nạp plugin ESM (chỉ một lần, nhớ kết quả vào cache)          */
/* -------------------------------------------------------------------------- */

let pluginsPromise = null;

/**
 * Nạp @adminjs/express + @adminjs/sequelize bằng import() động rồi đăng ký
 * adapter Sequelize. Gọi bao nhiêu lần cũng chỉ chạy thật một lần.
 */
function loadAdminPlugins() {
  if (!pluginsPromise) {
    pluginsPromise = (async () => {
      const [expressModule, sequelizeModule] = await Promise.all([
        import('@adminjs/express'),
        import('@adminjs/sequelize'),
      ]);
      // Gói ESM: lớp thật nằm ở `default`; vẫn chấp nhận namespace trực tiếp
      // để không vỡ nếu bản phát hành sau này đổi cách xuất.
      const AdminJSExpress = expressModule.default ?? expressModule;
      const AdminJSSequelize = sequelizeModule.default ?? sequelizeModule;

      AdminJS.registerAdapter({
        Database: AdminJSSequelize.Database,
        Resource: AdminJSSequelize.Resource,
      });

      logger.debug('Đã nạp @adminjs/express + @adminjs/sequelize (ESM động) và đăng ký adapter Sequelize');
      return { AdminJSExpress, AdminJSSequelize };
    })().catch((error) => {
      pluginsPromise = null; // cho phép thử lại ở lần khởi động sau
      throw error;
    });
  }
  return pluginsPromise;
}

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
/* -------------------------------------------------------------------------- */
/*                    🎟️  Lời mời thành viên (bảng invites)                  */
/* -------------------------------------------------------------------------- */

/**
 * Lời mời là dữ liệu quản trị: xem hạn dùng, ai mời, đã dùng hay chưa.
 * `tokenHash` bị ẩn tuyệt đối — kể cả quản trị viên cũng không cần thấy, và
 * AdminJS không được phép SỬA bản ghi (sửa tay có thể phá tính một-lần).
 */
const inviteResource = {
  resource: Invite,
  options: {
    navigation: { name: 'Gia đình', icon: 'Mail' },
    listProperties: ['id', 'email', 'role', 'status', 'invitedById', 'expiresAt', 'acceptedAt', 'createdAt'],
    showProperties: ['id', 'email', 'role', 'status', 'message', 'invitedById', 'expiresAt', 'acceptedAt', 'createdAt'],
    filterProperties: ['email', 'status', 'role', 'expiresAt'],
    // Không tạo mới trong AdminJS (phải tạo qua API để token được sinh + gửi mail)
    // và không sửa (đổi status bằng tay = phá vòng đời của lời mời).
    actions: {
      new: { isAccessible: false },
      edit: { isAccessible: false },
      bulkDelete: { isVisible: true },
    },
    properties: {
      id: { label: 'Mã' },
      email: { label: 'Email được mời' },
      role: { label: 'Vai trò khi tham gia' },
      status: { label: 'Trạng thái' },
      message: { label: 'Lời nhắn kèm theo' },
      invitedById: { label: 'Người mời (ID)' },
      expiresAt: { label: 'Hết hạn lúc' },
      acceptedAt: { label: 'Đã tham gia lúc' },
      createdAt: { label: 'Ngày tạo' },
      // Hai trường dưới đây là dữ liệu bí mật/kỹ thuật → ẩn hoàn toàn.
      tokenHash: { isVisible: { list: false, show: false, edit: false, filter: false } },
      updatedAt: { isVisible: { list: false, show: false, edit: false, filter: false } },
    },
  },
};

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
      const [users, posts, comments, likes, invitesPending] = await Promise.all([
        User.count(),
        Post.count(),
        Comment.count(),
        Like.count(),
        Invite.count({ where: { status: 'pending' } }),
      ]);
      return {
        users,
        posts,
        comments,
        likes,
        invitesPending, // số lời mời còn chờ dùng
        apiBase: urls.api.base,
        appUrl: env.frontendBaseUrl,
      };
    },
  },

  resources: [userResource, postResource, commentResource, likeResource, inviteResource],

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

/**
 * Đối tượng AdminJS chỉ được tạo SAU khi adapter Sequelize đã đăng ký —
 * nếu tạo trước, `new AdminJS({resources})` sẽ không dựng nổi resource.
 * Vì vậy nó được khởi tạo lười (lazy) và nhớ lại vào biến `admin`.
 */
let admin = null;

async function createAdmin() {
  if (admin) return admin;
  await loadAdminPlugins();
  admin = new AdminJS(adminJsOptions);
  return admin;
}

/**
 * Builds the authenticated router (session-based login form) that server.js
 * mounts at `/admin`.
 */
/**
 * Router dự phòng: nếu AdminJS không khởi động được (thiếu gói, sai phiên bản
 * Node…) thì API + ảnh vẫn chạy, còn /admin trả về trang giải thích bằng tiếng
 * Việt kèm đúng câu lệnh cần chạy. Tình huống này KHÔNG được làm sập server.
 */
function buildAdminFallbackRouter(reason) {
  const html = `<!doctype html><meta charset="utf-8"><title>Bảng quản trị chưa sẵn sàng</title>
  <style>body{font-family:system-ui;background:#fafafa;color:#262626;padding:40px;line-height:1.65;max-width:760px}
  h1{color:#c13584}code{background:#efefef;padding:2px 6px;border-radius:6px}
  .box{border-left:4px solid #c13584;background:#fff;padding:16px 20px;border-radius:8px}</style>
  <h1>⚠️ Bảng quản trị chưa khởi động được</h1>
  <div class="box">
    <p>API và ảnh <b>vẫn hoạt động bình thường</b>. Chỉ riêng trang này lỗi.</p>
    <p><b>Lý do:</b> <code>${String(reason).replace(/[<>&]/g, '')}</code></p>
    <p>Trên điện thoại, chạy lại:</p>
    <p><code>cd ~/familygram/backend &amp;&amp; npm install &amp;&amp; npm start</code></p>
    <p>Nếu vẫn lỗi, xem nhật ký khởi động: <code>cat ~/familygram/backend/logs/*.log</code></p>
  </div>`;

  const router = express.Router();
  router.use((_req, res) => res.status(503).type('html').send(html));
  return router;
}

async function buildAdminRouter(app) {
  // Static assets (custom-admin.css…) được mount TRƯỚC và luôn sẵn sàng — kể cả
  // khi AdminJS lỗi, tệp CSS vẫn tải được để còn soi giao diện.
  app.use(
    ASSETS_ROUTE,
    express.static(PUBLIC_DIR, {
      index: false,
      dotfiles: 'deny',
      maxAge: '1h',
      setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
    })
  );

  let AdminJSExpress;
  try {
    ({ AdminJSExpress } = await loadAdminPlugins());
    await createAdmin();
  } catch (error) {
    logger.error(`AdminJS không nạp được: ${error.message}`);
    logger.error('→ Kiểm tra: cd backend && npm install (cần adminjs, @adminjs/express, @adminjs/sequelize, express-session, connect-session-sequelize)');
    return buildAdminFallbackRouter(error.message);
  }

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

  // First request creates the session table (and any missing tables).
  sessionStore.sync().catch((error) => logger.warn(`AdminJS session sync failed: ${error.message}`));

  logger.success(
    `AdminJS ready → ${urls.admin.dashboard} ` +
      `(ngôn ngữ: ${env.admin.locale} · bản dịch: ${env.admin.availableLocales.join(', ')} · ` +
      `custom CSS: ${urls.admin.customCssRoute})`
  );

  return router;
}

module.exports = {
  // `admin` là biến lười: dùng createAdmin() nếu cần chắc chắn nó đã tồn tại.
  get admin() {
    return admin;
  },
  createAdmin,
  buildAdminRouter,
  buildAdminFallbackRouter,
  loadAdminPlugins,
  adminJsOptions,
  ASSETS_ROUTE,
  PUBLIC_DIR,
  authenticateAdmin,
};
