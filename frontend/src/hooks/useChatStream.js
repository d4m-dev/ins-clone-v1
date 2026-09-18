/**
 * src/hooks/useChatStream.js
 * ---------------------------------------------------------------------------
 * Kênh thời gian thực của chat.
 *
 * Cách hoạt động:
 *   1. Mở kết nối SSE bằng `fetch` (KHÔNG dùng EventSource, vì EventSource
 *      không gửi được header Authorization — token sẽ lộ trong URL).
 *   2. Đọc luồng, cắt từng sự kiện `event: x\ndata: {...}\n\n` rồi gọi callback.
 *   3. Nếu kết nối đứt (mạng đổi, tunnel restart, proxy cắt), tự nối lại với
 *      khoảng chờ tăng dần (1s → 2s → 4s … tối đa 30s) và vẫn hỏi định kỳ
 *      `/api/chat/summary` để badge không bị "kẹt" khi SSE bị chặn hoàn toàn.
 *
 * Trả về: { connected } — giao diện dùng để hiện chấm xanh "trực tuyến".
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { chatApi } from '../api/client.js';

/** Nhịp hỏi dự phòng khi KHÔNG có kết nối realtime (ms). */
const FALLBACK_POLL_MS = Number(import.meta.env.VITE_CHAT_POLL_MS || 8000);
/** Nhịp hỏi dự phòng khi ĐANG có kết nối (chỉ để đồng bộ, rất thưa). */
const RECONCILE_MS = 60_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * @param {object}   options
 * @param {Function} options.onEvent  nhận (eventName, payload)
 * @param {boolean}  [options.enabled]
 */
export function useChatStream({ onEvent, enabled = true } = {}) {
  const [connected, setConnected] = useState(false);
  const connectedRef = useRef(false);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  const pollRef = useRef(null);
  const abortRef = useRef(null);
  const retryRef = useRef(0);
  const stoppedRef = useRef(false);

  /** Hỏi định kỳ: dùng khi SSE không khả dụng. */
  const pollOnce = useCallback(async () => {
    try {
      const data = await chatApi.summary();
      handlerRef.current?.('summary', data);
    } catch {
      /* im lặng: đây chỉ là nhịp đồng bộ nền */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    stoppedRef.current = false;
    let reconnectTimer = null;

    const scheduleReconnect = () => {
      if (stoppedRef.current) return;
      const delay = Math.min(1000 * 2 ** retryRef.current, MAX_BACKOFF_MS);
      retryRef.current = Math.min(retryRef.current + 1, 5);
      reconnectTimer = setTimeout(connect, delay);
    };

    async function connect() {
      if (stoppedRef.current) return;
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await chatApi.openStream({ signal: controller.signal });
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

        setConnected(true);
        connectedRef.current = true;
        retryRef.current = 0;
        // Sau khi nối lại, đồng bộ lại một lần để không sót tin trong lúc đứt.
        pollOnce();

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Mỗi khung SSE cách nhau bằng một dòng trống.
          let separator = buffer.indexOf('\n\n');
          while (separator !== -1) {
            const frame = buffer.slice(0, separator);
            buffer = buffer.slice(separator + 2);
            separator = buffer.indexOf('\n\n');

            if (!frame || frame.startsWith(':')) continue; // heartbeat
            let event = 'message';
            const dataLines = [];
            for (const line of frame.split('\n')) {
              if (line.startsWith('event:')) event = line.slice(6).trim();
              else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
            }
            if (!dataLines.length) continue;
            try {
              handlerRef.current?.(event, JSON.parse(dataLines.join('\n')));
            } catch {
              /* dữ liệu lạ → bỏ qua, không làm chết luồng */
            }
          }
        }
        setConnected(false);
        connectedRef.current = false;
        scheduleReconnect();
      } catch (error) {
        if (error.name === 'AbortError') return;
        setConnected(false);
        connectedRef.current = false;
        scheduleReconnect();
      }
    }

    connect();

    /**
     * Nhịp đồng bộ tự hẹn lại: dày khi MẤT realtime (8s), thưa khi đang có
     * (60s). Dùng setTimeout thay vì setInterval để nhịp đổi được ngay khi
     * trạng thái kết nối thay đổi.
     */
    let pollTimer = null;
    const scheduleNextPoll = (first = false) => {
      const delay = first ? 1500 : connectedRef.current ? RECONCILE_MS : FALLBACK_POLL_MS;
      pollTimer = setTimeout(async () => {
        await pollOnce();
        scheduleNextPoll();
      }, delay);
    };
    scheduleNextPoll(true);
    pollRef.current = pollTimer;

    return () => {
      stoppedRef.current = true;
      clearTimeout(pollRef.current);
      clearTimeout(reconnectTimer);
      abortRef.current?.abort();
      setConnected(false);
    };
    // `connected` cố ý không nằm trong deps: đổi nhịp không cần nối lại SSE.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pollOnce]);

  return { connected };
}

export default useChatStream;
