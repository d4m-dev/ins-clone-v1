#!/usr/bin/env node
'use strict';

/**
 * scripts/mail-test.js — gửi một email thử tới địa chỉ nhận thông báo.
 * ---------------------------------------------------------------------------
 *   cd backend && npm run mail:test            # kiểm tra SMTP + gửi email thật
 *   cd backend && npm run mail:test -- --dry   # chỉ kiểm tra đăng nhập SMTP
 *
 * Vì sao cần? SMTP Gmail rất hay hỏng ÂM THẦM: sai mật khẩu ứng dụng, chưa bật
 * xác thực 2 bước, Google chặn đăng nhập… Dây chuyền đăng ảnh vẫn chạy bình
 * thường nhưng thông báo không bao giờ tới. Chạy lệnh này sau khi sửa .env.
 *
 * KHÔNG in mật khẩu. Địa chỉ email được che một phần.
 * ---------------------------------------------------------------------------
 */

const path = require('path');

const { env } = require(path.join(__dirname, '..', 'config', 'env'));
const urls = require(path.join(__dirname, '..', 'config', 'urls'));
const mailer = require(path.join(__dirname, '..', 'services', 'mailer.service'));
const templates = require(path.join(__dirname, '..', 'services', 'email.templates'));

const dryRun = process.argv.includes('--dry');
const appBase = env.urls.frontendBaseUrl;

/** Che bớt địa chỉ: andubai5555@gmail.com → a***@gmail.com */
function mask(address = '') {
  const [name, domain] = String(address).split('@');
  if (!domain) return '(chưa đặt)';
  return `${name.slice(0, 1)}***@${domain}`;
}

(async () => {
  console.log('\n── Cấu hình email hiện tại ─────────────────────────────');
  console.log(`  EMAIL_ENABLED        ${env.email.enabled}`);
  console.log(`  SMTP                 ${env.email.smtpHost}:${env.email.smtpPort} (secure=${env.email.smtpSecure})`);
  console.log(`  Gửi từ               ${mask(env.email.from)}`);
  console.log(`  Nhận thông báo ảnh   ${mask(env.email.to)}`);
  console.log(`  Thông báo ảnh mới    ${env.email.notifyNewPhoto}`);
  console.log(`  Hạn link đặt lại MK  ${env.email.resetTokenTtlMinutes} phút`);
  console.log(`  Hạn link mời         ${env.email.inviteTtlDays} ngày`);
  console.log(`  Trang web gắn kèm    ${appBase}`);

  if (!env.email.enabled) {
    console.log('\n⚠️  EMAIL_ENABLED=false — mọi email đều bị bỏ qua.');
    console.log('    Đặt EMAIL_ENABLED=true trong backend/.env rồi chạy lại.\n');
    process.exit(0);
  }
  if (!env.email.from || !env.email.password) {
    console.log('\n❌ Thiếu SENDER_EMAIL hoặc SENDER_PASSWORD trong backend/.env\n');
    process.exit(1);
  }

  console.log('\n── Kiểm tra đăng nhập SMTP ─────────────────────────────');
  const verified = await mailer.verify();
  if (!verified.ok) {
    console.log(`  ❌ ${verified.reason}`);
    console.log('\n  Cách xử lý thường gặp:');
    console.log('   1. Mật khẩu ứng dụng Gmail: myaccount.google.com/apppasswords (16 ký tự)');
    console.log('      → KHÔNG dùng mật khẩu đăng nhập Google thường.');
    console.log('   2. Tài khoản gửi phải đã bật xác thực 2 bước.');
    console.log('   3. SENDER_PASSWORD phải là mật khẩu ứng dụng đó (bỏ dấu cách cũng được).');
    console.log('   4. Gmail: SMTP_HOST=smtp.gmail.com · SMTP_PORT=587 (STARTTLS) hoặc 465 (SMTP_SECURE=true).\n');
    process.exit(1);
  }
  console.log('  ✅ Đăng nhập SMTP thành công');

  if (dryRun) {
    console.log('\n(--dry) Dừng ở đây, chưa gửi email nào.\n');
    process.exit(0);
  }

  console.log('\n── Gửi email thử ──────────────────────────────────────');
  const recipient = env.email.to || env.email.from;
  const locale = env.telegram.defaultLocale || 'vi';
  const samplePostUrl = `${appBase}${urls.routes.post.replace(':id', '0')}`;

  const mail = templates.newPhotoEmail(
    {
      post: {
        id: 0,
        caption: 'Đây là email THỬ — không phải ảnh thật, không cần xoá gì cả.',
        location: 'Chư Ty, Gia Lai',
        mediaType: 'photo',
        isVideo: () => false,
      },
      author: { id: 0, username: 'kiem-tra', fullName: 'Hệ thống FamilyGram', email: recipient },
      urls: { postUrl: samplePostUrl, appUrl: appBase },
    },
    locale
  );

  const sent = await mailer.send({
    to: recipient,
    subject: `[Thử] ${mail.subject}`,
    html: mail.html,
    text: mail.text,
  });

  if (sent) {
    console.log(`  ✅ Đã gửi tới ${mask(recipient)}`);
    console.log('  Mở hộp thư (cả mục Spam / Quảng cáo) để xác nhận.');
    console.log('  Sau đó mỗi ảnh/video mới sẽ tự động gửi thông báo.\n');
    process.exit(0);
  }

  const why = mailer.status();
  console.log(`  ❌ Không gửi được: ${why.reason || 'SMTP từ chối (xem log phía trên)'}`);
  console.log('  Xem chi tiết trong backend/logs/ rồi chạy lại lệnh này.\n');
  process.exit(1);
})();
