/**
 * src/pages/RegisterPage.jsx — tạo tài khoản thành viên gia đình.
 * Kiểm tra phía client mô phỏng đúng luật express-validator của backend,
 * nhưng server vẫn là nguồn xác thực cuối cùng.
 */

import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ROUTES } from '../../config/urls.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n/index.js';
import { Alert } from '../components/States.jsx';
import { SpinnerIcon } from '../components/Icons.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';
import { ApiError, invitesApi } from '../api/client.js';

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

  /* --------------------------- link mời (?invite=…) ---------------------- */
  // Link trong email có dạng  <trang web>/register?invite=<token>
  // (xem backend/services/mailer.service.js). Kiểm tra trước để:
  //   • hiện lời chào đúng tên người mời,
  //   • điền sẵn email mà quản trị viên đã mời,
  //   • báo ngay nếu link đã hết hạn / đã dùng, thay vì để người dùng
  //     điền hết form rồi mới nhận lỗi.
  const [params] = useSearchParams();
  const inviteToken = params.get('invite') || '';
  const [invite, setInvite] = useState(null);
  const [inviteState, setInviteState] = useState(inviteToken ? 'checking' : 'none');

  useEffect(() => {
    if (!inviteToken) return undefined;
    let alive = true;

    invitesApi
      .check(inviteToken)
      .then((data) => {
        if (!alive) return;
        setInvite(data?.invite || null);
        setInviteState('valid');
        // Email do lời mời quyết định (backend cũng ghi đè như vậy).
        if (data?.invite?.email) setForm((current) => ({ ...current, email: data.invite.email }));
      })
      .catch(() => {
        if (alive) setInviteState('invalid');
      });

    return () => {
      alive = false;
    };
  }, [inviteToken]);

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
        // Chỉ gửi khi link mời còn dùng được — backend sẽ tự kiểm tra lại.
        ...(inviteState === 'valid' && inviteToken ? { inviteToken } : {}),
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

          {inviteState === 'checking' && (
            <p className="flex items-center gap-2 rounded-lg bg-ink-bg px-3 py-2 text-xs text-ink-soft">
              <SpinnerIcon className="h-3 w-3" />
              {t('invite.checking')}
            </p>
          )}

          {inviteState === 'valid' && invite && (
            <div className="w-full rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-center text-xs text-green-800">
              <p className="text-sm font-semibold">{t('invite.validTitle')}</p>
              <p className="mt-1">
                {t('invite.validBody', {
                  inviter: invite.inviter?.fullName || invite.inviter?.username || t('invite.someone'),
                })}
              </p>
              <p className="mt-1 text-[11px]">{t('invite.emailLocked', { email: invite.email })}</p>
            </div>
          )}

          {inviteState === 'invalid' && (
            <div className="w-full space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs text-amber-800">
              <p className="text-sm font-semibold">{t('invite.invalidTitle')}</p>
              <p className="leading-relaxed">{t('invite.invalidBody')}</p>
            </div>
          )}

          <form onSubmit={submit} className="mt-2 w-full space-y-2.5">
            {FIELDS.map((field) => {
              // Có lời mời ⇒ email do lời mời quyết định, khoá ô nhập cho khỏi
              // hiểu nhầm là sửa được (backend luôn dùng email trong lời mời).
              const locked = field.name === 'email' && inviteState === 'valid';
              return (
                <label key={field.name} className="block">
                  <span className="sr-only">{t(field.labelKey)}</span>
                  <input
                    type={field.type}
                    name={field.name}
                    autoComplete={field.autoComplete}
                    placeholder={t(field.placeholderKey)}
                    value={form[field.name]}
                    onChange={update(field.name)}
                    readOnly={locked}
                    aria-readonly={locked || undefined}
                    className={locked ? 'ig-input cursor-not-allowed bg-ink-bg text-ink-soft' : 'ig-input'}
                    required
                  />
                </label>
              );
            })}

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
