'use strict';

/**
 * admin/locales/index.js
 * ---------------------------------------------------------------------------
 * Tập hợp cấu hình `locale` cho AdminJS v7.
 *
 * BỐI CẢNH (đã kiểm tra trên adminjs@7.8.13): AdminJS chỉ phát hành sẵn 9 gói
 * ngôn ngữ — de · en · es · it · ja · pl · pt-BR · ua · zh-CN. KHÔNG có tiếng
 * Việt, nên ta tự cung cấp bộ dịch `vi` đầy đủ (locales/adminjs.vi.json) và
 * giữ nguyên gói zh-CN + en có sẵn cho hai ngôn ngữ phụ.
 *
 * Kết quả: trang /admin có nút chọn ngôn ngữ riêng (vi · en · zh-CN), mặc định
 * là tiếng Việt, ghi nhớ lựa chọn qua localStorage (localeDetection).
 * ---------------------------------------------------------------------------
 */

const vi = require('./adminjs.vi.json');

/**
 * Nhãn tên ngôn ngữ hiển thị trong nút chọn ngôn ngữ của AdminJS.
 * Gói gốc ghi "Vietnamese" / "Chinese" bằng tiếng Anh — ta ghi đè để luôn hiện
 * đúng tên bản địa (endonym) bất kể giao diện đang ở ngôn ngữ nào.
 */
const ENDONYMS = {
  vi: 'Tiếng Việt',
  en: 'English',
  'zh-CN': '中文',
};

/** Nhãn tiếng Việt cho trang đăng nhập khi giao diện đang là tiếng Anh/Trung. */
const loginLabels = {
  vi: {
    welcomeHeader: vi.components.Login.welcomeHeader,
    welcomeMessage: vi.components.Login.welcomeMessage,
    properties: vi.components.Login.properties,
    loginButton: vi.components.Login.loginButton,
  },
  en: {
    properties: { email: 'E-mail (admin)', password: 'Mật khẩu' },
  },
  'zh-CN': {
    properties: { email: '邮箱（管理员）', password: '密码' },
  },
};

/** Gói 'en' ghi đè tối thiểu: chỉ đổi tên ngôn ngữ + gợi ý về bản địa hoá. */
const en = {
  components: {
    LanguageSelector: { availableLanguages: ENDONYMS },
    Login: loginLabels.en,
  },
  labels: { dashboard: 'Dashboard', User: 'Members', Post: 'Photos', Comment: 'Comments', Like: 'Likes' },
};

/** Gói 'zh-CN' (AdminJS có sẵn) — chỉ vá tên ngôn ngữ + nhãn tài nguyên của ta. */
const zhCN = {
  components: {
    LanguageSelector: { availableLanguages: ENDONYMS },
    Login: loginLabels['zh-CN'],
  },
  labels: { User: '成员', Post: '照片', Comment: '评论', Like: '点赞' },
};

/**
 * Trả về object `locale` hoàn chỉnh cho `new AdminJS({ locale })`.
 *
 * @param {object} [options]
 * @param {string} [options.language]  ngôn ngữ mặc định ('vi')
 * @param {string[]} [options.availableLanguages] danh sách cho nút chọn
 * @param {boolean} [options.detection] bật ghi nhớ lựa chọn của người dùng
 */
function buildAdminLocale({
  language = 'vi',
  availableLanguages = ['vi', 'en', 'zh-CN'],
  detection = true,
} = {}) {
  // Gói dựng sẵn của AdminJS (nếu gói đã được cài) — dùng để lọc danh sách.
  let builtIn = {};
  try {
    // eslint-disable-next-line global-require
    builtIn = require('adminjs').locales || {};
  } catch {
    builtIn = {}; // ví dụ khi chạy unit test mà chưa cài adminjs
  }

  // Chỉ giữ những ngôn ngữ thực sự có gói (vi do chúng ta tự cung cấp).
  const supported = availableLanguages.filter(
    (code) => ['vi', 'en', 'zh-CN'].includes(code) || Boolean(builtIn[code])
  );
  const languages = supported.length ? supported : ['vi', 'en'];
  const fallbackLanguage = languages.includes(language) ? language : languages[0];

  return {
    language: fallbackLanguage,
    availableLanguages: languages,
    localeDetection: detection,
    // Gói dựng sẵn của AdminJS vẫn được dùng (en, zh-CN…); 'vi' là của chúng ta.
    translations: { vi, en, 'zh-CN': zhCN },
  };
}

module.exports = { buildAdminLocale, ENDONYMS, viTranslations: vi };
