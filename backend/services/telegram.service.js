'use strict';

/**
 * services/telegram.service.js
 * ---------------------------------------------------------------------------
 * Bot Telegram chạy TRONG CÙNG process với API (khởi động từ server.js).
 *
 * Nhiệm vụ
 *   • thông báo cho admin mỗi khi thành viên đăng ảnh mới;
 *   • lệnh tiện dụng: /start /help /id /status /lang;
 *   • suy giảm an toàn: thiếu token hoặc Telegram lỗi thì API vẫn chạy bình
 *     thường, chỉ ghi cảnh báo.
 *
 * ĐA NGÔN NGỮ (vi · en · zh):
 *   • nội dung thông báo lấy từ ../i18n (mặc định tiếng Việt);
 *   • admin đổi ngôn ngữ ngay trong chat bằng /lang en hoặc /lang zh;
 *   • mỗi thành viên đăng ảnh được thông báo theo ngôn ngữ của chính họ
 *     (User.locale → Accept-Language → TELEGRAM_DEFAULT_LOCALE).
 *
 * Mọi URL đều lấy từ config/urls.js — không hardcode ở đâu cả.
 * ---------------------------------------------------------------------------
 */

const path = require('path');
const { env } = require('../config/env');
const urls = require('../config/urls');
const logger = require('../utils/logger');
const { DEFAULT: DEFAULT_LOCALE, normalizeLocale } = require('../utils/locale');
const { t, tPlural, localeName } = require('../i18n');

let TelegramBot = null;
let bot = null;
let botUsername = null;
let starting = false;

/** Ngôn ngữ thông báo của admin — khởi tạo từ .env, đổi được bằng /lang. */
let adminLocale = DEFAULT_LOCALE;

const escapeHtml = (value = '') =>
  String(value).replace(/[<>&]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char]));

function isReady() {
  return Boolean(bot) && env.telegram.enabled && Boolean(env.telegram.adminChatId);
}

/**
 * Khởi động bot. Được gọi một lần từ server.js — không await như phụ thuộc
 * cứng, nên Telegram có sập cũng không làm chậm HTTP server.
 */
async function startTelegramBot() {
  if (!env.telegram.enabled || !env.telegram.token) {
    logger.warn('Telegram bot disabled (TELEGRAM_ENABLED=false or TELEGRAM_BOT_TOKEN empty).');
    return null;
  }
  if (bot || starting) return bot;
  starting = true;

  try {
    TelegramBot = TelegramBot || require('node-telegram-bot-api');
    bot = new TelegramBot(env.telegram.token, {
      polling: { interval: 1500, autoStart: true, params: { timeout: 30 } },
    });
    starting = false;

    bot.on('polling_error', (error) => logger.warn(`Telegram polling error: ${error.message}`));
    bot.on('error', (error) => logger.warn(`Telegram error: ${error.message}`));

    /* ------------------------------ lệnh ------------------------------ */
    bot.onText(/^\/(start|help)\b/, (msg) => {
      const locale = localeForChat(msg.chat.id);
      return bot.sendMessage(msg.chat.id, t(locale, 'bot.help'), { parse_mode: 'HTML' });
    });

    bot.onText(/^\/id\b/, (msg) =>
      bot.sendMessage(
        msg.chat.id,
        t(localeForChat(msg.chat.id), 'bot.chatId', { chatId: msg.chat.id }),
        { parse_mode: 'HTML' }
      )
    );

    bot.onText(/^\/status\b/, async (msg) => {
      const locale = localeForChat(msg.chat.id);
      const uptime = Math.floor(process.uptime());
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);

      await bot.sendMessage(
        msg.chat.id,
        [
          t(locale, 'bot.statusTitle'),
          t(locale, 'bot.uptime', { hours, minutes }),
          `API: ${urls.base}`,
          `Admin: ${urls.admin.dashboard}`,
        ].join('\n'),
        { parse_mode: 'HTML' }
      );
    });

    /** /lang vi | /lang en | /lang zh — đổi ngôn ngữ thông báo của admin. */
    bot.onText(/^\/lang(?:\s+(\S+))?/, async (msg, match) => {
      const requested = normalizeLocale(match?.[1]);

      if (!match?.[1]) {
        return bot.sendMessage(msg.chat.id, t(adminLocale, 'bot.languageUsage'), { parse_mode: 'HTML' });
      }
      if (!requested) {
        return bot.sendMessage(msg.chat.id, t(adminLocale, 'bot.languageInvalid'), { parse_mode: 'HTML' });
      }

      adminLocale = requested;
      return bot.sendMessage(
        msg.chat.id,
        t(adminLocale, 'bot.languageChanged', { language: localeName(adminLocale) }),
        { parse_mode: 'HTML' }
      );
    });

    const me = await bot.getMe();
    botUsername = me.username;
    logger.success(`Telegram bot online as @${me.username} (locale: ${adminLocale})`);

    await notifyAdmin(
      `${t(adminLocale, 'startup')}\nAPI: ${urls.base}\nAdmin: ${urls.admin.dashboard}`,
      { locale: adminLocale }
    );
    return bot;
  } catch (error) {
    starting = false;
    logger.error(`Telegram bot could not start: ${error.message}`);
    bot = null;
    return null;
  }
}

/** Ngôn ngữ của một chat: admin dùng biến adminLocale, người khác dùng mặc định. */
function localeForChat(chatId) {
  return String(chatId) === String(env.telegram.adminChatId) ? adminLocale : DEFAULT_LOCALE;
}

