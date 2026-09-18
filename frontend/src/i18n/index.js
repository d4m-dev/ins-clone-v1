/**
 * src/i18n/index.js — điểm import duy nhất cho i18n.
 *
 *   import { useI18n, I18nProvider } from '../i18n';
 */
export { I18nProvider, useI18n, default as default } from './I18nContext.jsx';
export { LOCALES, SUPPORTED_LOCALES, DEFAULT_LOCALE, normalizeLocale } from './config.js';
export { translate, getLocale, formatNumber, formatRelativeTime } from './translate.js';
