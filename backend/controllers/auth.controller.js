'use strict';

/**
 * controllers/auth.controller.js
 * Đăng ký / đăng nhập / thông tin tài khoản.
 * Controller chỉ điều phối: validate do express-validator, lưu trữ do Sequelize,
 * token do middleware auth. Thông báo lỗi được dịch theo ngôn ngữ người dùng.
 */

const { User, Invite } = require('../models');
const { env } = require('../config/env');
const urls = require('../config/urls');
const ApiError = require('../utils/ApiError');
const { t } = require('../i18n');
const asyncHandler = require('../utils/asyncHandler');
// Danh sách ngôn ngữ hỗ trợ — lấy từ utils/locale để chỉ có MỘT nguồn sự thật.
const { SUPPORTED: SUPPORTED_LOCALES } = require('../utils/locale');
const { signToken } = require('../middleware/auth.middleware');
const telegram = require('../services/telegram.service');
const mailer = require('../services/mailer.service');
const logger = require('../utils/logger');
const { resolveLocale, normalizeLocale } = require('../utils/locale');
const { generateToken, hashToken, safeEqual, inMinutes } = require('../utils/tokens');

/** POST /api/auth/register */
const register = asyncHandler(async (req, res) => {
  const { username, fullName, email, password } = req.body;
  // Ngôn ngữ của người đăng ký: header Accept-Language → body.locale → mặc định (vi)
  const locale = resolveLocale(req) || normalizeLocale(req.body.locale) || 'vi';

  /**
   * Đăng ký bằng lời mời: email + vai trò do lời mời quyết định, KHÔNG tin client.
   * Kiểm tra trước khi tạo người dùng để không tạo tài khoản ngoài ý muốn.
   */
  const inviteToken = req.body.inviteToken ? String(req.body.inviteToken) : null;
  let invite = null;
  let effectiveEmail = email;

  if (inviteToken) {
    invite = await Invite.scope('withToken').findOne({ where: { tokenHash: hashToken(inviteToken) } });
    // Thông báo lỗi theo ngôn ngữ người gửi (Accept-Language từ giao diện).
    const locale = resolveLocale(req);
    if (!invite) throw ApiError.badRequest(t(locale, 'api.inviteInvalid'));
    if (!invite.isUsable()) throw ApiError.badRequest(t(locale, 'api.inviteUsed'));
    effectiveEmail = invite.email;
  }

  const existing = await User.unscoped().findOne({ where: { email: effectiveEmail }, attributes: ['id'] });
  if (existing) throw ApiError.conflict(t(resolveLocale(req), 'api.emailTaken'));

  const usernameTaken = await User.unscoped().findOne({ where: { username }, attributes: ['id'] });
  if (usernameTaken) throw ApiError.conflict(t(resolveLocale(req), 'api.usernameTaken'));

  // Tài khoản đầu tiên có thể tự nhận quyền admin (cờ trong .env).
  const isFirstUser = (await User.unscoped().count()) === 0;

  const user = await User.create({
    username,
    fullName,
    email: effectiveEmail,
    password,
    locale,
    role: invite ? invite.role : isFirstUser && env.auth.firstUserIsAdmin ? 'admin' : 'member',
    invitedById: invite ? invite.invitedById : null,
  });

  // Đánh dấu lời mời đã dùng (một lần duy nhất).
  /**
   * ỨNG DỤNG CÔNG KHAI: ai cũng tự tạo được tài khoản (PUBLIC_REGISTRATION=true,
   * mặc định). Đặt false nếu muốn quay lại chế độ chỉ-vào-bằng-lời-mời.
   */
  if (!invite && !env.auth.publicRegistration) {
    throw ApiError.forbidden(t(locale, 'api.inviteRequired'));
  }

  if (invite) {
    invite.acceptedAt = new Date();
    invite.acceptedByUserId = user.id;
    await invite.save();
    logger.info(`Lời mời #${invite.id} đã được chấp nhận bởi @${user.username}`);
  }

  if (isFirstUser) await telegram.notifyFirstUser(user);
  else await telegram.notifyNewMember(user);

  // Email chào mừng — chạy nền, không chặn phản hồi đăng ký.
  mailer.sendWelcome({ user, locale }).catch((error) => logger.warn(`Welcome email failed: ${error.message}`));

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
/**
 * POST /api/auth/forgot-password
 * ---------------------------------------------------------------------------
 * Luôn trả về CÙNG một thông báo, bất kể email có tồn tại hay không
 * (chống dò tài khoản). Chỉ khi email tồn tại mới thực sự gửi thư.
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const locale = resolveLocale(req) || 'vi';

  const user = await User.unscoped().findOne({ where: { email } });

  if (user && user.isActive) {
    const rawToken = generateToken();
    user.passwordResetHash = hashToken(rawToken);
    user.passwordResetExpiresAt = inMinutes(env.email.resetTokenTtlMinutes);
    await user.save();

    // Gửi nền; người dùng không thấy sự khác biệt dù SMTP có lỗi.
    mailer
      .sendPasswordReset({ user, rawToken, locale: user.locale || locale })
      .catch((error) => logger.warn(`Reset email failed: ${error.message}`));

    logger.info(`Yêu cầu đặt lại mật khẩu cho @${user.username}`);
  }

  res.json({
    success: true,
    data: {
      message: t(locale, 'api.forgotSent'),
      expiresInMinutes: env.email.resetTokenTtlMinutes,
    },
  });
});

/**
 * POST /api/auth/reset-password
 * ---------------------------------------------------------------------------
 * Token dùng MỘT lần. Sau khi đổi mật khẩu, token bị xoá và người dùng đăng
 * nhập lại — phiên cũ vẫn hợp lệ tới khi hết hạn JWT, nên nhắc trong thông báo.
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const tokenHash = hashToken(token);

  const user = await User.scope('withResetToken').findOne({ where: { passwordResetHash: tokenHash } });

  // So sánh hằng thời gian + kiểm tra hạn dùng.
  if (!user || !safeEqual(user.passwordResetHash, tokenHash) || !user.hasValidResetToken()) {
    throw ApiError.badRequest(t(resolveLocale(req), 'api.resetInvalid'));
  }

  user.password = password; // hook beforeSave sẽ băm
  user.clearResetToken();
  await user.save();

  logger.info(`Mật khẩu đã được đặt lại cho @${user.username}`);

  res.json({
    success: true,
    data: {
      message: t(resolveLocale(req), 'api.resetDone'),
      user: user.toPublicJSON(),
    },
  });
});

const publicConfig = asyncHandler(async (_req, res) => {
  res.json({
    success: true,
    data: {
      appName: 'PixGram',
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
      /** Ứng dụng công khai hay chỉ vào bằng lời mời (giao diện đổi câu chữ). */
      publicRegistration: env.auth.publicRegistration,
      /** Giới hạn của chat để giao diện chặn trước khi gửi lên. */
      chat: {
        maxMessageLength: env.chat.maxMessageLength,
        maxAttachmentMb: env.chat.maxAttachmentSizeMb,
        messageRequests: env.chat.messageRequests,
      },
    },
  });
});

module.exports = { register, login, me, updateMe, forgotPassword, resetPassword, publicConfig };
