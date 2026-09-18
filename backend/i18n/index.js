'use strict';

/**
 * i18n/index.js
 * ---------------------------------------------------------------------------
 * API dịch phía server (không phụ thuộc thư viện ngoài):
 *
 *   const { t } = require('../i18n');
 *   t('vi', 'newPhoto.title')
 *   t('en', 'newPhoto.stats', { likes: 3, comments: 1 })
 *
 * Ngôn ngữ mặc định: 'vi'. Thiếu khoá ở ngôn ngữ phụ → tự động lùi về 'en'
 * rồi tới 'vi', nên không bao giờ hiện chuỗi rỗng.
 * ---------------------------------------------------------------------------
 */

const MESSAGES = require('./messages');
const { SUPPORTED, DEFAULT, normalizeLocale } = require('../utils/locale');

/** Lấy giá trị theo đường dẫn 'a.b.c'. */
const resolve = (source, path) =>
  path.split('.').reduce((node, key) => (node && node[key] !== undefined ? node[key] : undefined), source);

/** Thay {{biến}} — giữ nguyên định dạng HTML của Telegram. */
const interpolate = (template, vars) =>
  vars
    ? String(template).replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => (vars[key] ?? '') + '')
    : String(template);

/**
 * @param {string} locale  'vi' | 'en' | 'zh' (biến thể như vi-VN đều được)
 * @param {string} key     ví dụ 'newPhoto.title'
 * @param {object} [vars]  biến nội suy
 */
function t(locale, key, vars = {}) {
  const normalized = normalizeLocale(locale) || DEFAULT;

  const value =
    resolve(MESSAGES[normalized], key) ??
    resolve(MESSAGES.en, key) ??
    resolve(MESSAGES[DEFAULT], key) ??
    key;

  return typeof value === 'string' ? interpolate(value, vars) : value;
}

/** Tên bản địa của ngôn ngữ — dùng cho thông báo "/lang đã đổi". */
const LANGUAGE_NAMES = { vi: 'Tiếng Việt', en: 'English', zh: '中文' };

/**
 * Dịch khoá có chia số ít / số nhiều (dùng cho thông báo Telegram).
 *   tPlural('en', 'newPhoto.likes', 1)  → "1 like"
 *   tPlural('en', 'newPhoto.likes', 3)  → "3 likes"
 *   tPlural('vi', 'newPhoto.likes', 3)  → "3 lượt thích"   (tiếng Việt không biến đổi)
 */
function tPlural(locale, key, count, vars = {}) {
  const normalized = normalizeLocale(locale) || DEFAULT;
  let category = 'other';
  try {
    category = new Intl.PluralRules(normalized).select(Number(count));
  } catch {
    /* môi trường không hỗ trợ ICU đầy đủ → dùng 'other' */
  }

  const value =
    resolve(MESSAGES[normalized], `${key}.${category}`) ??
    resolve(MESSAGES[normalized], `${key}.other`) ??
    resolve(MESSAGES.en, `${key}.${category}`) ??
    resolve(MESSAGES.en, `${key}.other`);

  return value === undefined ? key : interpolate(value, { ...vars, count });
}

module.exports = {
  t,
  tPlural,
  MESSAGES,
  SUPPORTED,
  DEFAULT,
  LANGUAGE_NAMES,
  localeName: (locale) => LANGUAGE_NAMES[normalizeLocale(locale) || DEFAULT],
};