/**
 * Gửi tin nhắn tới admin.
 * @param {string} html    nội dung đã dịch (HTML của Telegram)
 * @param {object} [options] { locale, reply_markup, … }
 */
async function notifyAdmin(html, options = {}) {
  if (!isReady()) return false;
  const { locale, ...rest } = options;

  try {
    await bot.sendMessage(env.telegram.adminChatId, html, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...rest,
    });
    return true;
  } catch (error) {
    logger.warn(`Telegram notification failed: ${error.message}`);
    return false;
  }
}

/**
 * Thông báo "ảnh mới". Gửi kèm chính tấm ảnh khi TELEGRAM_SEND_PHOTO=true,
 * nếu không thì gửi văn bản có liên kết xem ảnh.
 *
 * @param {object} post    instance Post (đã eager-load author)
 * @param {object} author  instance User (người đăng)
 * @param {string} absoluteFilePath  đường dẫn file trên máy (có thể null)
 */
async function notifyNewPhoto(post, author, absoluteFilePath = null) {
  if (!isReady()) return false;

  // Ngôn ngữ: ưu tiên của người đăng → của admin → mặc định.
  const locale = normalizeLocale(author?.locale) || adminLocale || DEFAULT_LOCALE;
  const languageName = localeName(locale);

  const caption = [
    t(locale, 'newPhoto.title'),
    '',
    t(locale, 'newPhoto.author', {
      fullName: escapeHtml(author?.fullName || '—'),
      username: escapeHtml(author?.username || '?'),
    }),
    post.caption ? `“${escapeHtml(post.caption)}”` : t(locale, 'newPhoto.noCaption'),
    '',
    t(locale, 'newPhoto.stats', {
      likes: tPlural(locale, 'newPhoto.likes', post.likeCount ?? 0),
      comments: tPlural(locale, 'newPhoto.comments', post.commentCount ?? 0),
    }),
    `🔗 ${urls.frontend.post(post.id)}`,
  ].join('\n');

  const reply_markup = {
    inline_keyboard: [
      [
        { text: t(locale, 'buttons.openAlbum'), url: urls.frontend.home },
        { text: t(locale, 'buttons.adminPanel'), url: urls.admin.dashboard },
      ],
      [{ text: t(locale, 'buttons.userList'), url: `${urls.admin.dashboard}/resources/User` }],
    ],
  };

  if (env.telegram.sendPhoto && absoluteFilePath) {
    const isVideo = typeof post.isVideo === 'function' ? post.isVideo() : post.mediaType === 'video';
    try {
      // Reels → sendVideo; ảnh → sendPhoto. Video nhỏ hơn 50MB là Telegram nhận trực tiếp.
      if (isVideo) {
        await bot.sendVideo(env.telegram.adminChatId, absoluteFilePath, {
          caption,
          parse_mode: 'HTML',
          reply_markup,
          supports_streaming: true,
        });
      } else {
        await bot.sendPhoto(env.telegram.adminChatId, absoluteFilePath, {
          caption,
          parse_mode: 'HTML',
          reply_markup,
        });
      }
      return true;
    } catch (error) {
      logger.warn(`send${isVideo ? 'Video' : 'Photo'} failed, falling back to text: ${error.message}`);
    }
  }

  return notifyAdmin(caption, { locale, reply_markup });
}

/** Thông báo có bình luận mới (gửi cho admin, theo ngôn ngữ của chủ ảnh). */
async function notifyNewComment({ authorName, photoOwner, body, locale }) {
  if (!isReady()) return false;
  const targetLocale = normalizeLocale(locale) || adminLocale || DEFAULT_LOCALE;

  return notifyAdmin(
    t(targetLocale, 'newComment', {
      author: escapeHtml(authorName || '—'),
      photoOwner: escapeHtml(photoOwner || '—'),
      body: escapeHtml(String(body || '').slice(0, 200)),
    }),
    { locale: targetLocale }
  );
}

/** Thông báo thành viên mới (dùng khi đăng ký). */
async function notifyNewMember(user) {
  const locale = normalizeLocale(user?.locale) || adminLocale || DEFAULT_LOCALE;
  return notifyAdmin(
    `${t(locale, 'newMember', { fullName: escapeHtml(user?.fullName), username: escapeHtml(user?.username) })}\n` +
      `${urls.admin.dashboard}/resources/User`,
    { locale }
  );
}

/** Thông báo tài khoản quản trị đầu tiên được tạo. */
async function notifyFirstUser(user) {
  const locale = normalizeLocale(user?.locale) || adminLocale || DEFAULT_LOCALE;
  return notifyAdmin(t(locale, 'firstUser', { username: escapeHtml(user?.username) }), { locale });
}

/** Gọi từ server.js khi tắt máy. */
function stopTelegramBot() {
  if (!bot) return;
  try {
    bot.stopPolling({ cancel: true });
    logger.info('Telegram bot stopped.');
  } catch (error) {
    logger.warn(`Telegram shutdown warning: ${error.message}`);
  } finally {
    bot = null;
  }
}

module.exports = {
  startTelegramBot,
  stopTelegramBot,
  notifyAdmin,
  notifyNewPhoto,
  notifyNewComment,
  notifyNewMember,
  notifyFirstUser,
  isReady,
  getBotUsername: () => botUsername,
  getAdminLocale: () => adminLocale,
  setAdminLocale: (locale) => {
    adminLocale = normalizeLocale(locale) || DEFAULT_LOCALE;
    return adminLocale;
  },
  getUploadPathFor: (filename) => path.join(process.cwd(), env.uploads.dir, 'posts', filename),
};
