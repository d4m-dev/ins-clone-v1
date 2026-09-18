/**
 * src/pwa/useInstallPrompt.js
 * ---------------------------------------------------------------------------
 * Bọc `beforeinstallprompt` của Chromium thành hook React:
 *   • hiện nút "Cài đặt ứng dụng" khi trình duyệt cho phép
 *   • gọi `prompt()` khi người dùng bấm
 *   • theo dõi trạng thái đã cài (chạy standalone) và mất mạng
 * Safari/iOS không hỗ trợ sự kiện này → `canInstall` luôn false, UI tự ẩn.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from 'react';

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('familygram.pwaDismissed') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onBeforeInstall = (event) => {
      event.preventDefault(); // giữ lại sự kiện để tự hiện UI
      setDeferredPrompt(event);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome === 'accepted';
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem('familygram.pwaDismissed', '1');
    } catch {
      /* chế độ riêng tư */
    }
  }, []);

  return {
    canInstall: Boolean(deferredPrompt) && !installed && !dismissed,
    installed,
    install,
    dismiss,
  };
}

/** Theo dõi trạng thái mạng để hiện băng "đang ngoại tuyến". */
export function useOnlineStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}

/** Đăng ký service worker (gọi trong main.jsx sau khi app mount). */
export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return; // dev server của Vite không hợp với precache

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* PWA là tính năng tăng cường — lỗi đăng ký không được làm hỏng app */
    });
  });
}
