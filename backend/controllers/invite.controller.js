/**
 * controllers/invite.controller.js
 * ---------------------------------------------------------------------------
 * Lời mời tham gia cộng đồng — chỉ quản trị viên tạo được.
 *
 *   POST   /api/invites            (admin) tạo lời mời + gửi email
 *   GET    /api/invites            (admin) danh sách, kèm trạng thái
 *   DELETE /api/invites/:id        (admin) thu hồi
 *   GET    /api/invites/:token     (công khai) kiểm tra lời mời còn dùng được
 *
 * Bảo mật:
 *   • Chỉ lưu SHA-256 của token (utils/tokens.js).
 *   • Hết hạn theo INVITE_TTL_DAYS, dùng một lần, thu hồi được.
 *   • Không cho mời trùng người đã có tài khoản (báo rõ — quản trị viên cần biết).
 * ---------------------------------------------------------------------------
 */

'use strict';

const { Op } = require('sequelize');
const { Invite, User } = require('../models');
const { env } = require('../config/env');
const ApiError = require('../utils/ApiError');
const { resolveLocale } = require('../utils/locale');
const { t } = require('../i18n');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');
const mailer = require('../services/mailer.service');
const { generateToken, hashToken, inDays } = require('../utils/tokens');

/** POST /api/invites — tạo lời mời mới và gửi email. */
const createInvite = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const role = req.body.role === 'admin' ? 'admin' : 'member';
  const message = req.body.message ? String(req.body.message).slice(0, 200) : null;

  // Đã có tài khoản thì không mời nữa (nói thẳng để quản trị viên biết đường).
  const existing = await User.unscoped().findOne({ where: { email }, attributes: ['id', 'username'] });
  if (existing) {
    throw ApiError.conflict(
      t(resolveLocale(req), 'api.inviteEmailTaken', { email, username: existing.username })
    );
  }

  // Huỷ các lời mời cũ còn treo cho cùng email — tránh nhiều link cùng sống.
  await Invite.update(
    { revokedAt: new Date() },
    { where: { email, acceptedAt: null, revokedAt: null } }
  );

  const rawToken = generateToken();
  const invite = await Invite.create({
    email,
    role,
    message,
    tokenHash: hashToken(rawToken),
    invitedById: req.user.id,
    expiresAt: inDays(env.email.inviteTtlDays),
  });

  // Gửi email trong nền — quản trị viên nhận phản hồi ngay.
  const emailSent = await mailer.sendInvite({
    invite: { ...invite.toPublicJSON(), rawToken, ttlDays: env.email.inviteTtlDays },
    inviter: req.user,
    locale: req.user.locale || req.locale,
  });

  logger.info(`Lời mời đã tạo cho ${email} (${role}) bởi @${req.user.username}`);

  res.status(201).json({
    success: true,
    data: {
      invite: invite.toPublicJSON(),
      emailSent,
      // Chỉ trả về khi KHÔNG gửi được email, để quản trị viên gửi tay.
      inviteUrl: emailSent ? undefined : `${env.urls.frontendBaseUrl}/register?invite=${rawToken}`,
    },
  });
});

/** GET /api/invites — danh sách lời mời cho AdminJS / trang quản trị. */
const listInvites = asyncHandler(async (req, res) => {
  const include = [{ model: User, as: 'inviter', attributes: ['id', 'username', 'fullName'] }];

  const invites = await Invite.findAll({
    include,
    order: [['createdAt', 'DESC']],
    limit: Math.min(Number(req.query.limit) || 50, 200),
  });

  res.json({
    success: true,
    data: {
      invites: invites.map((invite) => ({
        ...invite.toPublicJSON(),
        inviter: invite.inviter
          ? { id: Number(invite.inviter.id), username: invite.inviter.username, fullName: invite.inviter.fullName }
          : null,
      })),
    },
  });
});

/** DELETE /api/invites/:id — thu hồi (không xoá để còn dấu vết kiểm toán). */
const revokeInvite = asyncHandler(async (req, res) => {
  const invite = await Invite.findByPk(req.params.id);
  if (!invite) throw ApiError.notFound('Không tìm thấy lời mời.');

  if (invite.acceptedAt) {
    throw ApiError.conflict(t(resolveLocale(req), 'api.inviteCannotRevoke'));
  }

  invite.revokedAt = new Date();
  await invite.save();

  logger.info(`Lời mời #${invite.id} (${invite.email}) đã bị thu hồi bởi @${req.user.username}`);
  res.json({ success: true, data: { invite: invite.toPublicJSON() } });
});

/** GET /api/invites/:token — công khai: trang đăng ký hỏi lời mời còn hiệu lực? */
const checkInvite = asyncHandler(async (req, res) => {
  const invite = await Invite.scope('withToken').findOne({
    where: { tokenHash: hashToken(req.params.token) },
    include: [{ model: User, as: 'inviter', attributes: ['username', 'fullName'] }],
  });

  if (!invite) throw ApiError.notFound(t(resolveLocale(req), 'api.inviteNotFound'));

  const payload = {
    ...invite.toPublicJSON(),
    inviter: invite.inviter ? { username: invite.inviter.username, fullName: invite.inviter.fullName } : null,
  };

  if (!invite.isUsable()) {
    // 410 Gone: liên kết có thật nhưng không dùng được nữa (hết hạn/đã dùng).
    return res.status(410).json({
      success: false,
      code: 'INVITE_EXPIRED',
      message: t(resolveLocale(req), 'api.inviteUsed'),
      data: { invite: payload },
    });
  }

  res.json({ success: true, data: { invite: payload } });
});

/** GET /api/invites/:token/... — không dùng; giữ chỗ cho tương lai gần. */
const stats = asyncHandler(async (_req, res) => {
  const [pending, accepted, expired] = await Promise.all([
    Invite.count({ where: { acceptedAt: null, revokedAt: null, expiresAt: { [Op.gt]: new Date() } } }),
    Invite.count({ where: { acceptedAt: { [Op.not]: null } } }),
    Invite.count({ where: { acceptedAt: null, revokedAt: null, expiresAt: { [Op.lte]: new Date() } } }),
  ]);
  res.json({ success: true, data: { pending, accepted, expired, ttlDays: env.email.inviteTtlDays } });
});

module.exports = { createInvite, listInvites, revokeInvite, checkInvite, stats };
