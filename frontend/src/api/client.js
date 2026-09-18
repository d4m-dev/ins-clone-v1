/**
 * src/api/client.js
 * ---------------------------------------------------------------------------
 * The ONLY module in the frontend that talks to the network.
 * Every URL it uses comes from ./config/urls.js — nothing is hardcoded.
 *
 * Responsibilities
 *   • attach the JWT (`Authorization: Bearer …`)
 *   • normalise errors into an `ApiError` with a user-safe message
 *   • expose tiny typed helpers: apiGet / apiPost / apiPostForm / apiDelete
 * ---------------------------------------------------------------------------
 */

import { ENDPOINTS } from '../../config/urls.js';
// Dịch thông báo lỗi theo ngôn ngữ đang chọn (module thuần, không cần React).
import { getLocale, translate } from '../i18n/translate.js';

const TOKEN_KEY = 'pixgram.token';
/** Ngôn ngữ gửi kèm mỗi request để backend trả lỗi/validation cùng ngôn ngữ. */
const localeHeader = () => ({ 'Accept-Language': getLocale() });

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR', details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const tokenStorage = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* private mode */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

/** Called when the backend answers 401 so the UI can log the user out. */
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = typeof handler === 'function' ? handler : () => {};
};

async function request(url, { method = 'GET', body, isForm = false, signal } = {}) {
  const headers = { ...localeHeader() };
  const token = tokenStorage.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isForm) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
      signal,
      credentials: 'omit',
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(translate(getLocale(), 'error.network'));
  }

  // 204 / empty bodies
  const text = await response.text();
  const payload = text ? safeParse(text) : {};

  if (!response.ok) {
    if (response.status === 401) {
      tokenStorage.clear();
      onUnauthorized();
    }
    // Backend đã trả message theo Accept-Language; chỉ dịch khi thiếu message.
    throw new ApiError(payload?.message || translate(getLocale(), 'error.http', { status: response.status }), {
      status: response.status,
      code: payload?.code || 'HTTP_ERROR',
      details: payload?.details ?? null,
    });
  }

  return payload?.data ?? payload;
}

const safeParse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

export const apiGet = (url, options) => request(url, { ...options, method: 'GET' });
export const apiPost = (url, body, options) => request(url, { ...options, method: 'POST', body });
export const apiDelete = (url, options) => request(url, { ...options, method: 'DELETE' });
export const apiPostForm = (url, formData, options) =>
  request(url, { ...options, method: 'POST', body: formData, isForm: true });

/* -------------------------------------------------------------------------- */
/*                        Domain helpers (thin wrappers)                     */
/* -------------------------------------------------------------------------- */

export const authApi = {
  /** payload có thể kèm `inviteToken` khi thành viên vào bằng link mời. */
  register: (payload) => apiPost(ENDPOINTS.auth.register, payload),
  login: (payload) => apiPost(ENDPOINTS.auth.login, payload),
  me: () => apiGet(ENDPOINTS.auth.me),
  publicConfig: () => apiGet(ENDPOINTS.config),
  /** Gửi email chứa link đặt lại mật khẩu (luôn trả thông báo chung). */
  forgotPassword: (payload) => apiPost(ENDPOINTS.auth.forgotPassword, payload),
  /** Đổi mật khẩu bằng token trong email. */
  resetPassword: (payload) => apiPost(ENDPOINTS.auth.resetPassword, payload),
};

export const invitesApi = {
  /** Công khai: kiểm tra link mời trước khi hiện form đăng ký. */
  check: (token, options) => apiGet(ENDPOINTS.invites.check(token), options),

  /* ------------------------- dành cho quản trị viên ---------------------- */
  create: (payload) => apiPost(ENDPOINTS.invites.create, payload),
  list: () => apiGet(ENDPOINTS.invites.list),
  stats: () => apiGet(ENDPOINTS.invites.stats),
  revoke: (id) => apiDelete(ENDPOINTS.invites.revoke(id)),
};

export const postsApi = {
  list: ({ page = 1, limit = 12, userId, mediaType } = {}, options) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (userId) params.set('userId', String(userId));
    if (mediaType) params.set('mediaType', mediaType);
    return apiGet(`${ENDPOINTS.posts.list}?${params.toString()}`, options);
  },
  byId: (id) => apiGet(ENDPOINTS.posts.byId(id)),
  stats: () => apiGet(ENDPOINTS.posts.stats),

  /**
   * Đăng bài. Dùng FormData nên trình duyệt tự đặt boundary; TÊN TRƯỜNG phải
   * khớp multer ở backend: "image" (ảnh/bìa), "video" (Reels), "audio" (nhạc nền).
   *
   * @param {File}   file      ảnh, hoặc ảnh bìa khi đăng video
   * @param {File}   [video]   video dọc cho Reels
   * @param {File}   [audio]   nhạc nền không bắt buộc
   * @param {number} [durationSeconds]  thời lượng client đo được (backend vẫn đọc lại từ mvhd)
   */
  upload: ({ file, video, audio, caption, location, audioTitle, durationSeconds } = {}) => {
    const form = new FormData();
    if (file) form.append('image', file);
    if (video) form.append('video', video);
    if (audio) form.append('audio', audio);
    if (caption) form.append('caption', caption);
    if (location) form.append('location', location);
    if (audioTitle) form.append('audioTitle', audioTitle);
    if (durationSeconds != null) form.append('durationSeconds', String(durationSeconds));
    return apiPostForm(ENDPOINTS.posts.create, form);
  },

  remove: (id) => apiDelete(ENDPOINTS.posts.byId(id)),
  toggleLike: (id) => apiPost(ENDPOINTS.posts.like(id)),
  comments: (id) => apiGet(ENDPOINTS.posts.comments(id)),
  addComment: (id, body) => apiPost(ENDPOINTS.posts.comments(id), { body }),

  /** Đếm lượt xem (gọi 1 lần khi video/ảnh thực sự hiển thị). */
  incrementView: (id) => apiPost(ENDPOINTS.posts.views(id)),

  /**
   * URL tải tệp gốc. Trả về URL chứ không tự fetch để thẻ <a download> hoặc
   * trình duyệt xử lý trực tiếp header Content-Disposition của backend.
   */
  downloadUrl: (id) => ENDPOINTS.posts.download(id),
};

