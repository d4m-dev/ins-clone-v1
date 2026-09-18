/**
 * src/pages/ResetPasswordPage.jsx — đổi mật khẩu bằng token trong email.
 * ---------------------------------------------------------------------------
 * Token nằm trên query string: /reset-password?token=… (đúng bằng
 * urls.routes.resetPassword ở backend/config/urls.js + ROUTES.resetPassword
 * ở frontend/config/urls.js). Token dùng MỘT lần: sau khi đổi thành công,
 * trang không cho gửi lại nữa mà mời đăng nhập.
 *
 * Trang này không yêu cầu đăng nhập — người dùng quên mật khẩu thì làm gì có
 * phiên. Vì vậy nó KHÔNG nằm sau lớp bảo vệ route trong App.jsx.
 * ---------------------------------------------------------------------------
 */

import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ROUTES } from '../../config/urls.js';
import { authApi, ApiError } from '../api/client.js';
import { useI18n } from '../i18n/index.js';
import { Alert } from '../components/States.jsx';
import { SpinnerIcon } from '../components/Icons.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';

export default function ResetPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [form, setForm] = useState({ password: '', confirm: '' });
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (form.password !== form.confirm) {
      setError(t('reset.mismatch'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await authApi.resetPassword({ token, password: form.password });
      setDone(true);
      // Đưa về trang đăng nhập sau vài giây, nhưng vẫn để nút bấm tay.
      setTimeout(() => navigate(ROUTES.login, { replace: true }), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('reset.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const tooShort = form.password.length > 0 && form.password.length < 8;
  const mismatch = form.confirm.length > 0 && form.password !== form.confirm;
  const canSubmit = token && form.password.length >= 8 && form.password === form.confirm && !submitting;

  /* ------------------------- thiếu token trong link ----------------------- */
  const missingToken = !token;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-bg px-4 py-10">
      <LanguageSwitcher variant="floating" />

      <div className="flex w-full max-w-[400px] flex-col items-center gap-4">
        <div className="flex w-full flex-col items-center gap-6 rounded-lg border border-ink-line bg-white px-8 py-10">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-3xl font-semibold ig-gradient-text">{t('app.name')}</h1>
            <p className="mt-2 text-sm font-semibold text-ink">{t('reset.title')}</p>
            {!done && !missingToken && <p className="mt-1 text-xs leading-relaxed text-ink-soft">{t('reset.subtitle')}</p>}
          </div>

          {missingToken && (
            <div className="w-full space-y-4">
              <Alert>{t('reset.missingToken')}</Alert>
              <Link to={ROUTES.forgotPassword} className="ig-button block text-center">
                {t('reset.requestNew')}
              </Link>
            </div>
          )}

          {!missingToken && done && (
            <div className="w-full space-y-4 text-center">
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-5 text-sm text-green-800">
                <p className="font-semibold">{t('reset.doneTitle')}</p>
                <p className="mt-1 leading-relaxed">{t('reset.doneBody')}</p>
              </div>
              <Link to={ROUTES.login} className="ig-button block text-center">
                {t('reset.goToLogin')}
              </Link>
            </div>
          )}

          {!missingToken && !done && (
            <form onSubmit={submit} className="w-full space-y-2.5">
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                placeholder={t('reset.passwordPlaceholder')}
                value={form.password}
                onChange={update('password')}
                className="ig-input"
                required
              />
              <input
                type="password"
                name="confirm"
                autoComplete="new-password"
                placeholder={t('reset.confirmPlaceholder')}
                value={form.confirm}
                onChange={update('confirm')}
                className="ig-input"
                required
              />

              {tooShort && <p className="px-1 text-xs text-ink-soft">{t('auth.fields.passwordPlaceholder')}</p>}
              {mismatch && <p className="px-1 text-xs text-red-600">{t('reset.mismatch')}</p>}

              <div className="pt-2">{error && <Alert>{error}</Alert>}</div>

              <button type="submit" disabled={!canSubmit} className="ig-button flex items-center justify-center gap-2">
                {submitting && <SpinnerIcon className="w-4 h-4" />}
                {submitting ? t('reset.submitting') : t('reset.submit')}
              </button>

              <p className="pt-2 text-center text-xs text-ink-soft">{t('reset.singleUse')}</p>
            </form>
          )}
        </div>

        <div className="w-full rounded-lg border border-ink-line bg-white py-6 text-center text-sm">
          <Link to={ROUTES.login} className="ig-link">
            {t('forgot.backToLogin')}
          </Link>
        </div>
      </div>
    </div>
  );
}
