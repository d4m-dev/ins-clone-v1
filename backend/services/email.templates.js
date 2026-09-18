/**
 * services/email.templates.js
 * ---------------------------------------------------------------------------
 * Toàn bộ nội dung email nằm ở MỘT chỗ, ba ngôn ngữ (vi · en · zh) — cùng triết
 * lý với i18n/messages.js của bot Telegram.
 *
 * Vì sao không nhét vào i18n/messages.js? Vì email cần cả HTML + chủ đề + nút
 * bấm; gộp vào catalog của bot sẽ làm file đó phình ra và khó đọc.
 * Mọi email đều có bản text thuần (một số ứng dụng chặn HTML).
 * ---------------------------------------------------------------------------
 */

'use strict';

const { normalizeLocale } = require('../utils/locale');

/** Bảng màu dùng chung — trùng với thương hiệu Instagram-ish của frontend. */
const BRAND = {
  purple: '#5e20aa',
  pink: '#d62976',
  orange: '#f77737',
  ink: '#262626',
  soft: '#8e8e8e',
  line: '#dbdbdb',
  bg: '#fafafa',
};

const COPY = {
  vi: {
    dir: 'ltr',
    newPhoto: {
      subject: '📸 {{author}} vừa đăng {{kind}} mới',
      preview: '{{author}} vừa chia sẻ lên FamilyGram',
      heading: '{{author}} vừa đăng {{kind}} mới',
      intro: 'Một khoảnh khắc mới vừa được thêm vào album gia đình.',
      kindPhoto: 'một tấm ảnh',
      kindVideo: 'một đoạn video',
      caption: 'Chú thích',
      location: 'Địa điểm',
      duration: 'Thời lượng',
      cta: 'Mở FamilyGram',
      footer: 'Bạn nhận được email này vì là quản trị viên của FamilyGram.',
    },
    invite: {
      subject: '💌 {{inviter}} mời bạn vào album gia đình',
      preview: '{{inviter}} đã tạo tài khoản cho bạn',
      heading: '{{inviter}} mời bạn tham gia FamilyGram',
      intro: 'Đây là album ảnh riêng tư của gia đình — không quảng cáo, không người lạ.',
      detail: 'Email đăng ký: {{email}}',
      expires: 'Lời mời hết hạn sau {{days}} ngày.',
      cta: 'Tạo tài khoản của tôi',
      fallback: 'Nếu nút không hoạt động, hãy mở liên kết này:',
      footer: 'Nếu bạn không mong đợi lời mời này, hãy bỏ qua email — không cần làm gì thêm.',
    },
    reset: {
      subject: '🔑 Đặt lại mật khẩu FamilyGram',
      preview: 'Liên kết đặt lại mật khẩu',
      heading: 'Đặt lại mật khẩu',
      intro: 'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản {{username}}.',
      expires: 'Liên kết chỉ dùng được một lần và hết hạn sau {{minutes}} phút.',
      cta: 'Đặt mật khẩu mới',
      fallback: 'Nếu nút không hoạt động, hãy mở liên kết này:',
      footer: 'Nếu không phải bạn yêu cầu, hãy bỏ qua email — mật khẩu hiện tại vẫn an toàn.',
    },
    welcome: {
      subject: '🎉 Chào mừng {{name}} đến với FamilyGram',
      preview: 'Tài khoản của bạn đã sẵn sàng',
      heading: 'Chào mừng {{name}}!',
      intro: 'Tài khoản của bạn đã được tạo. Hãy đăng nhập và chia sẻ tấm ảnh đầu tiên.',
      cta: 'Mở FamilyGram',
      footer: 'Gia đình mình giữ ảnh ở đây — riêng tư, không đám mây công cộng.',
    },
  },

  en: {
    dir: 'ltr',
    newPhoto: {
      subject: '📸 {{author}} just posted a new {{kind}}',
      preview: '{{author}} shared something on FamilyGram',
      heading: '{{author}} just posted a new {{kind}}',
      intro: 'A new moment was added to the family album.',
      kindPhoto: 'photo',
      kindVideo: 'video',
      caption: 'Caption',
      location: 'Location',
      duration: 'Duration',
      cta: 'Open FamilyGram',
      footer: 'You are receiving this because you are an administrator of FamilyGram.',
    },
    invite: {
      subject: '💌 {{inviter}} invited you to the family album',
      preview: '{{inviter}} created an account for you',
      heading: '{{inviter}} invited you to FamilyGram',
      intro: 'This is the family’s private photo album — no ads, no strangers.',
      detail: 'Sign-up e-mail: {{email}}',
      expires: 'This invitation expires in {{days}} days.',
      cta: 'Create my account',
      fallback: 'If the button does not work, open this link:',
      footer: 'If you did not expect this invitation, just ignore this e-mail.',
    },
    reset: {
      subject: '🔑 Reset your FamilyGram password',
      preview: 'Password reset link',
      heading: 'Reset your password',
      intro: 'We received a request to reset the password for {{username}}.',
      expires: 'The link works once and expires in {{minutes}} minutes.',
      cta: 'Set a new password',
      fallback: 'If the button does not work, open this link:',
      footer: 'If you did not request this, ignore this e-mail — your password is unchanged.',
    },
    welcome: {
      subject: '🎉 Welcome to FamilyGram, {{name}}',
      preview: 'Your account is ready',
      heading: 'Welcome, {{name}}!',
      intro: 'Your account has been created. Sign in and share your first photo.',
      cta: 'Open FamilyGram',
      footer: 'The family keeps its photos here — private, not on a public cloud.',
    },
  },

  zh: {
    dir: 'ltr',
    newPhoto: {
      subject: '📸 {{author}} 发布了新的{{kind}}',
      preview: '{{author}} 在 FamilyGram 分享了新内容',
      heading: '{{author}} 发布了新的{{kind}}',
      intro: '家庭相册中新增了一个瞬间。',
      kindPhoto: '照片',
      kindVideo: '视频',
      caption: '说明',
      location: '地点',
      duration: '时长',
      cta: '打开 FamilyGram',
      footer: '您收到此邮件是因为您是 FamilyGram 的管理员。',
    },
    invite: {
      subject: '💌 {{inviter}} 邀请您加入家庭相册',
      preview: '{{inviter}} 为您创建了账号',
      heading: '{{inviter}} 邀请您加入 FamilyGram',
      intro: '这是家庭的私人相册 —— 没有广告，没有陌生人。',
      detail: '注册邮箱：{{email}}',
      expires: '邀请将在 {{days}} 天后过期。',
      cta: '创建我的账号',
      fallback: '如果按钮无法使用，请打开此链接：',
      footer: '如果您未预期收到此邀请，忽略即可。',
    },
    reset: {
      subject: '🔑 重置 FamilyGram 密码',
      preview: '密码重置链接',
      heading: '重置密码',
      intro: '我们收到了为 {{username}} 重置密码的请求。',
      expires: '该链接仅可使用一次，{{minutes}} 分钟后失效。',
      cta: '设置新密码',
      fallback: '如果按钮无法使用，请打开此链接：',
      footer: '如果并非您本人操作，请忽略此邮件 —— 密码不会改变。',
    },
    welcome: {
      subject: '🎉 欢迎 {{name}} 加入 FamilyGram',
      preview: '您的账号已就绪',
      heading: '欢迎，{{name}}！',
      intro: '您的账号已创建。登录并分享第一张照片吧。',
      cta: '打开 FamilyGram',
      footer: '家人的照片保存在这里 —— 私密，不放在公共云上。',
    },
  },
};