/** Reels — dòng video dọc. */
export const reelsApi = {
  list: ({ page = 1, limit = 6 } = {}, options) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    return apiGet(`${ENDPOINTS.reels.list}?${params.toString()}`, options);
  },
  byId: (id) => apiGet(ENDPOINTS.reels.byId(id)),
};

/** Khoảnh khắc 24 giờ, gom theo tác giả. */
export const storiesApi = {
  list: () => apiGet(ENDPOINTS.stories.list),
};

export const usersApi = {
  posts: (id) => apiGet(ENDPOINTS.users.posts(id)),
  myPosts: () => apiGet(ENDPOINTS.users.mePosts),
};

export const commentsApi = {
  remove: (id) => apiDelete(ENDPOINTS.comments.byId(id)),
};

/**
 * Chat 1-1 (kiểu Instagram Direct).
 *
 * Ghi chú kỹ thuật:
 *   • `sendFile` / `sendFormToUser` dùng FormData với TÊN TRƯỜNG "attachment" —
 *     phải khớp multer ở backend (chatAttachmentUploader). Không tự đặt Content-Type.
 *   • `openStream` KHÔNG dùng EventSource vì EventSource không gửi được header
 *     Authorization; nó nối bằng fetch và đọc luồng SSE thủ công. Nhờ vậy token
 *     không bao giờ lọt vào URL (và vào access log của Cloudflare).
 */
export const chatApi = {
  conversations: ({ box = 'inbox', limit = 50 } = {}, options) =>
    apiGet(`${ENDPOINTS.chat.conversations}?box=${box}&limit=${limit}`, options),

  openConversation: (userId) => apiPost(ENDPOINTS.chat.conversations, { userId }),
  conversation: (id, options) => apiGet(ENDPOINTS.chat.conversation(id), options),
  hideConversation: (id) => apiDelete(ENDPOINTS.chat.conversation(id)),

  /** `before` = id tin cũ nhất đang có → tải thêm tin cũ hơn khi cuộn lên. */
  messages: (id, { before, limit } = {}, options) => {
    const params = new URLSearchParams();
    if (before) params.set('before', String(before));
    if (limit) params.set('limit', String(limit));
    const query = params.toString();
    return apiGet(`${ENDPOINTS.chat.messages(id)}${query ? `?${query}` : ''}`, options);
  },

  send: (id, { body, sharedPostId } = {}) =>
    apiPost(ENDPOINTS.chat.messages(id), { body, sharedPostId }),

  /** Gửi kèm tệp vào hội thoại đã biết id. */
  sendFile: (id, { file, body, sharedPostId } = {}) => {
    const form = new FormData();
    if (file) form.append('attachment', file);
    if (body) form.append('body', body);
    if (sharedPostId != null) form.append('sharedPostId', String(sharedPostId));
    return apiPostForm(ENDPOINTS.chat.messages(id), form);
  },

  /** Gửi nhanh khi chưa biết id hội thoại (nút chia sẻ bài viết). */
  sendToUser: ({ userId, body, sharedPostId }) =>
    apiPost(ENDPOINTS.chat.send, { toUserId: userId, body, sharedPostId }),

  sendFormToUser: ({ userId, file, body, sharedPostId }) => {
    const form = new FormData();
    form.append('toUserId', String(userId));
    if (file) form.append('attachment', file);
    if (body) form.append('body', body);
    if (sharedPostId != null) form.append('sharedPostId', String(sharedPostId));
    return apiPostForm(ENDPOINTS.chat.send, form);
  },

  markRead: (id) => apiPost(ENDPOINTS.chat.read(id), {}),
  /** Báo "đang nhập…" (nơi gọi tự giới hạn tần suất, xem ChatComposer). */
  typing: (id, typing = true) => apiPost(ENDPOINTS.chat.typing(id), { typing }),
  accept: (id) => apiPost(ENDPOINTS.chat.accept(id), {}),
  decline: (id) => apiPost(ENDPOINTS.chat.decline(id), {}),
  unsend: (messageId) => apiDelete(ENDPOINTS.chat.message(messageId)),

  summary: (options) => apiGet(ENDPOINTS.chat.summary, options),
  people: (query, options) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    const suffix = params.toString();
    return apiGet(`${ENDPOINTS.chat.people}${suffix ? `?${suffix}` : ''}`, options);
  },

  /**
   * Mở kênh thời gian thực (SSE). Trả về Response để nơi gọi đọc `body`.
   * Ném lỗi nếu không có token hoặc mạng hỏng — nơi gọi tự chuyển sang hỏi định kỳ.
   */
  openStream: async ({ signal } = {}) => {
    const token = tokenStorage.get();
    if (!token) throw new ApiError(translate(getLocale(), 'error.sessionExpired'), { status: 401 });
    return fetch(ENDPOINTS.chat.stream, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream', ...localeHeader() },
      signal,
      credentials: 'omit',
    });
  },
};

export default {
  ApiError,
  tokenStorage,
  setUnauthorizedHandler,
  apiGet,
  apiPost,
  apiDelete,
  apiPostForm,
  authApi,
  postsApi,
  reelsApi,
  storiesApi,
  usersApi,
  commentsApi,
  chatApi,
};
