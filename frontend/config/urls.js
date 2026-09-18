/**
 * config/urls.js  (FRONTEND)
 * ---------------------------------------------------------------------------
 * THE single source of truth for every URL used by the React app.
 * No component, hook or service may contain a literal endpoint string —
 * they all import from here.
 *
 * Values come from Vite env vars (`.env` / Vercel → Settings → Environment
 * Variables). Changing the backend domain = editing VITE_API_BASE_URL once.
 *
 *   VITE_API_ORIGIN    = <tên-miền-api-của-bạn>      (ví dụ: https://api.example.com)
 *   VITE_UPLOADS_PREFIX = uploads
 * Leave both empty to use same-origin relative paths — the Vite dev server
 * then proxies /api and /uploads to the backend (see vite.config.js), which is
 * also what keeps the in-app preview working.
 * ---------------------------------------------------------------------------
 */

import apiClientPrefix from './paths.js';

const trimTrailing = (value) => String(value || '').replace(/\/+$/, '');

/** Origin of this web app (Vercel). */
export const APP_ORIGIN = trimTrailing(import.meta.env.VITE_APP_ORIGIN || window.location.origin);

/** Where the backend lives. Empty → same-origin (dev proxy / preview). */
const API_ORIGIN = trimTrailing(import.meta.env.VITE_API_ORIGIN || '');

/* ------------------------------- endpoints -------------------------------- */
export const API_BASE = `${API_ORIGIN}${apiClientPrefix.api}`;

export const ENDPOINTS = {
  health: `${API_BASE}/health`,
  config: `${API_BASE}/auth/config`,

  auth: {
    register: `${API_BASE}/auth/register`,
    login: `${API_BASE}/auth/login`,
    me: `${API_BASE}/auth/me`,
  },

  posts: {
    list: `${API_BASE}/posts`,
    create: `${API_BASE}/posts`,
    stats: `${API_BASE}/posts/stats`,
    byId: (id) => `${API_BASE}/posts/${id}`,
    like: (id) => `${API_BASE}/posts/${id}/likes`,
    comments: (id) => `${API_BASE}/posts/${id}/comments`,
    views: (id) => `${API_BASE}/posts/${id}/views`,
    /** Tải tệp gốc về máy (ảnh hoặc video). */
    download: (id) => `${API_BASE}/posts/${id}/download`,
  },

  /** Reels — dòng video dọc, tự phát khi cuộn tới. */
  reels: {
    list: `${API_BASE}/reels`,
    byId: (id) => `${API_BASE}/reels/${id}`,
  },

  /** Khoảnh khắc 24 giờ (Stories). */
  stories: {
    list: `${API_BASE}/stories`,
  },

  users: {
    /** Accepts a numeric id OR a username (backend resolves both). */
    posts: (identifier) => `${API_BASE}/users/${encodeURIComponent(identifier)}/posts`,
    mePosts: `${API_BASE}/users/me/posts`,
  },

  comments: {
    byId: (id) => `${API_BASE}/comments/${id}`,
  },
};

/* --------------------------------- images --------------------------------- */
/** Base used to render <img src>. Stored filenames are relative on purpose. */
export const UPLOADS_BASE = trimTrailing(
  import.meta.env.VITE_UPLOADS_BASE_URL || `${API_ORIGIN}${apiClientPrefix.uploads}`
);

/** Turns an absolute/relative image URL from the API into a renderable src. */
export const resolveImageUrl = (value) => {
  if (!value) return PLACEHOLDERS.avatar;
  // The backend already returns absolute URLs; keep the path if the host changed.
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      const apiHost = API_ORIGIN ? new URL(API_ORIGIN).host : null;
      // Re-point images to the configured backend when the stored URL is stale.
      if (!apiHost || parsed.host === apiHost) return value;
      return `${UPLOADS_BASE}${parsed.pathname.replace(/^\/uploads/, '')}`;
    } catch {
      return value;
    }
  }
  if (value.startsWith('/uploads')) return `${UPLOADS_BASE}${value.replace(/^\/uploads/, '')}`;
  return `${UPLOADS_BASE}/${value.replace(/^\/+/, '')}`;
};

/* ------------------------------ app routes -------------------------------- */
export const ROUTES = {
  feed: '/',
  explore: '/explore',
  reels: '/reels',
  upload: '/upload',
  login: '/login',
  register: '/register',
  profile: (username) => `/u/${username}`,
  post: (id) => `/p/${id}`,
  /**
   * Trang quản trị AdminJS. KHÔNG hardcode: đặt VITE_ADMIN_URL trên Vercel.
   * Nếu để trống, giao diện sẽ ẩn nút "Trang quản trị" (xem ProfilePage).
   */
  admin: import.meta.env.VITE_ADMIN_URL || '',
};

/* ------------------------------ placeholders ------------------------------ */
/**
 * Inline data-URI placeholders: no network request, no 404 while the backend
 * is offline (the /uploads guard only serves whitelisted raster images).
 */
export const PLACEHOLDERS = {
  avatar:
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150">
         <rect width="150" height="150" fill="#efefef"/>
         <circle cx="75" cy="58" r="26" fill="#c7c7c7"/>
         <path d="M18 150c0-31 26-52 57-52s57 21 57 52z" fill="#c7c7c7"/>
       </svg>`
    ),
  post:
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
         <rect width="600" height="600" fill="#efefef"/>
         <text x="300" y="315" font-size="90" text-anchor="middle">📷</text>
       </svg>`
    ),
};

export default {
  APP_ORIGIN,
  API_BASE,
  ENDPOINTS,
  UPLOADS_BASE,
  ROUTES,
  PLACEHOLDERS,
  resolveImageUrl,
};
