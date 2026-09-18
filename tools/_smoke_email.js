#!/usr/bin/env node
'use strict';

/**
 * tools/_smoke_email.js — kiểm tra nội dung email (không gửi thật).
 * Vì templates là hàm thuần, ta kiểm tra trực tiếp: ngôn ngữ, biến nội suy,
 * chống XSS, và URL trong nút bấm.
 *
 *   node tools/_smoke_email.js
 */

const path = require('node:path');

const BACKEND = path.resolve(__dirname, '..', 'backend');
const templates = require(path.join(BACKEND, 'services/email.templates'));

const results = [];
let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
};

/* --------------------------- dữ liệu giả lập ------------------------------ */
const author = { id: 1, username: 'minh.nguyen', fullName: 'Minh Nguyễn', email: 'minh@congdong.local', locale: 'vi' };
const post = {
  id: 7,
  caption: 'Bữa cơm tối <script>alert(1)</script>',
  location: 'Chư Ty, Gia Lai',
  durationSeconds: 5.76,
  imageFilename: 'demo-1.jpg',
  isVideo: () => true,
  mediaType: 'video',
};
const urls = {
  postUrl: 'https://ins-clone-v1.vercel.app/p/7',
  imageUrl: 'https://api.d4mdev.click/uploads/posts/demo-1.jpg',
  appUrl: 'https://ins-clone-v1.vercel.app',
};

/* ------------------------------- 1. đa ngôn ngữ --------------------------- */
for (const locale of ['vi', 'en', 'zh']) {
  const mail = templates.newPhotoEmail({ post, author, urls }, locale);
  check(`[${locale}] có chủ đề + HTML + bản text`, Boolean(mail.subject && mail.html && mail.text));
  check(`[${locale}] chứa tên người đăng`, mail.subject.includes('Minh Nguyễn'), mail.subject);
  check(`[${locale}] có nút mở bài viết`, mail.html.includes(urls.postUrl));
}

check('vi · nói "video"', templates.newPhotoEmail({ post, author, urls }, 'vi').text.includes('video'));
check('en · nói "video"', templates.newPhotoEmail({ post, author, urls }, 'en').html.includes('video'));
check('zh · nói "视频"', templates.newPhotoEmail({ post, author, urls }, 'zh').html.includes('视频'));

const photo = { ...post, isVideo: () => false, mediaType: 'photo' };
check(
  'Bài ảnh dùng chữ "ảnh"/"photo"/"照片"',
  templates.newPhotoEmail({ post: photo, author, urls }, 'vi').subject.includes('ảnh') &&
    templates.newPhotoEmail({ post: photo, author, urls }, 'en').subject.includes('photo') &&
    templates.newPhotoEmail({ post: photo, author, urls }, 'zh').subject.includes('照片')
);

/* ------------------------------ 2. chống XSS ------------------------------ */
const html = templates.newPhotoEmail({ post, author, urls }, 'vi').html;
check('Chú thích chứa <script> đã bị thoát HTML', !html.includes('<script>alert(1)</script>') && html.includes('&lt;script&gt;'));

/* ------------------------------- 3. lời mời ------------------------------- */
const inviteMail = templates.inviteEmail(
  {
    invite: { email: 'ban.moi@congdong.local', role: 'member', ttlDays: 7, rawToken: 'TOKEN123456' },
    inviter: author,
    urls: { inviteUrl: 'https://ins-clone-v1.vercel.app/register?invite=TOKEN123456' },
  },
  'vi'
);
check('Lời mời: nêu tên người mời', inviteMail.subject.includes('Minh Nguyễn'), inviteMail.subject);
check('Lời mời: hiện email đăng ký', inviteMail.html.includes('ban.moi@congdong.local'));
check('Lời mời: nêu số ngày hết hạn', inviteMail.html.includes('7 ngày'));
check('Lời mời: link có token', inviteMail.html.includes('invite=TOKEN123456'));

/* --------------------------- 4. đặt lại mật khẩu -------------------------- */
const resetMail = templates.passwordResetEmail(
  { user: { username: 'minh.nguyen' }, urls: { resetUrl: 'https://ins-clone-v1.vercel.app/reset-password?token=ABC' }, minutes: 30 },
  'vi'
);
check('Reset: nêu tên đăng nhập', resetMail.html.includes('minh.nguyen'));
check('Reset: nêu hạn 30 phút', resetMail.html.includes('30 phút'));
check('Reset: có link token', resetMail.html.includes('token=ABC'));
check('Reset: nhắc "không phải bạn thì bỏ qua"', resetMail.text.includes('bỏ qua'));

/* ------------------------------- 5. chào mừng ----------------------------- */
const welcome = templates.welcomeEmail({ user: { fullName: 'Minh Nguyễn', username: 'minh.nguyen' }, urls }, 'en');
check('Chào mừng: có tên đầy đủ', welcome.subject.includes('Minh Nguyễn'), welcome.subject);

/* --------------------- 6. ngôn ngữ lạ → rơi về tiếng Anh ------------------ */
const unknown = templates.newPhotoEmail({ post, author, urls }, 'fr');
check('Ngôn ngữ không hỗ trợ → dùng bản tiếng Anh', unknown.subject.includes('just posted'), unknown.subject);

console.log(results.join('\n'));
console.log(`\n${failures === 0 ? '🎉 TẤT CẢ ĐỀU ĐẠT' : `⚠️  ${failures} phép thử thất bại`}  (${results.length} phép thử)`);
process.exit(failures === 0 ? 0 : 1);
