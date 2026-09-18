#!/usr/bin/env python3
"""Patch: bot Telegram gửi được video + khoá i18n cho Reels/Stories."""
import json
import pathlib
import sys

ROOT = pathlib.Path('/home/user/familygram')


def patch(rel, old, new, label):
    p = ROOT / rel
    s = p.read_text()
    if old not in s:
        print(f'❌ không thấy trong {rel}: {label}')
        sys.exit(1)
    p.write_text(s.replace(old, new, 1))
    print(f'✅ {rel} — {label}')


# ============ 1. telegram.service.js: gửi video cho Reels ====================
patch('backend/services/telegram.service.js',
      """  if (env.telegram.sendPhoto && absoluteFilePath) {
    try {
      await bot.sendPhoto(env.telegram.adminChatId, absoluteFilePath, {
        caption,
        parse_mode: 'HTML',
        reply_markup,
      });
      return true;
    } catch (error) {
      logger.warn(`sendPhoto failed, falling back to text: ${error.message}`);
    }
  }""",
      """  if (env.telegram.sendPhoto && absoluteFilePath) {
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
  }""",
      'gửi video qua Telegram')

# ============ 2. i18n backend: khoá mô tả media =============================
# Thêm khoá 'media' vào từng ngôn ngữ trong backend/i18n/messages.js
p = ROOT / 'backend/i18n/messages.js'
s = p.read_text()

inserts = {
    'vi': """      mediaVideo: '🎬 Video {{duration}} · {{views}} lượt xem',""",
    'en': """      mediaVideo: '🎬 Video {{duration}} · {{views}} views',""",
    'zh': """      mediaVideo: '🎬 视频 {{duration}} · {{views}} 次观看',""",
}

for lang, line in inserts.items():
    # chèn ngay sau dòng 'stats:' của ngôn ngữ tương ứng (theo thứ tự xuất hiện)
    marker = {
        'vi': "      stats: '❤️ {{likes}} · 💬 {{comments}}',",
        'en': "      stats: '❤️ {{likes}} · 💬 {{comments}}',",
        'zh': "      stats: '❤️ {{likes}} · 💬 {{comments}}',",
    }[lang]
    idx = s.index(marker)
    # tìm lần xuất hiện thứ n theo thứ tự ngôn ngữ
    order = ['vi', 'en', 'zh']
    position = order.index(lang)
    search_from = 0
    for _ in range(position + 1):
        idx = s.index(marker, search_from)
        search_from = idx + 1
    s = s[:idx] + line + '\n' + s[idx:]

p.write_text(s)
print('✅ backend/i18n/messages.js — thêm khoá mediaVideo (vi/en/zh)')

# Kiểm tra 3 ngôn ngữ vẫn khớp số khoá
sys.path.insert(0, str(ROOT / 'backend'))
print('   (kiểm tra cân bằng khoá sẽ chạy ở bước sau)')
