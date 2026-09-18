/* eslint-disable no-restricted-globals */
/**
 * public/sw.js — service worker của FamilyGram
 * ---------------------------------------------------------------------------
 * Chiến lược (an toàn trước, offline vừa đủ):
 *   • Điều hướng (HTML)   : network-first → offline thì trả shell đã lưu.
 *   • Tài nguyên build    : cache-first (file có hash trong tên, không đổi).
 *   • Ảnh/video /uploads/ : KHÔNG cache (album gia đình lớn dần, dung lượng
 *                           điện thoại có hạn) — chỉ đi mạng, lỗi thì bỏ qua.
 *   • /api/*              : KHÔNG cache, trừ GET /api/stories|/api/reels dùng
 *                           network-first có lưu tạm để còn xem khi mất mạng.
 *
 * LƯU Ý: đổi CACHE_VERSION mỗi khi sửa file này để buộc cập nhật.
 */

const CACHE_VERSION = 'familygram-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

const SHELL_URL = '/index.html';
const PRECACHE = [SHELL_URL, '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

/** GET /api/... được phép lưu tạm để còn dữ liệu khi ngoại tuyến. */
const CACHEABLE_API = /\/api\/(reels|stories|posts)(\?|$)/;

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Chỉ xử lý tài nguyên cùng origin (API + asset của chính app).
  if (url.origin !== self.location.origin) return;

  // 1) Ảnh/video tĩnh: không cache, để trình duyệt tự lo.
  if (url.pathname.startsWith('/uploads/')) return;

  // 2) Điều hướng trang: network-first, offline thì trả shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_URL, copy));
          return response;
        })
        .catch(() => caches.match(SHELL_URL))
    );
    return;
  }

  // 3) API đọc dữ liệu: network-first + lưu tạm.
  if (CACHEABLE_API.test(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(DATA_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 4) Còn lại (JS/CSS/font, có hash): cache-first.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.css'))) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});

/** Cho phép trang yêu cầu bỏ qua chờ đợi khi có bản mới. */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
