/**
 * src/i18n/I18nContext.jsx
 * ---------------------------------------------------------------------------
 * Provider giữ ngôn ngữ hiện tại + hook `useI18n()` cho toàn bộ app.
 *
 *   const { t, locale, setLocale, timeAgo, number } = useI18n();
 *   t('feed.empty.title')
 *   t('post.likes', { count: 3 })
 *   timeAgo(post.createdAt)      → "3 giờ trước" / "3 hours ago" / "3小时前"
 *   number(post.likeCount)       → "1,2 N" / "1.2K" / "1.2万"
 *
 * Đổi ngôn ngữ sẽ:
 *   • lưu vào localStorage (nhớ cho lần sau)
 *   • cập nhật <html lang="…"> (tốt cho SEO/trình đọc màn hình)
 *   • đồng bộ locale cho các module ngoài React (api/client.js, utils/format.js)
 * ---------------------------------------------------------------------------
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, LOCALES, SUPPORTED_LOCALES, detectInitialLocale, normalizeLocale } from './config.js';
import { formatNumber, formatRelativeTime, setCurrentLocale, translate } from './translate.js';

const I18nContext = createContext(null);

export function I18nProvider({ children, initialLocale }) {
  const [locale, setLocaleState] = useState(() => normalizeLocale(initialLocale) || detectInitialLocale());

  /** Đồng bộ mọi thứ phụ thuộc vào locale. */
  useEffect(() => {
    setCurrentLocale(locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = LOCALES[locale]?.dir || 'ltr';
    try {
      window.localStorage.setItem('familygram.locale', locale);
    } catch {
      /* chế độ riêng tư: bỏ qua */
    }
  }, [locale]);

  const setLocale = useCallback((next) => {
    const normalized = normalizeLocale(next);
    setLocaleState(SUPPORTED_LOCALES.includes(normalized) ? normalized : DEFAULT_LOCALE);
  }, []);

  const value = useMemo(() => {
    const t = (key, vars, fallback) => translate(locale, key, vars, fallback);

    return {
      locale,
      setLocale,
      t,
      /** Dịch khoá ở ngôn ngữ khác (dùng cho menu chọn ngôn ngữ). */
      tIn: (targetLocale, key, vars) => translate(targetLocale, key, vars),
      number: (value, options) => formatNumber(locale, value, options),
      count: (value) => formatNumber(locale, value, { compact: true }),
      timeAgo: (date) => formatRelativeTime(locale, date),
      formatDate: (date) =>
        new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(date)),
      languages: SUPPORTED_LOCALES.map((code) => LOCALES[code]),
      currentLanguage: LOCALES[locale],
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside <I18nProvider>.');
  return context;
}

export default I18nProvider;
