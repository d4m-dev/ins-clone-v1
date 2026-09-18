/**
 * src/pages/InvitePage.jsx — "Mời thành viên" (chỉ quản trị viên).
 * ---------------------------------------------------------------------------
 * Vì sao cần trang này thay vì dùng AdminJS?
 *   AdminJS phục vụ việc quản trị dữ liệu, còn đây là việc thường ngày của nhà:
 *   nhập email người được mời → gửi lời mời → (nếu Gmail lỗi) copy link gửi tay
 *   qua Zalo/Messenger. Nhìn thấy trạng thái "đã dùng / còn chờ" và thu hồi được.
 *
 * Bảo mật: backend đã chặn theo vai trò (`requireAdmin`); giao diện chỉ ẩn nút
 * cho gọn — không phải lớp bảo vệ. Lời mời KHÔNG cấp quyền admin trừ khi quản
 * trị viên chọn rõ ràng.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ROUTES } from '../../config/urls.js';
import { invitesApi, ApiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n/index.js';
import Layout from '../components/Layout.jsx';
import { Alert, Spinner } from '../components/States.jsx';
import { SpinnerIcon, CopyIcon, MailIcon, CloseIcon } from '../components/Icons.jsx';

/** Trạng thái hiển thị của một lời mời (màu + nhãn i18n). */
const STATUS_STYLE = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  accepted: 'bg-green-50 text-green-700 border-green-200',
  revoked: 'bg-ink-bg text-ink-soft border-ink-line',
  expired: 'bg-ink-bg text-ink-soft border-ink-line',
};

export default function InvitePage() {
  const { user } = useAuth();
  const { t, formatDate } = useI18n();

  const [form, setForm] = useState({ email: '', role: 'member', message: '' });
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  /** Kết quả lần gửi gần nhất: { emailSent, inviteUrl?, email } */
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await invitesApi.list();
      setInvites(data?.invites ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('invite.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  // Chỉ quản trị viên: người khác vào thẳng trang chủ.
  if (user && user.role !== 'admin') return <Navigate to={ROUTES.feed} replace />;

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const data = await invitesApi.create({
        email: form.email.trim().toLowerCase(),
        role: form.role,
        message: form.message.trim() || undefined,
      });
      setResult({
        email: form.email.trim().toLowerCase(),
        emailSent: Boolean(data?.emailSent),
        inviteUrl: data?.inviteUrl || null,
      });
      setForm({ email: '', role: 'member', message: '' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('invite.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async (id) => {
    try {
      await invitesApi.revoke(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('invite.revokeFailed'));
    }
  };

  const copyLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(t('invite.copyFailed'));
    }
  };

  const canSubmit = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) && !submitting;
  const pending = invites.filter((invite) => invite.status === 'pending');

  return (
    <Layout>
      <div className="mx-auto w-full max-w-[640px] px-4 py-6">
        <header className="mb-5 flex items-center gap-3">
          <MailIcon className="h-6 w-6 text-ink" />
          <div>
            <h1 className="text-lg font-semibold text-ink">{t('invite.title')}</h1>
            <p className="text-xs text-ink-soft">{t('invite.subtitle')}</p>
          </div>
        </header>

        {/* ------------------------------ gửi lời mời ------------------------ */}
        <form onSubmit={submit} className="rounded-lg border border-ink-line bg-white p-4">
          <label className="block text-xs font-semibold text-ink-soft" htmlFor="invite-email">
            {t('invite.emailLabel')}
          </label>
          <input
            id="invite-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="nguoithan@example.com"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            className="ig-input mt-1"
            required
          />

          <div className="mt-3 flex gap-3">
            {['member', 'admin'].map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setForm((current) => ({ ...current, role }))}
                aria-pressed={form.role === role}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  form.role === role
                    ? 'border-ig-blue bg-blue-50 text-ig-blue'
                    : 'border-ink-line bg-white text-ink-soft'
                }`}
              >
                {role === 'admin' ? t('invite.roleAdmin') : t('invite.roleMember')}
              </button>
            ))}
          </div>

          <label className="mt-3 block text-xs font-semibold text-ink-soft" htmlFor="invite-message">
            {t('invite.messageLabel')}
          </label>
          <textarea
            id="invite-message"
            rows={2}
            maxLength={200}
            placeholder={t('invite.messagePlaceholder')}
            value={form.message}
            onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
            className="ig-input mt-1 resize-none"
          />

          <button type="submit" disabled={!canSubmit} className="ig-button mt-4 flex items-center justify-center gap-2">
            {submitting && <SpinnerIcon className="h-4 w-4" />}
            {submitting ? t('invite.sending') : t('invite.send')}
          </button>

          <p className="mt-2 text-center text-[11px] leading-4 text-ink-soft">{t('invite.expiryHint')}</p>
        </form>

        {/* ------------------------------- kết quả --------------------------- */}
        {result && (
          <div className="mt-4 rounded-lg border border-ink-line bg-white p-4 text-sm">
            {result.emailSent ? (
              <p className="text-green-700">{t('invite.sentByEmail', { email: result.email })}</p>
            ) : (
              <>
                <p className="text-amber-700">{t('invite.emailUnavailable')}</p>
                {result.inviteUrl && (
                  <div className="mt-2 flex items-center gap-2">
                    <input readOnly value={result.inviteUrl} className="ig-input flex-1 text-xs" onFocus={(e) => e.target.select()} />
                    <button
                      type="button"
                      onClick={() => copyLink(result.inviteUrl)}
                      className="ig-button-ghost flex shrink-0 items-center gap-1.5 !px-3 !py-2 text-xs"
                    >
                      <CopyIcon className="h-3.5 w-3.5" />
                      {copied ? t('invite.copied') : t('invite.copyLink')}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {error && <div className="mt-4"><Alert>{error}</Alert></div>}

        {/* ------------------------------- danh sách ------------------------- */}
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-ink">
            {t('invite.listTitle')}
            {pending.length > 0 && <span className="ml-2 text-xs font-normal text-ink-soft">{t('invite.pendingCount', { count: pending.length })}</span>}
          </h2>

          {loading ? (
            <Spinner />
          ) : invites.length === 0 ? (
            <p className="rounded-lg border border-dashed border-ink-line px-4 py-6 text-center text-sm text-ink-soft">
              {t('invite.empty')}
            </p>
          ) : (
            <ul className="space-y-2">
              {invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-ink-line bg-white px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{invite.email}</p>
                    <p className="mt-0.5 text-[11px] text-ink-soft">
                      {invite.inviter?.fullName || invite.inviter?.username || ''} ·{' '}
                      {invite.role === 'admin' ? t('invite.roleAdmin') : t('invite.roleMember')} ·{' '}
                      {t('invite.expiresOn', { date: formatDate(invite.expiresAt) })}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[invite.status] || STATUS_STYLE.pending}`}>
                      {t(`invite.status.${invite.status}`)}
                    </span>
                    {invite.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => revoke(invite.id)}
                        aria-label={t('invite.revoke')}
                        title={t('invite.revoke')}
                        className="rounded-full p-1.5 text-ink-soft hover:bg-ink-bg hover:text-red-600"
                      >
                        <CloseIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Layout>
  );
}
