/**
 * services/mailer.service.js
 * ---------------------------------------------------------------------------
 * Gửi email qua SMTP (Gmail + mật khẩu ứng dụng).
 *
 * Nguyên tắc:
 *   1. TUYỆT ĐỐI không chặn request — mọi lời gọi đều là "fire and forget":
 *      người dùng đăng ảnh xong ngay, email gửi nền, lỗi chỉ ghi log.
 *   2. Không có `nodemailer` hoặc EMAIL_ENABLED=false → service tự tắt êm,
 *      API vẫn chạy bình thường (quan trọng trên Termux: cài thiếu gói không
 *      được làm sập máy chủ ảnh của cả nhà).
 *   3. Khoá bí mật chỉ nằm ở .env phía server. Không bao giờ trả về client.
 * ---------------------------------------------------------------------------
 */

'use strict';

const { env } = require('../config/env');
const urls = require('../config/urls');
const logger = require('../utils/logger');
const templates = require('./email.templates');

/** nodemailer được nạp "lười" để thiếu gói cũng không làm sập server. */
let transporter = null;
let unavailableReason = null;
let initialised = false;

function init() {
  if (initialised) return transporter;
  initialised = true;

  if (!env.email.enabled) {
    unavailableReason = 'EMAIL_ENABLED=false';
    return null;
  }
  if (!env.email.from || !env.email.password) {
    unavailableReason = 'thiếu SENDER_EMAIL / SENDER_PASSWORD';
    return null;
  }

  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    unavailableReason = 'chưa cài nodemailer (chạy: npm install nodemailer)';
    return null;
  }

  transporter = nodemailer.createTransport({
    host: env.email.smtpHost,
    port: env.email.smtpPort,
    secure: env.email.smtpSecure, // 465 = true, 587 = false + STARTTLS
    auth: { user: env.email.from, pass: env.email.password },
    // Termux/4G hay chậm — đặt hạn chờ rõ ràng thay vì treo vô hạn.
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    pool: false,
  });

  logger.success(`Email đã bật · ${env.email.from} → ${env.email.to}`);
  return transporter;
}

/** Trạng thái để /api/health báo cho quản trị viên biết. */
const status = () => {
  init();
  return {
    enabled: env.email.enabled,
    ready: Boolean(transporter),
    reason: transporter ? null : unavailableReason,
    from: env.email.from ? env.email.from.replace(/^(.).*(@.*)$/, '$1***$2') : null,
  };
};

/**
 * Gửi một email. KHÔNG bao giờ ném lỗi ra ngoài.
 * @returns {Promise<boolean>} true nếu SMTP đã nhận.
 */
async function send({ to, subject, html, text, replyTo }) {
  const tx = init();
  if (!tx || !to) return false;

  try {
    const info = await tx.sendMail({
      from: env.email.fromName ? `"${env.email.fromName}" <${env.email.from}>` : env.email.from,
      to,
      subject,
      text,
      html,
      replyTo: replyTo || undefined,
    });
    logger.debug(`Email đã gửi tới ${to} (${info.messageId})`);
    return true;
  } catch (error) {
    // Sai mật khẩu ứng dụng / mất mạng / Gmail chặn: ghi log, không làm hỏng request.
    logger.warn(`Gửi email thất bại (${to}): ${error.message}`);
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*                        Các tình huống của FamilyGram                       */
/* -------------------------------------------------------------------------- */

/** Có ảnh/video mới → báo quản trị viên. */
async function notifyNewPhoto({ post, author, locale }) {
  if (!env.email.notifyNewPhoto) return false;

  const { subject, html, text } = templates.newPhotoEmail(
    {
      post,
      author,
      urls: {
        postUrl: `${env.urls.frontendBaseUrl}/p/${post.id}`,
        imageUrl: urls.uploads.post(post.imageFilename),
        appUrl: env.urls.frontendBaseUrl,
      },
    },
    locale
  );

  return send({ to: env.email.to, subject, html, text, replyTo: author.email });
}

/** Mời một thành viên mới (đã tạo bản ghi Invite trước đó). */
async function sendInvite({ invite, inviter, locale }) {
  const { subject, html, text } = templates.inviteEmail(
    {
      invite,
      inviter,
      urls: { inviteUrl: `${env.urls.frontendBaseUrl}${urls.routes.register}?invite=${invite.rawToken}` },
    },
    locale
  );
  return send({ to: invite.email, subject, html, text, replyTo: inviter.email });
}

/** Liên kết đặt lại mật khẩu (token dùng một lần). */
async function sendPasswordReset({ user, rawToken, locale }) {
  const { subject, html, text } = templates.passwordResetEmail(
    {
      user,
      urls: { resetUrl: `${env.urls.frontendBaseUrl}${urls.routes.resetPassword}?token=${rawToken}` },
      minutes: env.email.resetTokenTtlMinutes,
    },
    locale
  );
  return send({ to: user.email, subject, html, text });
}

/** Chào mừng thành viên mới — gửi sau khi đăng ký thành công. */
async function sendWelcome({ user, locale }) {
  const { subject, html, text } = templates.welcomeEmail(
    { user, urls: { appUrl: env.urls.frontendBaseUrl } },
    locale
  );
  return send({ to: user.email, subject, html, text });
}

/** Kiểm tra cấu hình SMTP mà không gửi gì (dùng cho `npm run mail:test`). */
async function verify() {
  const tx = init();
  if (!tx) return { ok: false, reason: unavailableReason };
  try {
    await tx.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

/** Chỉ dùng trong test: thay transporter bằng hàm giả để kiểm tra nội dung. */
function __setTransportForTests(fake) {
  transporter = fake;
  initialised = true;
  unavailableReason = fake ? null : 'test';
}

module.exports = {
  send,
  notifyNewPhoto,
  sendInvite,
  sendPasswordReset,
  sendWelcome,
  verify,
  status,
  __setTransportForTests,
};
