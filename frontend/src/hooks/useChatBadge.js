/**
 * src/hooks/useChatBadge.js
 * ---------------------------------------------------------------------------
 * Con số đỏ trên biểu tượng Tin nhắn (thanh bên + tab dưới).
 *
 * Vì sao không mở kênh SSE ở đây? Một kết nối realtime chỉ nên tồn tại khi
 * người dùng THỰC SỰ đang trong hộp thư (xem MessagesPage). Ở mọi trang khác,
 * hỏi `/api/chat/summary` theo nhịp thưa (45 giây) + mỗi lần quay lại tab là
 * đủ và rẻ hơn nhiều so với việc giữ một kết nối mở suốt ngày trên điện thoại.
 *
 * Sau khi đọc tin, MessagesPage phát sự kiện `chat:refresh` để badge cập nhật ngay.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from 'react';
import { chatApi } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const POLL_MS = 45_000;

export function useChatBadge() {
  const { isAuthenticated } = useAuth();
  const [summary, setSummary] = useState({ totalUnread: 0, pendingRequests: 0 });

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await chatApi.summary();
      setSummary({
        totalUnread: Number(data?.totalUnread || 0),
        pendingRequests: Number(data?.pendingRequests || 0),
      });
    } catch {
      /* mạng lỗi thì giữ nguyên số cũ — badge không được phép làm hỏng giao diện */
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    const onChatRefresh = () => refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('chat:refresh', onChatRefresh);
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('chat:refresh', onChatRefresh);
      clearInterval(timer);
    };
  }, [refresh]);

  return { ...summary, refresh };
}

/** Phát yêu cầu cập nhật badge từ bất kỳ đâu (sau khi đọc/gửi/xoá hội thoại). */
export const refreshChatBadge = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('chat:refresh'));
};

export default useChatBadge;
