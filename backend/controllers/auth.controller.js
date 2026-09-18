'use strict';

/**
 * controllers/auth.controller.js
 * Đăng ký / đăng nhập / thông tin tài khoản.
 * Controller chỉ điều phối: validate do express-validator, lưu trữ do Sequelize,
 * token do middleware auth. Thông báo lỗi được dịch theo ngôn ngữ người dùng.
 */

const { User } = require('../models');
const { env } = require('../config/env');
const urls = require('../config/urls');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
// Danh sách ngôn ngữ hỗ trợ — lấy từ utils/locale để chỉ có MỘT nguồn sự thật.
const { SUPPORTED: SUPPORTED_LOCALES } = require('../utils/locale');
const { signToken } = require('../middleware/auth.middleware');
const telegram = require('../services/telegram.service');
const logger = require('../utils/logger');
const { resolveLocale, normalizeLocale } = require('../utils/locale');

/** POST /api/auth/register */
const register = asyncHandler(async (req, res) => {
  const { username, fullName, email, password } = req.body;
  // Ngôn ngữ của người đăng ký: header Accept-Language → body.locale → mặc định (vi)
  const locale = resolveLocale(req) || normalizeLocale(req.body.locale) || 'vi';

  const existing = await User.unscoped().findOne({ where: { email }, attributes: ['id'] });
  if (existing) throw ApiError.conflict('An account with this e-mail already exists.');

  const usernameTaken = await User.unscoped().findOne({ where: { username }, attributes: ['id'] });
  if (usernameTaken) throw ApiError.conflict('This username is already taken.');

  // Tài khoản đầu tiên có thể tự nhận quyền admin (cờ trong .env).
  const isFirstUser = (await User.unscoped().count()) === 0;

  const user = await User.create({
    username,
    fullName,
    email,
    password,
    locale,
    role: isFirstUser && env.auth.firstUserIsAdmin ? 'admin' : 'member',
  });

  if (isFirstUser) await telegram.notifyFirstUser(user);
  else await telegram.notifyNewMember(user);

  logger.info(`User registered: @${user.username} (${user.role}, ${locale})`);

  res.status(201).json({
    success: true,
    data: { token: signToken(user), user: user.toPublicJSON() },
  });
});

/** POST /api/auth/login — chấp nhận email HOẶC tên đăng nhập ở trường `identifier`. */
const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;
  const normalized = String(identifier).trim().toLowerCase();

  const user = await User.scope('withPassword').findOne({ where: { email: normalized } })
    || await User.scope('withPassword').findOne({ where: { username: normalized } });

  if (!user) throw ApiError.unauthorized('Invalid credentials.');
  if (!user.isActive) throw ApiError.forbidden('This account has been disabled by the administrator.');

  const passwordMatches = await user.verifyPassword(password);
  if (!passwordMatches) throw ApiError.unauthorized('Invalid credentials.');

  // Ghi nhớ ngôn ngữ đang dùng để bot Telegram trả thông báo đúng tiếng.
  const locale = resolveLocale(req) || normalizeLocale(user.locale) || 'vi';
  user.lastLoginAt = new Date();
  if (user.locale !== locale) user.locale = locale;
  await user.save({ silent: true, fields: ['lastLoginAt', 'locale'] });

  res.json({
    success: true,
    data: { token: signToken(user), user: user.toPublicJSON() },
  });
});

/** GET /api/auth/me */
const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user.toPublicJSON() } });
});

/** PATCH /api/auth/me — đổi ngôn ngữ / tiểu sử của chính mình. */
const updateMe = asyncHandler(async (req, res) => {
  const { locale, bio, fullName } = req.body;
  const patch = {};

  if (locale !== undefined) {
    const normalized = normalizeLocale(locale);
    if (!normalized) throw ApiError.badRequest('Unsupported language. Allowed: vi, en, zh.');
    patch.locale = normalized;
  }
  if (bio !== undefined) patch.bio = String(bio).slice(0, 160);
  if (fullName !== undefined) patch.fullName = String(fullName).slice(0, 80);

  if (Object.keys(patch).length) {
    await req.user.update(patch, { fields: Object.keys(patch) });
  }

  res.json({ success: true, data: { user: req.user.toPublicJSON() } });
});

/** GET /api/auth/config — thông tin khởi tạo công khai cho app React. */
const publicConfig = asyncHandler(async (_req, res) => {
  res.json({
    success: true,
    data: {
      appName: 'FamilyGram',
      /** Ảnh — dùng cho ô chọn ảnh trong trang đăng bài. */
      maxUploadMb: env.uploads.maxSizeMb,
      allowedMimeTypes: env.uploads.allowedMimeTypes,
      /** Video (Reels) — giao diện tự chặn trước khi gửi lên. */
      maxVideoMb: env.uploads.maxVideoSizeMb,
      maxVideoDurationSeconds: env.uploads.maxVideoDurationSeconds,
      allowedVideoMimeTypes: env.uploads.allowedVideoMimeTypes,
      /** Nhạc nền không bắt buộc. */
      maxAudioMb: env.uploads.maxAudioSizeMb,
      allowedAudioMimeTypes: env.uploads.allowedAudioMimeTypes,
      uploadsBaseUrl: urls.uploads.base,
      apiBaseUrl: urls.api.base,
      defaultLocale: env.telegram.defaultLocale || 'vi',
      supportedLocales: SUPPORTED_LOCALES,
    },
  });
});

module.exports = { register, login, me, updateMe, publicConfig };
