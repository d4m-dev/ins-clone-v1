/**
 * src/components/InstallPrompt.jsx
 * ---------------------------------------------------------------------------
 * Băng mời "Cài PixGram lên màn hình chính" + băng cảnh báo ngoại tuyến.
 * Cả hai đều nhẹ, tự ẩn khi không cần và không chặn thao tác của người dùng.
 * ---------------------------------------------------------------------------
 */

import { useInstallPrompt, useOnlineStatus } from '../pwa/useInstallPrompt.js';
import { useI18n } from '../i18n/index.js';
import { InstallIcon, CloseIcon } from './Icons.jsx';

export default function InstallPrompt() {
  const { t } = useI18n();
  const { canInstall, install, dismiss } = useInstallPrompt();
  const online = useOnlineStatus();

  return (
    <>
      {!online && (
        <div className="fixed inset-x-0 top-0 z-40 bg-ink px-4 py-2 text-center text-xs text-white">
          {t('pwa.offline')}
        </div>
      )}

      {canInstall && (
        <div className="fixed inset-x-3 bottom-20 z-40 flex items-start gap-3 rounded-xl border border-ink-line bg-white p-3 shadow-lg md:left-auto md:right-6 md:w-96">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ig-gradient text-white">
            <InstallIcon className="w-5 h-5" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t('pwa.installTitle')}</p>
            <p className="text-xs text-ink-soft">{t('pwa.installHint')}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={install} className="ig-button w-auto px-4 py-1.5 text-sm">
                {t('pwa.install')}
              </button>
              <button type="button" onClick={dismiss} className="px-2 text-sm text-ink-soft">
                {t('pwa.dismiss')}
              </button>
            </div>
          </div>

          <button type="button" onClick={dismiss} aria-label={t('viewer.close')} className="p-1 text-ink-soft">
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
}
