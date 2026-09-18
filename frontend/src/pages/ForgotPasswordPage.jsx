/**
 * src/pages/ForgotPasswordPage.jsx — xin liên kết đặt lại mật khẩu.
 * ---------------------------------------------------------------------------
 * Nguyên tắc an toàn: giao diện LUÔN hiện cùng một thông báo dù email có tồn
 * tại hay không — nếu hiện "email không tồn tại" thì kẻ lạ có thể dò xem ai
 * trên hệ thống đã có tài khoản. Vì vậy trang chỉ chuyển sang trạng thái
 * "đã gửi" và nhắc kiểm tra cả mục Spam.
 *
 * Mọi URL lấy từ config/urls.js — không hardcode.
 * ---------------------------------------------------------------------------
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../config/urls.js';
import { authApi, ApiError } from '../api/client.js';
import { useI18n } from '../i18n/index.js';
import { Alert } from '../components/States.jsx';
import { SpinnerIcon } from '../components/Icons.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(null); // { expiresInMinutes }
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const data = await authApi.forgotPassword({ email: email.trim().toLowerCase() });
      setSent({ expiresInMinutes: data?.expiresInMinutes ?? 30 });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('forgot.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && !submitting;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-bg px-4 py-10">
      <LanguageSwitcher variant="floating" />

      <div className="flex w-full max-w-[400px] flex-col items-center gap-4">
        <div className="flex w-full flex-col items-center gap-6 rounded-lg border border-ink-line bg-white px-8 py-10">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-3xl font-semibold ig-gradient-text">{t('app.name')}</h1>
            <p className="mt-2 text-sm font-semibold text-ink">{t('forgot.title')}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">{t('forgot.subtitle')}</p>
          </div>

          {sent ? (
            <div className="w-full space-y-4 text-center">
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-5 text-sm text-green-800">
                <p className="font-semibold">{t('forgot.sentTitle')}</p>
                <p className="mt-1 leading-relaxed">{t('forgot.sentBody', { minutes: sent.expiresInMinutes })}</p>
                <p className="mt-2 text-xs">{t('forgot.checkSpam')}</p>
              </div>

              <Link to={ROUTES.login} className="ig-button block text-center">
                {t('forgot.backToLogin')}
              </Link>

              <button
                type="button"
                onClick={() => {
                  setSent(null);
                  setError(null);
                }}
                className="text-xs font-semibold text-ig-blue hover:underline"
              >
                {t('forgot.tryAnother')}
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="w-full space-y-2.5">
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder={t('auth.fields.emailPlaceholder')}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="ig-input"
                required
              />

              <div className="pt-2">{error && <Alert>{error}</Alert>}</div>

              <button type="submit" disabled={!canSubmit} className="ig-button flex items-center justify-center gap-2">
                {submitting && <SpinnerIcon className="w-4 h-4" />}
                {submitting ? t('forgot.submitting') : t('forgot.submit')}
              </button>
            </form>
          )}
        </div>

        {!sent && (
          <div className="w-full rounded-lg border border-ink-line bg-white py-6 text-center text-sm">
            <Link to={ROUTES.login} className="ig-link">
              {t('forgot.backToLogin')}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
