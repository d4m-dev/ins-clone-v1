'use strict';

/**
 * i18n/messages.js
 * ---------------------------------------------------------------------------
 * Kho thông điệp phía server — dùng cho bot Telegram, log quan trọng và thông
 * báo lỗi trả về API. Ngôn ngữ chính là TIẾNG VIỆT, phụ là English và 中文.
 *
 * Thêm ngôn ngữ mới: sao chép khối 'en' và dịch — không cần đụng tới logic.
 * ---------------------------------------------------------------------------
 */

module.exports = {
  /* ------------------------------- VIỆT -------------------------------- */
  vi: {
    bot: {
      help: [
        '👨‍👩‍👧‍👦 <b>Bot FamilyGram</b>',
        '',
        'Bot này thông báo cho bạn mỗi khi có ảnh mới trong album gia đình.',
        '',
        '/id — xem chat id (dán vào TELEGRAM_ADMIN_CHAT_ID)',
        '/status — kiểm tra tình trạng máy chủ',
        '/lang vi|en|zh — đổi ngôn ngữ thông báo',
      ].join('\n'),
      chatId: 'Chat id của bạn: <code>{{chatId}}</code>',
      statusTitle: '✅ <b>Máy chủ FamilyGram đang chạy</b>',
      uptime: 'Thời gian chạy: {{hours}}g {{minutes}}p',
      languageChanged: '✅ Đã đổi ngôn ngữ thông báo sang <b>{{language}}</b>.',
      languageUsage: 'Cách dùng: <code>/lang vi</code> · <code>/lang en</code> · <code>/lang zh</code>',
      languageInvalid: 'Mã ngôn ngữ không hợp lệ. Chỉ hỗ trợ: vi, en, zh.',
    },

    startup: '🚀 <b>Máy chủ FamilyGram đã khởi động</b>',
    firstUser:
      '👑 <b>FamilyGram đã được khởi tạo</b>\nTài khoản đầu tiên <b>@{{username}}</b> được tạo với quyền <b>quản trị viên</b>.',
    newMember: '🆕 <b>Thành viên mới tham gia</b>\n{{fullName}} (@{{username}})',

    /* ------------------- Thông báo API trả về giao diện ------------------- */
    api: {
      forgotSent:
        'Nếu email này có tài khoản, chúng tôi đã gửi liên kết đặt lại mật khẩu. Hãy kiểm tra hộp thư (cả mục Spam).',
      resetInvalid: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
      resetDone: 'Mật khẩu đã được đổi. Hãy đăng nhập bằng mật khẩu mới.',
      inviteInvalid: 'Lời mời không hợp lệ.',
      inviteUsed: 'Lời mời đã hết hạn hoặc đã được sử dụng.',
      inviteNotFound: 'Liên kết mời không tồn tại hoặc đã bị thu hồi.',
      inviteCannotRevoke: 'Lời mời này đã được chấp nhận — không thu hồi được nữa.',
      inviteEmailTaken: '{{email}} đã có tài khoản (@{{username}}).',
      emailTaken: 'Email này đã được dùng cho một tài khoản khác.',
      usernameTaken: 'Tên đăng nhập này đã có người dùng.',
      mediaRequired: 'Cần ít nhất một ảnh ("image") hoặc một video ("video").',
    },
    newPhoto: {
      title: '📸 <b>Ảnh mới trong album gia đình</b>',
      author: 'Người đăng: <b>{{fullName}}</b> (@{{username}})',
      noCaption: '<i>không có chú thích</i>',
      mediaVideo: '🎬 Video {{duration}} · {{views}} lượt xem',
      stats: '❤️ {{likes}} · 💬 {{comments}}',
      likes: { one: '{{count}} lượt thích', other: '{{count}} lượt thích' },
      comments: { one: '{{count}} bình luận', other: '{{count}} bình luận' },
    },

    newComment:
      '💬 <b>Bình luận mới</b>\n<b>{{author}}</b> bình luận về ảnh của {{photoOwner}}:\n“{{body}}”',

    buttons: {
      openAlbum: '🖼 Mở album',
      adminPanel: '🛠 Trang quản trị',
      viewPost: '👀 Xem ảnh này',
      userList: 'Quản lý thành viên',
    },
  },

  /* ------------------------------- ENGLISH ----------------------------- */
  en: {
    bot: {
      help: [
        '👨‍👩‍👧‍👦 <b>FamilyGram bot</b>',
        '',
        'This bot notifies you whenever a new photo lands in the family album.',
        '',
        '/id — show this chat id (put it in TELEGRAM_ADMIN_CHAT_ID)',
        '/status — backend health',
        '/lang vi|en|zh — change the notification language',
      ].join('\n'),
      chatId: 'Your chat id: <code>{{chatId}}</code>',
      statusTitle: '✅ <b>FamilyGram backend is alive</b>',
      uptime: 'Uptime: {{hours}}h {{minutes}}m',
      languageChanged: '✅ Notification language switched to <b>{{language}}</b>.',
      languageUsage: 'Usage: <code>/lang en</code> · <code>/lang vi</code> · <code>/lang zh</code>',
      languageInvalid: 'Unsupported language code. Allowed: vi, en, zh.',
    },

    startup: '🚀 <b>FamilyGram backend started</b>',
    firstUser:
      '👑 <b>FamilyGram initialised</b>\nThe first account <b>@{{username}}</b> was created as <b>admin</b>.',
    newMember: '🆕 <b>New family member joined</b>\n{{fullName}} (@{{username}})',

    /* ---------------------- API messages (frontend) ---------------------- */
    api: {
      forgotSent:
        "If this e-mail has an account, we've sent a password reset link. Please check your inbox (and the Spam folder).",
      resetInvalid: 'This password reset link is invalid or has expired.',
      resetDone: 'Your password has been changed. Please sign in with the new one.',
      inviteInvalid: 'This invitation is not valid.',
      inviteUsed: 'This invitation has expired or was already used.',
      inviteNotFound: 'This invitation link does not exist or has been revoked.',
      inviteCannotRevoke: 'This invitation was already accepted — it can no longer be revoked.',
      inviteEmailTaken: '{{email}} already has an account (@{{username}}).',
      emailTaken: 'That e-mail is already used by another account.',
      usernameTaken: 'That username is already taken.',
      mediaRequired: 'At least one image ("image") or one video ("video") is required.',
    },
    newPhoto: {
      title: '📸 <b>New photo in the family album</b>',
      author: 'By <b>{{fullName}}</b> (@{{username}})',
      noCaption: '<i>no caption</i>',
      mediaVideo: '🎬 Video {{duration}} · {{views}} views',
      stats: '❤️ {{likes}} · 💬 {{comments}}',
      likes: { one: '{{count}} like', other: '{{count}} likes' },
      comments: { one: '{{count}} comment', other: '{{count}} comments' },
    },

    newComment: '💬 <b>New comment</b>\n<b>{{author}}</b> commented on a photo by {{photoOwner}}:\n“{{body}}”',

    buttons: {
      openAlbum: '🖼 Open album',
      adminPanel: '🛠 Admin panel',
      viewPost: '👀 View photo',
      userList: 'Manage members',
    },
  },

  /* --------------------------------- 中文 ------------------------------ */
  zh: {
    bot: {
      help: [
        '👨‍👩‍👧‍👦 <b>FamilyGram 机器人</b>',
        '',
        '家庭相册有新照片时，这个机器人会通知你。',
        '',
        '/id — 查看本聊天 id（填入 TELEGRAM_ADMIN_CHAT_ID）',
        '/status — 查看服务器状态',
        '/lang vi|en|zh — 切换通知语言',
      ].join('\n'),
      chatId: '你的聊天 id：<code>{{chatId}}</code>',
      statusTitle: '✅ <b>FamilyGram 服务运行中</b>',
      uptime: '运行时间：{{hours}} 小时 {{minutes}} 分',
      languageChanged: '✅ 通知语言已切换为 <b>{{language}}</b>。',
      languageUsage: '用法：<code>/lang zh</code> · <code>/lang vi</code> · <code>/lang en</code>',
      languageInvalid: '不支持的语言代码，仅支持：vi、en、zh。',
    },

    startup: '🚀 <b>FamilyGram 服务已启动</b>',
    firstUser: '👑 <b>FamilyGram 初始化完成</b>\n第一个账号 <b>@{{username}}</b> 已被设为 <b>管理员</b>。',
    newMember: '🆕 <b>新家庭成员加入</b>\n{{fullName}} (@{{username}})',

    /* --------------------- 前端显示的错误与提示 --------------------- */
    api: {
      forgotSent: '如果该邮箱已注册，我们已发送密码重置链接。请查收邮件（包括垃圾邮件）。',
      resetInvalid: '密码重置链接无效或已过期。',
      resetDone: '密码已修改，请用新密码登录。',
      inviteInvalid: '邀请无效。',
      inviteUsed: '邀请已过期或已被使用。',
      inviteNotFound: '邀请链接不存在或已被撤销。',
      inviteCannotRevoke: '该邀请已被接受，无法再撤销。',
      inviteEmailTaken: '{{email}} 已有账号（@{{username}}）。',
      emailTaken: '该邮箱已被其他账号使用。',
      usernameTaken: '该用户名已被使用。',
      mediaRequired: '至少需要一张图片（"image"）或一个视频（"video"）。',
    },
    newPhoto: {
      title: '📸 <b>家庭相册有新照片</b>',
      author: '发布者：<b>{{fullName}}</b> (@{{username}})',
      noCaption: '<i>没有文字说明</i>',
      mediaVideo: '🎬 视频 {{duration}} · {{views}} 次观看',
      stats: '❤️ {{likes}} · 💬 {{comments}}',
      likes: { one: '{{count}} 个赞', other: '{{count}} 个赞' },
      comments: { one: '{{count}} 条评论', other: '{{count}} 条评论' },
    },

    newComment: '💬 <b>新评论</b>\n<b>{{author}}</b> 评论了 {{photoOwner}} 的照片：\n“{{body}}”',

    buttons: {
      openAlbum: '🖼 打开相册',
      adminPanel: '🛠 管理后台',
      viewPost: '👀 查看照片',
      userList: '管理成员',
    },
  },
};
