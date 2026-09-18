/**
 * src/pages/LoginPage.jsx — thẻ đăng nhập kiểu Instagram.
 * Ảnh minh hoạ điện thoại là CSS/SVG thuần nên không cần tải tài nguyên ngoài.
 */

import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../config/urls.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n/index.js';
import { Alert } from '../components/States.jsx';
import { SpinnerIcon } from '../components/Icons.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';
import { ApiError } from '../api/client.js';

function PhoneMock() {
  return (
    <div className="relative hidden h-[520px] w-[380px] shrink-0 items-center justify-center overflow-hidden lg:flex">
      <div className="absolute inset-y-0 right-0 w-[260px] rounded-[36px] border-[10px] border-ink bg-gradient-to-br from-ig-purple/90 via-ig-pink/80 to-ig-orange/80 shadow-2xl">
        <div className="absolute left-1/2 top-2 h-1.5 w-16 -translate-x-1/2 rounded-full bg-ink/70" />
        <div className="mt-10 space-y-3 px-4">
          <div className="h-3 w-24 rounded bg-white/80" />
          <div className="h-40 rounded-lg bg-white/90" />
          <div className="h-3 w-32 rounded bg-white/70" />
          <div className="h-3 w-20 rounded bg-white/60" />
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { login, isAuthenticated, isReady } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = location.state?.from?.pathname || ROUTES.feed;

  if (isReady && isAuthenticated) return <Navigate to={redirectTo} replace />;

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login({ identifier: form.identifier.trim(), password: form.password });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.loginFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = form.identifier.trim().length > 0 && form.password.length >= 1 && !submitting;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-bg px-4 py-10">
      <LanguageSwitcher variant="floating" />

      <div className="flex w-full max-w-[350px] flex-col items-center gap-4">
        <div className="flex w-full flex-col items-center gap-6 rounded-lg border border-ink-line bg-white px-8 py-10">
          <div className="flex flex-col items-center">
            <h1 className="text-4xl font-semibold ig-gradient-text">{t('app.name')}</h1>
            <p className="mt-1 text-xs text-ink-soft">{t('app.tagline')}</p>
          </div>

          <form onSubmit={submit} className="w-full space-y-2.5">
            <input
              type="text"
              name="identifier"
              autoComplete="username"
              placeholder={t('auth.identifierPlaceholder')}
              value={form.identifier}
              onChange={update('identifier')}
              className="ig-input"
              required
            />
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder={t('auth.passwordPlaceholder')}
              value={form.password}
              onChange={update('password')}
              className="ig-input"
              required
            />

            <div className="pt-2">{error && <Alert>{error}</Alert>}</div>

            <button type="submit" disabled={!canSubmit} className="ig-button flex items-center justify-center gap-2">
              {submitting && <SpinnerIcon className="w-4 h-4" />}
              {submitting ? t('auth.loggingIn') : t('auth.login')}
            </button>
          </form>

          <div className="flex w-full items-center gap-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            <span className="h-px flex-1 bg-ink-line" />
            {t('auth.or')}
            <span className="h-px flex-1 bg-ink-line" />
          </div>

          <p className="text-center text-xs text-ink-soft">{t('auth.loginHint')}</p>
        </div>

        <div className="w-full rounded-lg border border-ink-line bg-white py-6 text-center text-sm">
          {t('auth.noAccount')}{' '}
          <Link to={ROUTES.register} className="ig-link">
            {t('auth.register')}
          </Link>
        </div>
      </div>

      <PhoneMock />
    </div>
  );
}
