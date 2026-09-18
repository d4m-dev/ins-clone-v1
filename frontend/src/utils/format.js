/**
 * src/utils/format.js
 * ---------------------------------------------------------------------------
 * Định dạng số / thời gian / dung lượng THEO NGÔN NGỮ ĐANG CHỌN.
 * Không hardcode chuỗi tiếng Anh nào — mọi thứ đi qua src/i18n/translate.js.
 *
 *   formatCount(1200)  →  "1,2 N" (vi) · "1.2K" (en) · "1.2万" (zh)
 *   timeAgo(date)      →  "3 giờ trước" · "3 hours ago" · "3小时前"
 * ---------------------------------------------------------------------------
 */

import { formatNumber, formatRelativeTime, getLocale } from '../i18n/translate.js';

/** Số rút gọn kiểu Instagram (lượt thích, bình luận). */
export const formatCount = (value) => formatNumber(getLocale(), value, { compact: true });

/** Số đầy đủ, có dấu phân cách theo locale. */
export const formatFullNumber = (value) => formatNumber(getLocale(), value);

/** Thời gian tương đối — Intl.RelativeTimeFormat lo phần ngữ pháp. */
export const timeAgo = (input) => formatRelativeTime(getLocale(), input);

/** Ngày giờ đầy đủ (dùng cho tooltip / trang chi tiết). */
export const formatDate = (input) =>
  new Intl.DateTimeFormat(getLocale(), { dateStyle: 'long', timeStyle: 'short' }).format(new Date(input));

/** Dung lượng: 4.2 MB — số cũng theo locale. */
export const formatBytes = (bytes) => {
  const value = Number(bytes || 0);
  const locale = getLocale();
  if (value < 1024) return `${formatNumber(locale, value)} B`;
  if (value < 1024 * 1024) return `${formatNumber(locale, value / 1024)} KB`;
  if (value < 1024 * 1024 * 1024) return `${formatNumber(locale, value / 1024 / 1024)} MB`;
  return `${formatNumber(locale, value / 1024 / 1024 / 1024)} GB`;
};

/** Chữ cái đầu của tên — dùng cho avatar khi không có ảnh. */
export const initialsOf = (value = '?') =>
  String(value)
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
