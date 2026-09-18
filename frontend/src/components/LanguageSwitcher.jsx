/**
 * src/components/LanguageSwitcher.jsx
 * ---------------------------------------------------------------------------
 * Bộ chuyển ngôn ngữ: 🇻🇳 Tiếng Việt (mặc định) · 🇬🇧 English · 🇨🇳 中文
 *
 * variant:
 *   'sidebar'  → nút gọn trong sidebar desktop
 *   'topbar'   → icon ngôn ngữ trên thanh trên (mobile)
 *   'floating' → huy hiệu ở góc màn hình đăng nhập / đăng ký
 *   'inline'   → hàng nút ngang (dùng trong trang cài đặt)
 * ---------------------------------------------------------------------------
 */

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.js';
import { CloseIcon } from './Icons.jsx';

const GlobeIcon = ({ className = 'w-5 h-5' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" />
  </svg>
);

export default function LanguageSwitcher({ variant = 'sidebar' }) {
  const { locale, setLocale, languages, currentLanguage, t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  /** Đóng menu khi bấm ra ngoài hoặc nhấn Esc. */
  useEffect(() => {
    if (!open) return undefined;

    const onClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => event.key === 'Escape' && setOpen(false);

    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (code) => {
    setLocale(code);
    setOpen(false);
  };

  /* ------------------------------- variants ------------------------------- */

  if (variant === 'inline') {
    return (
      <div className="flex flex-wrap gap-2">
        {languages.map((language) => (
          <button
            key={language.code}
            type="button"
            onClick={() => choose(language.code)}
            aria-pressed={locale === language.code}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
              locale === language.code
                ? 'border-ig-blue bg-ig-blue/5 font-semibold text-ig-blue'
                : 'border-ink-line text-ink hover:bg-ink-bg'
            }`}
          >
            <span aria-hidden>{language.flag}</span>
            {language.label}
          </button>
        ))}
      </div>
    );
  }

  if (variant === 'floating') {
    return (
      <div ref={containerRef} className="fixed right-4 top-4 z-40">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={t('language.switch')}
          aria-expanded={open}
          className="flex items-center gap-2 rounded-full border border-ink-line bg-white px-3 py-1.5 text-sm shadow-sm transition hover:bg-ink-bg"
        >
          {open ? <CloseIcon className="w-4 h-4" /> : <GlobeIcon className="w-4 h-4" />}
          <span className="font-semibold">{currentLanguage.short}</span>
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-44 overflow-hidden rounded-lg border border-ink-line bg-white shadow-lg animate-fade-in">
            {languages.map((language) => (
              <button
                key={language.code}
                type="button"
                onClick={() => choose(language.code)}
                className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-ink-bg ${
                  locale === language.code ? 'font-semibold text-ig-blue' : ''
                }`}
              >
                <span aria-hidden>{language.flag}</span>
                {language.label}
                {locale === language.code && <span className="ml-auto">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* sidebar | topbar */
  const compact = variant === 'topbar';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t('language.switch')}
        aria-expanded={open}
        className={
          compact
            ? 'flex items-center gap-1 p-1 text-sm'
            : 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition hover:bg-ink-bg'
        }
      >
        {compact ? <GlobeIcon className="w-6 h-6" /> : <span className="text-lg" aria-hidden>{currentLanguage.flag}</span>}
        {!compact && <span>{currentLanguage.label}</span>}
        {!compact && <span className="ml-auto text-xs text-ink-soft">{currentLanguage.short}</span>}
      </button>

      {open && (
        <div
          className={`absolute z-40 overflow-hidden rounded-lg border border-ink-line bg-white shadow-lg animate-fade-in ${
            compact ? 'right-0 mt-2 w-44' : 'bottom-full mb-2 w-full'
          }`}
        >
          <p className="border-b border-ink-line px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
            {t('language.label')}
          </p>
          {languages.map((language) => (
            <button
              key={language.code}
              type="button"
              onClick={() => choose(language.code)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-ink-bg ${
                locale === language.code ? 'font-semibold text-ig-blue' : ''
              }`}
            >
              <span aria-hidden>{language.flag}</span>
              {language.label}
              {locale === language.code && <span className="ml-auto">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