/* ------------------------------- tiện ích --------------------------------- */

/** {{key}} → giá trị; thiếu thì để nguyên chuỗi rỗng. */
const fill = (template, vars = {}) =>
  String(template).replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => (vars[key] ?? ''));

/** Thoát ký tự HTML để chú thích ảnh không phá vỡ bố cục email. */
const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const copyFor = (locale) => COPY[normalizeLocale(locale)] || COPY.en;

/* ------------------------------ khung HTML -------------------------------- */

function layout({ dir, heading, body, ctaText, ctaUrl, footer, appName, preview }) {
  return `<!doctype html>
<html dir="${dir}"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <!-- dòng xem trước (ẩn trong nội dung) -->
  <div style="display:none;font-size:1px;color:${BRAND.bg};max-height:0;overflow:hidden;">${escapeHtml(preview)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:520px;background:#ffffff;border:1px solid ${BRAND.line};border-radius:14px;overflow:hidden;">

        <tr><td style="padding:20px 24px 8px;">
          <span style="font-size:20px;font-weight:700;background:linear-gradient(90deg,${BRAND.purple},${BRAND.pink},${BRAND.orange});
                       -webkit-background-clip:text;background-clip:text;color:${BRAND.pink};">${escapeHtml(appName)}</span>
        </td></tr>

        <tr><td style="padding:4px 24px 0;">
          <h1 style="margin:0;font-size:20px;line-height:1.35;color:${BRAND.ink};">${escapeHtml(heading)}</h1>
        </td></tr>

        <tr><td style="padding:12px 24px 0;color:${BRAND.ink};font-size:15px;line-height:1.6;">${body}</td></tr>

        ${
          ctaUrl
            ? `<tr><td style="padding:20px 24px 4px;">
                 <a href="${ctaUrl}" style="display:inline-block;padding:12px 22px;border-radius:10px;text-decoration:none;
                    color:#ffffff;font-weight:600;font-size:15px;
                    background:linear-gradient(90deg,${BRAND.purple},${BRAND.pink},${BRAND.orange});">${escapeHtml(ctaText)}</a>
               </td></tr>`
            : ''
        }

        <tr><td style="padding:16px 24px 24px;color:${BRAND.soft};font-size:12px;line-height:1.6;border-top:1px solid ${BRAND.line};">
          ${footer}
        </td></tr>
      </table>
      <p style="max-width:520px;margin:14px auto 0;color:${BRAND.soft};font-size:11px;text-align:center;">
        ${escapeHtml(appName)} · album riêng của gia đình
      </p>
    </td></tr>
  </table>
</body></html>`;
}

