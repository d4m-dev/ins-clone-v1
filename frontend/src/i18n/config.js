/**
 * src/i18n/config.js
 * ---------------------------------------------------------------------------
 * i18n configuration. Ngôn ngữ mặc định là TIẾNG VIỆT; English và 中文 là
 * ngôn ngữ phụ (secondary). Thêm ngôn ngữ mới = thêm 1 file JSON + 1 dòng ở đây.
 *
 * Mọi giá trị đều đọc từ biến môi trường Vite (xem frontend/.env.example):
 *   VITE_DEFAULT_LOCALE=vi
 *   VITE_SUPPORTED_LOCALES=vi,en,zh
 * ---------------------------------------------------------------------------
 */

/** Các locale được hỗ trợ, kèm tên hiển thị (endonym — luôn viết bằng chính ngôn ngữ đó). */
export const LOCALES = {
  vi: { code: 'vi', label: 'Tiếng Việt', short: 'VI', flag: '🇻🇳', dir: 'ltr' },
  en: { code: 'en', label: 'English', short: 'EN', flag: '🇬🇧', dir: 'ltr' },
  zh: { code: 'zh', label: '中文', short: 'ZH', flag: '🇨🇳', dir: 'ltr' },
};

const parseList = (value, fallback) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((code) => (LOCALES[code] ? code : null))
    .filter(Boolean)
    .concat(fallback)
    .filter((code, index, array) => array.indexOf(code) === index);

/** Thứ tự ưu tiên: vi (chính) → en → zh (phụ). */
export const SUPPORTED_LOCALES = parseList(import.meta.env.VITE_SUPPORTED_LOCALES, ['vi', 'en', 'zh']);

/** Ngôn ngữ mặc định — tiếng Việt. */
export const DEFAULT_LOCALE = LOCALES[import.meta.env.VITE_DEFAULT_LOCALE]
  ? String(import.meta.env.VITE_DEFAULT_LOCALE).toLowerCase()
  : 'vi';

/** Nơi lưu lựa chọn của người dùng. */
export const LOCALE_STORAGE_KEY = 'pixgram.locale';

/** Map mã ngôn ngữ của trình duyệt → locale của app. */
export const normalizeLocale = (value) => {
  const raw = String(value || '').toLowerCase();
  if (!raw) return DEFAULT_LOCALE;
  if (LOCALES[raw]) return raw;

  const base = raw.split('-')[0];
  if (LOCALES[base]) return base;

  // zh-Hans / zh-CN / zh-TW → zh ; vi-VN → vi ; en-US → en
  if (base === 'zh') return 'zh';
  if (base === 'vi') return 'vi';
  if (base === 'en') return 'en';

  return DEFAULT_LOCALE;
};

/** Đọc lựa chọn đã lưu, nếu chưa có thì suy ra từ trình duyệt. */
export const detectInitialLocale = () => {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && LOCALES[normalizeLocale(stored)]) return normalizeLocale(stored);
  } catch {
    /* chế độ riêng tư */
  }

  const candidates = [navigator.language, ...(navigator.languages || [])];
  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate);
    if (SUPPORTED_LOCALES.includes(normalized)) return normalized;
  }
  return DEFAULT_LOCALE;
};
