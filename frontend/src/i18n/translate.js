/**
 * src/i18n/translate.js
 * ---------------------------------------------------------------------------
 * Hàm dịch thuần tuý (không phụ thuộc React) để cả các module ngoài component
 * — ví dụ src/api/client.js — cũng dịch được thông báo lỗi.
 *
 * Hỗ trợ:
 *   translate(locale, 'feed.empty.title')
 *   translate(locale, 'upload.tooLarge', { max: 15 })        → nội suy {{max}}
 *   translate(locale, 'post.likes', { count: 3 })            → số ít / số nhiều
 * ---------------------------------------------------------------------------
 */

import vi from './locales/vi.json';
import en from './locales/en.json';
import zh from './locales/zh.json';
import { DEFAULT_LOCALE, LOCALES, normalizeLocale } from './config.js';

export const MESSAGES = { vi, en, zh };

/** Locale hiện tại cho các module không phải React (api client, utils). */
let currentLocale = DEFAULT_LOCALE;
export const getLocale = () => currentLocale;
export const setCurrentLocale = (locale) => {
  currentLocale = normalizeLocale(locale);
  return currentLocale;
};

/** Truy cập khoá lồng nhau: 'post.likes.one' → messages.post.likes.one */
function resolvePath(source, path) {
  return path.split('.').reduce((node, key) => (node && node[key] !== undefined ? node[key] : undefined), source);
}

/** Thay {{biến}} bằng giá trị tương ứng. */
export function interpolate(template, vars) {
  if (!vars) return template;
  return String(template).replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) =>
    vars[key] === undefined || vars[key] === null ? '' : String(vars[key])
  );
}

/**
 * Dịch một khoá.
 * @param {string} locale
 * @param {string} key       khoá dạng "nhom.muc"
 * @param {object} [vars]    biến nội suy (có thể chứa `count` để chia số ít/số nhiều)
 * @param {string} [fallback] giá trị dự phòng khi thiếu khoá
 */
export function translate(locale, key, vars = {}, fallback = null) {
  const normalized = LOCALES[normalizeLocale(locale)] ? normalizeLocale(locale) : DEFAULT_LOCALE;
  const dictionary = MESSAGES[normalized] || MESSAGES[DEFAULT_LOCALE];
  const english = MESSAGES.en;

  let value;

  // 1) Số ít / số nhiều: khoá con `one` / `other` (Intl.PluralRules).
  if (vars && vars.count !== undefined && vars.count !== null) {
    const category = new Intl.PluralRules(normalized).select(Number(vars.count));
    value =
      resolvePath(dictionary, `${key}.${category}`) ??
      resolvePath(dictionary, `${key}.other`) ??
      resolvePath(english, `${key}.${category}`) ??
      resolvePath(english, `${key}.other`);
  }

  // 2) Khoá dạng chuỗi thông thường (có fallback sang tiếng Anh rồi mặc định).
  if (value === undefined) value = resolvePath(dictionary, key);
  if (value === undefined) value = resolvePath(english, key);
  if (value === undefined) value = fallback ?? key;

  return typeof value === 'string' ? interpolate(value, vars) : value;
}

/* ----------------------- Định dạng theo từng locale ----------------------- */

/** 1 200 → "1,2 N" (vi) · "1.2K" (en) · "1.2万" (zh) */
export function formatNumber(locale, value, { compact = false } = {}) {
  const normalized = normalizeLocale(locale);
  try {
    return new Intl.NumberFormat(normalized, compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}).format(
      Number(value || 0)
    );
  } catch {
    return String(value);
  }
}

/** "3 giờ trước" · "3 hours ago" · "3小时前" */
export function formatRelativeTime(locale, input, { style = 'long' } = {}) {
  const normalized = normalizeLocale(locale);
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absolute = Math.abs(diffSeconds);
  const units = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
    ['second', 1],
  ];
  const [unit, secondsInUnit] = units.find(([, seconds]) => absolute >= seconds) || ['second', 1];

  try {
    return new Intl.RelativeTimeFormat(normalized, { numeric: 'auto', style }).format(
      Math.round(diffSeconds / secondsInUnit),
      unit
    );
  } catch {
    return '';
  }
}