/** Khối "nếu nút không hoạt động…" + link dạng chữ (mọi email đều có). */
const fallbackLine = (text, url) =>
  `<p style="margin:14px 0 0;color:${BRAND.soft};font-size:12px;">${escapeHtml(text)}<br />
   <a href="${url}" style="color:${BRAND.pink};word-break:break-all;">${escapeHtml(url)}</a></p>`;

/* ------------------------------- các mẫu ---------------------------------- */

/**
 * Email báo quản trị viên có ảnh/video mới.
 * @param {object} payload { post, author, urls: { postUrl, imageUrl, appUrl } }
 * @param {string} locale  vi | en | zh
 */
function newPhotoEmail({ post, author, urls }, locale = 'vi') {
  const copy = copyFor(locale).newPhoto;
  const kind = post.isVideo?.() || post.mediaType === 'video' ? copy.kindVideo : copy.kindPhoto;

  const subject = fill(copy.subject, { author: author.fullName, kind });
  const heading = fill(copy.heading, { author: author.fullName, kind });

  const rows = [];
  if (post.caption) rows.push([copy.caption, post.caption]);
  if (post.location) rows.push([copy.location, post.location]);
  if (post.durationSeconds) rows.push([copy.duration, `${Math.round(post.durationSeconds)}s`]);

  const detailHtml = rows.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:12px;font-size:14px;color:${BRAND.ink};">
         ${rows
           .map(
             ([label, value]) =>
               `<tr><td style="padding:2px 10px 2px 0;color:${BRAND.soft};white-space:nowrap;">${escapeHtml(label)}</td>
                    <td style="padding:2px 0;">${escapeHtml(value)}</td></tr>`
           )
           .join('')}
       </table>`
    : '';

  const thumb = urls.imageUrl
    ? `<img src="${urls.imageUrl}" alt="" width="472" style="width:100%;max-width:472px;border-radius:10px;margin-top:14px;display:block;" />`
    : '';

  const body = `<p style="margin:0;">${escapeHtml(copy.intro)}</p>
    ${detailHtml}
    ${thumb}`;

  return {
    subject,
    html: layout({
      dir: copyFor(locale).dir,
      appName: 'FamilyGram',
      heading,
      body,
      ctaText: copy.cta,
      ctaUrl: urls.postUrl,
      footer: escapeHtml(copy.footer),
      preview: fill(copy.preview, { author: author.fullName }),
    }),
    text: [
      heading,
      '',
      copy.intro,
      ...rows.map(([label, value]) => `${label}: ${value}`),
      '',
      `${copy.cta}: ${urls.postUrl}`,
      '',
      copy.footer,
    ].join('\n'),
  };
}

/** Email mời thành viên mới — kèm link đăng ký có hạn. */
function inviteEmail({ invite, inviter, urls }, locale = 'vi') {
  const copy = copyFor(locale).invite;
  const vars = { inviter: inviter.fullName, email: invite.email, days: invite.ttlDays };

  const body = `<p style="margin:0;">${escapeHtml(copy.intro)}</p>
    <p style="margin:10px 0 0;color:${BRAND.soft};font-size:14px;">${escapeHtml(fill(copy.detail, vars))}</p>
    <p style="margin:6px 0 0;color:${BRAND.soft};font-size:14px;">${escapeHtml(fill(copy.expires, vars))}</p>
    ${fallbackLine(copy.fallback, urls.inviteUrl)}`;

  return {
    subject: fill(copy.subject, vars),
    html: layout({
      dir: copyFor(locale).dir,
      appName: 'FamilyGram',
      heading: fill(copy.heading, vars),
      body,
      ctaText: copy.cta,
      ctaUrl: urls.inviteUrl,
      footer: escapeHtml(copy.footer),
      preview: fill(copy.preview, vars),
    }),
    text: [
      fill(copy.heading, vars),
      '',
      copy.intro,
      fill(copy.detail, vars),
      fill(copy.expires, vars),
      '',
      copy.cta,
      urls.inviteUrl,
      '',
      copy.footer,
    ].join('\n'),
  };
}

/** Email đặt lại mật khẩu — token dùng một lần, hết hạn nhanh. */
function passwordResetEmail({ user, urls, minutes }, locale = 'vi') {
  const copy = copyFor(locale).reset;
  const vars = { username: user.username, minutes };

  const body = `<p style="margin:0;">${escapeHtml(fill(copy.intro, vars))}</p>
    <p style="margin:10px 0 0;color:${BRAND.soft};font-size:14px;">${escapeHtml(fill(copy.expires, vars))}</p>
    ${fallbackLine(copy.fallback, urls.resetUrl)}`;

  return {
    subject: copy.subject,
    html: layout({
      dir: copyFor(locale).dir,
      appName: 'FamilyGram',
      heading: copy.heading,
      body,
      ctaText: copy.cta,
      ctaUrl: urls.resetUrl,
      footer: escapeHtml(copy.footer),
      preview: copy.preview,
    }),
    text: [
      copy.heading,
      '',
      fill(copy.intro, vars),
      fill(copy.expires, vars),
      '',
      copy.cta,
      urls.resetUrl,
      '',
      copy.footer,
    ].join('\n'),
  };
}

/** Email chào mừng sau khi tài khoản được tạo. */
function welcomeEmail({ user, urls }, locale = 'vi') {
  const copy = copyFor(locale).welcome;
  const vars = { name: user.fullName || user.username };

  const body = `<p style="margin:0;">${escapeHtml(copy.intro)}</p>`;

  return {
    subject: fill(copy.subject, vars),
    html: layout({
      dir: copyFor(locale).dir,
      appName: 'FamilyGram',
      heading: fill(copy.heading, vars),
      body,
      ctaText: copy.cta,
      ctaUrl: urls.appUrl,
      footer: escapeHtml(copy.footer),
      preview: fill(copy.preview, vars),
    }),
    text: [fill(copy.heading, vars), '', copy.intro, '', copy.cta, urls.appUrl, '', copy.footer].join('\n'),
  };
}

module.exports = {
  newPhotoEmail,
  inviteEmail,
  passwordResetEmail,
  welcomeEmail,
  /** Dùng cho test: kiểm tra một ngôn ngữ có catalog riêng hay không. */
  hasLocale: (locale) => Boolean(COPY[normalizeLocale(locale)]),
  LOCALES: Object.keys(COPY),
};
