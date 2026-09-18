/**
 * src/pages/RegisterPage.jsx — tạo tài khoản thành viên gia đình.
 * Kiểm tra phía client mô phỏng đúng luật express-validator của backend,
 * nhưng server vẫn là nguồn xác thực cuối cùng.
 */

import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../config/urls.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n/index.js';
import { Alert } from '../components/States.jsx';
import { SpinnerIcon } from '../components/Icons.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';
import { ApiError } from '../api/client.js';

const FIELDS = [
  { name: 'fullName', labelKey: 'auth.fields.fullName', placeholderKey: 'auth.fields.fullNamePlaceholder', type: 'text', autoComplete: 'name' },
  { name: 'username', labelKey: 'auth.fields.username', placeholderKey: 'auth.fields.usernamePlaceholder', type: 'text', autoComplete: 'username' },
  { name: 'email', labelKey: 'auth.fields.email', placeholderKey: 'auth.fields.emailPlaceholder', type: 'email', autoComplete: 'email' },
  { name: 'password', labelKey: 'auth.fields.password', placeholderKey: 'auth.fields.passwordPlaceholder', type: 'password', autoComplete: 'new-password' },
];

export default function RegisterPage() {
  const { register, isAuthenticated, isReady } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', username: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (isReady && isAuthenticated) return <Navigate to={ROUTES.feed} replace />;

  const update = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await register({
        fullName: form.fullName.trim(),
        username: form.username.trim().toLowerCase(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      navigate(ROUTES.feed, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.registerFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const isValid =
    form.fullName.trim().length > 0 &&
    /^[a-z0-9._]{3,30}$/.test(form.username.trim().toLowerCase()) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) &&
    form.password.length >= 8;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-bg px-4 py-10">
      <LanguageSwitcher variant="floating" />

      <div className="w-full max-w-[350px] space-y-4">
        <div className="flex flex-col items-center gap-3 rounded-lg border border-ink-line bg-white px-8 py-8">
          <div className="flex flex-col items-center">
            <h1 className="text-3xl font-semibold ig-gradient-text">{t('app.name')}</h1>
            <p className="mt-1 text-xs text-ink-soft">{t('app.tagline')}</p>
          </div>
          <p className="px-2 text-center text-sm font-semibold text-ink-soft">{t('auth.registerHint')}</p>

          <form onSubmit={submit} className="mt-2 w-full space-y-2.5">
            {FIELDS.map((field) => (
              <label key={field.name} className="block">
                <span className="sr-only">{t(field.labelKey)}</span>
                <input
                  type={field.type}
                  name={field.name}
                  autoComplete={field.autoComplete}
                  placeholder={t(field.placeholderKey)}
                  value={form[field.name]}
                  onChange={update(field.name)}
                  className="ig-input"
                  required
                />
              </label>
            ))}

            <div className="pt-1">{error && <Alert>{error}</Alert>}</div>

            <p className="pt-1 text-center text-[11px] leading-4 text-ink-soft">{t('auth.terms')}</p>

            <button type="submit" disabled={!isValid || submitting} className="ig-button flex items-center justify-center gap-2">
              {submitting && <SpinnerIcon className="w-4 h-4" />}
              {submitting ? t('auth.registering') : t('auth.register')}
            </button>
          </form>
        </div>

        <div className="rounded-lg border border-ink-line bg-white py-6 text-center text-sm">
          {t('auth.hasAccount')}{' '}
          <Link to={ROUTES.login} className="ig-link">
            {t('auth.login')}
          </Link>
        </div>
      </div>
    </div>
  );
}
