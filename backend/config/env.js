'use strict';

/**
 * config/env.js
 * ---------------------------------------------------------------------------
 * Single source of truth for every environment-driven value.
 * Nothing else in the codebase may read `process.env` directly (except this
 * file) — that keeps secrets and configuration auditable in one place.
 * ---------------------------------------------------------------------------
 */

const path = require('path');
const dotenv = require('dotenv');

// Load .env from the backend root, regardless of the CWD.
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { NODE_ENV = 'development' } = process.env;
const isProd = NODE_ENV === 'production';

/** Reads a variable and throws when a mandatory one is missing. */
function required(key, fallback = undefined) {
  const value = process.env[key] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(
      `[config/env] Missing required environment variable "${key}". ` +
        'Copy .env.example to .env and fill it in.'
    );
  }
  return value;
}

const optional = (key, fallback = '') => process.env[key] ?? fallback;
const bool = (key, fallback = false) => {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
};
const int = (key, fallback) => {
  const parsed = Number.parseInt(process.env[key] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const list = (key, fallback = []) =>
  optional(key, '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .concat(fallback)
    // Khử trùng lặp nhưng giữ nguyên thứ tự khai báo trong .env
    .filter((item, index, array) => array.indexOf(item) === index);

/* ----------------------------- Termux defaults ---------------------------- */
// Termux prefix, e.g. /data/data/com.termux/files/usr
const TERMUX_PREFIX =
  process.env.PREFIX || (process.platform === 'android' ? '/data/data/com.termux/files/usr' : '');

const env = {
  nodeEnv: NODE_ENV,
  isProd,
  isTest: NODE_ENV === 'test',

  server: {
    port: int('PORT', 4000),
    host: optional('HOST', '0.0.0.0'),
    corsOrigins: list('CORS_ORIGINS'),
  },

  urls: {
    publicBaseUrl: required('PUBLIC_BASE_URL', 'http://localhost:4000').replace(/\/+$/, ''),
    frontendBaseUrl: optional('FRONTEND_BASE_URL', 'http://localhost:5173').replace(/\/+$/, ''),
  },

  db: {
    host: optional('DB_HOST', '127.0.0.1'),
    port: int('DB_PORT', 3306),
    name: required('DB_NAME', 'familygram'),
    user: required('DB_USER', 'familygram'),
    password: optional('DB_PASSWORD'),
    dialect: optional('DB_DIALECT', 'mariadb'),
    /** Chỉ dùng khi DB_DIALECT=sqlite (bộ test tự động chạy không cần MariaDB). */
    storage: optional('DB_STORAGE', ''),
    /** Múi giờ của gia đình: Việt Nam +07:00 — đổi trong .env nếu ở nơi khác. */
    timezone: optional('DB_TIMEZONE', '+07:00'),
    logging: bool('DB_LOGGING', false),
    poolMax: int('DB_POOL_MAX', 10),
    socket: optional('MARIADB_SOCKET', TERMUX_PREFIX ? `${TERMUX_PREFIX}/var/run/mysqld.sock` : ''),
    dataDir: optional('MARIADB_DATADIR', TERMUX_PREFIX ? `${TERMUX_PREFIX}/var/lib/mysql` : ''),
  },

  auth: {
    jwtSecret: required('JWT_SECRET', isProd ? undefined : 'dev-only-insecure-jwt-secret'),
    jwtExpiresIn: optional('JWT_EXPIRES_IN', '30d'),
    saltRounds: int('BCRYPT_SALT_ROUNDS', 10),
    firstUserIsAdmin: bool('FIRST_USER_IS_ADMIN', true),
  },

  admin: {
    email: required('ADMIN_EMAIL', 'admin@localhost'),
    passwordHash: optional('ADMIN_PASSWORD_HASH'),
    passwordFallback: optional('ADMIN_PASSWORD'),
    cookieName: optional('ADMIN_COOKIE_NAME', 'familygram.admin'),
    sessionSecret: required(
      'ADMIN_SESSION_SECRET',
      isProd ? undefined : 'dev-only-insecure-session-secret'
    ),
    sessionMaxAgeMs: int('ADMIN_SESSION_MAX_AGE_MS', 24 * 60 * 60 * 1000),
    // Ngôn ngữ giao diện trang quản trị: vi (mặc định) · en · zh-CN
    locale: optional('ADMIN_LOCALE', 'vi'),
    availableLocales: list('ADMIN_AVAILABLE_LOCALES', ['vi', 'en', 'zh-CN']),
  },

  uploads: {
    dir: optional('UPLOAD_DIR', 'uploads'),
    maxSizeMb: int('MAX_UPLOAD_SIZE_MB', 15),
    allowedMimeTypes: list('ALLOWED_MIME_TYPES', [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ]),
    filenameBytes: int('IMAGE_FILENAME_BYTES', 16),

    /* --- Reels (video) --- */
    maxVideoSizeMb: int('MAX_VIDEO_SIZE_MB', 60),
    // Trần thời lượng; server tự đọc từ atom mvhd nên KHÔNG cần ffprobe.
    maxVideoDurationSeconds: int('MAX_VIDEO_DURATION_SECONDS', 60),
    allowedVideoMimeTypes: list('ALLOWED_VIDEO_MIME_TYPES', [
      'video/mp4',
      'video/webm',
      'video/quicktime',
    ]),

    /* --- Nhạc nền (không mux, phát đồng bộ ở client) --- */
    maxAudioSizeMb: int('MAX_AUDIO_SIZE_MB', 10),
    allowedAudioMimeTypes: list('ALLOWED_AUDIO_MIME_TYPES', [
      'audio/mpeg',
      'audio/mp4',
      'audio/aac',
      'audio/ogg',
      'audio/wav',
    ]),
  },

  rateLimit: {
    windowMs: int('RATE_LIMIT_WINDOW_MINUTES', 15) * 60 * 1000,
    max: int('RATE_LIMIT_MAX', 300),
    authMax: int('AUTH_RATE_LIMIT_MAX', 20),
    uploadMax: int('UPLOAD_RATE_LIMIT_MAX', 30),
  },

  telegram: {
    enabled: bool('TELEGRAM_ENABLED', true),
    token: optional('TELEGRAM_BOT_TOKEN'),
    adminChatId: optional('TELEGRAM_ADMIN_CHAT_ID'),
    sendPhoto: bool('TELEGRAM_SEND_PHOTO', true),
    // Ngôn ngữ mặc định của thông báo: vi (chính), en / zh (phụ).
    defaultLocale: optional('TELEGRAM_DEFAULT_LOCALE', 'vi'),
  },

  cloudflare: {
    tunnelName: optional('CLOUDFLARE_TUNNEL_NAME', ''),
    tunnelConfig: optional('CLOUDFLARE_TUNNEL_CONFIG', ''),
    hostname: optional('CLOUDFLARE_HOSTNAME', ''),
    /** Tunnel quản lý qua dashboard: chỉ cần token, không cần config.yml. */
    tunnelToken: optional('CLOUDFLARE_TUNNEL_TOKEN', ''),
  },

  /**
   * Email gửi thông báo (Gmail + mật khẩu ứng dụng) — CHỈ dùng ở phía server.
   * Tuyệt đối không đưa khoá này vào biến VITE_* hay bất kỳ mã phía client.
   */
  email: {
    enabled: bool('EMAIL_ENABLED', false),
    from: optional('SENDER_EMAIL', ''),
    password: optional('SENDER_PASSWORD', ''),
    /** Hộp thư nhận thông báo (mặc định = địa chỉ gửi). */
    to: optional('NOTIFY_EMAIL', '') || optional('SENDER_EMAIL', ''),
    /** Tài khoản Google dùng cho tính năng lịch (nếu bật). */
    gcalAccount: optional('GCAL_EMAIL', ''),
  },

  /** Trợ lý AI (tuỳ chọn) — chỉ chạy ở server để giữ khoá bí mật. */
  ai: {
    enabled: bool('AI_ENABLED', false),
    geminiApiKey: optional('GEMINI_API_KEY', ''),
  },
};

/** Fail fast in production when a security-critical secret is still a placeholder. */
function assertProductionSecrets() {
  if (!env.isProd) return;
  const suspicious = [];
  if (env.auth.jwtSecret.length < 32) suspicious.push('JWT_SECRET (min 32 chars)');
  if (env.admin.sessionSecret.length < 32)
    suspicious.push('ADMIN_SESSION_SECRET (min 32 chars)');
  if (!env.admin.passwordHash && !env.admin.passwordFallback)
    suspicious.push('ADMIN_PASSWORD_HASH or ADMIN_PASSWORD');
  if (suspicious.length) {
    // Warn instead of crashing: a fresh Termux install should still boot.
    // eslint-disable-next-line no-console
    console.warn(
      `\n⚠️  [config/env] Weak/missing production secrets: ${suspicious.join(', ')}\n` +
        '   Generate strong values: openssl rand -hex 32\n'
    );
  }
}

module.exports = { env, assertProductionSecrets };
