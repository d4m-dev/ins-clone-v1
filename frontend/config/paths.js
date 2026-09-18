/**
 * config/paths.js  (FRONTEND)
 * The only place where the route *prefixes* of the backend live.
 * `config/urls.js` composes the concrete endpoints from these prefixes.
 */

const trim = (value) => `/${String(value || '').replace(/^\/+|\/+$/g, '')}`;

export const API_PREFIX = trim(import.meta.env.VITE_API_PREFIX || 'api');
export const UPLOADS_PREFIX = trim(import.meta.env.VITE_UPLOADS_PREFIX || 'uploads');

export default { api: API_PREFIX, uploads: UPLOADS_PREFIX };
