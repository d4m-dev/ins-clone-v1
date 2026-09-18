/**
 * src/components/States.jsx
 * Các trạng thái dùng chung: đang tải · rỗng · lỗi · thông báo.
 * Chữ mặc định lấy từ i18n; component cha có thể ghi đè bằng props.
 */

import { useI18n } from '../i18n/index.js';
import { SpinnerIcon } from './Icons.jsx';

export function Spinner({ className = 'w-6 h-6' }) {
  return (
    <div className="flex w-full items-center justify-center py-8 text-ink-soft">
      <SpinnerIcon className={className} />
    </div>
  );
}

export function SkeletonPost() {
  return (
    <div className="ig-card mb-0 md:mb-6 animate-pulse">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="h-8 w-8 rounded-full bg-ink-bg" />
        <div className="h-3 w-28 rounded bg-ink-bg" />
      </div>
      <div className="aspect-square w-full bg-ink-bg" />
      <div className="space-y-2 p-4">
        <div className="h-3 w-20 rounded bg-ink-bg" />
        <div className="h-3 w-52 rounded bg-ink-bg" />
      </div>
    </div>
  );
}

export function EmptyState({ icon = '📷', title, description, action }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-ink-line text-3xl">
        {icon}
      </div>
      <h2 className="text-xl font-semibold">{title}</h2>
      {description && <p className="max-w-xs text-sm text-ink-soft">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="text-3xl">😕</span>
      <h2 className="text-lg font-semibold">{t('common.error')}</h2>
      <p className="max-w-xs text-sm text-ink-soft">{message || t('common.errorHint')}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="ig-button w-auto px-6">
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

export function Alert({ tone = 'error', children }) {
  if (!children) return null;
  const tones = {
    error: 'bg-red-50 text-ig-red border-red-100',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    info: 'bg-blue-50 text-ig-blue border-blue-100',
  };
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${tones[tone]}`} role="alert">
      {children}
    </div>
  );
}

export function SpinnerInline({ className = 'w-4 h-4' }) {
  return <SpinnerIcon className={className} />;
}
