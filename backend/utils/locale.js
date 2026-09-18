'use strict';

/**
 * utils/locale.js
 * ---------------------------------------------------------------------------
 * Phát hiện ngôn ngữ của người dùng từ nhiều nguồn, theo thứ tự ưu tiên:
 *
 *   1. header `Accept-Language` do frontend gửi (đã theo lựa chọn trên UI)
 *   2. trường `locale` của tài khoản (nếu đã lưu trong DB)
 *   3. query `?lang=vi|en|zh` (tiện cho bot/link chia sẻ)
 *   4. TELEGRAM_DEFAULT_LOCALE trong .env
 *   5. 'vi' — ngôn ngữ mặc định của gia đình
 * ---------------------------------------------------------------------------
 */

const { env } = require('../config/env');

const SUPPORTED = ['vi', 'en', 'zh'];
const DEFAULT = SUPPORTED.includes(env.telegram.defaultLocale) ? env.telegram.defaultLocale : 'vi';

/** Chuẩn hoá mọi biến thể thành 'vi' | 'en' | 'zh'. */
function normalizeLocale(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (SUPPORTED.includes(raw)) return raw;

  const base = raw.split(/[-_;,]/)[0];
  if (SUPPORTED.includes(base)) return base;
  if (base === 'zh' || raw.includes('zh') || raw.includes('cn') || raw.includes('hans') || raw.includes('hant')) return 'zh';
  if (base === 'vi' || raw.includes('vn')) return 'vi';
  if (base === 'en') return 'en';
  return null;
}

/** Lấy ngôn ngữ ưu tiên đầu tiên từ header Accept-Language. */
function fromHeader(header) {
  if (!header) return null;
  // "vi-VN,vi;q=0.9,en-US;q=0.8" → kiểm tra theo thứ tự trọng số
  const candidates = String(header)
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((param) => param.trim().startsWith('q='));
      return { tag: tag.trim(), quality: q ? Number.parseFloat(q.split('=')[1]) || 0 : 1 };
    })
    .sort((a, b) => b.quality - a.quality);

  for (const candidate of candidates) {
    const locale = normalizeLocale(candidate.tag);
    if (locale) return locale;
  }
  return null;
}

/**
 * @param {object} req     Express request (có thể thiếu)
 * @param {object} [user]  instance User (có thể thiếu)
 */
function resolveLocale(req, user = null) {
  const header = req?.headers?.['accept-language'];
  return (
    fromHeader(header) ||
    normalizeLocale(user?.locale) ||
    normalizeLocale(req?.query?.lang) ||
    DEFAULT
  );
}

/** Đặt ngôn ngữ vào req để các middleware sau dùng lại. */
function localeMiddleware(req, _res, next) {
  req.locale = resolveLocale(req);
  next();
}

module.exports = {
  SUPPORTED,
  DEFAULT,
  normalizeLocale,
  fromHeader,
  resolveLocale,
  localeMiddleware,
};
