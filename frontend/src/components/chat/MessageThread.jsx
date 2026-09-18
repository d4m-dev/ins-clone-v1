/**
 * src/components/chat/MessageThread.jsx
 * ---------------------------------------------------------------------------
 * Khung trò chuyện — bố cục và hành vi theo Instagram Direct:
 *   • bong bóng tin nhắn: của mình nền xanh chữ trắng (bên phải),
 *     của người kia nền xám (bên trái)
 *   • gom tin theo NGÀY, có vạch ngăn "Hôm nay / 12 tháng 9"
 *   • cuộn lên đầu = tự tải thêm tin cũ hơn, giữ nguyên vị trí đang xem
 *   • "Đã xem" dưới tin cuối của mình khi người kia đã đọc
 *   • tin nhắn chờ: hiện thanh Đồng ý / Từ chối trước khi trả lời
 *   • ảnh gửi kèm bấm vào là mở to; bài viết chia sẻ hiện thành thẻ
 *   • giữ chuột/chuột phải vào tin của mình → thu hồi (trong 60 phút)
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../../config/urls.js';
import { useI18n } from '../../i18n/index.js';
import { chatApi, postsApi } from '../../api/client.js';
import Avatar from '../Avatar.jsx';
import { Alert, SpinnerInline } from '../States.jsx';
import { BackIcon, TrashIcon, RequestIcon } from '../Icons.jsx';
import { formatDate, timeAgo } from '../../utils/format.js';
import { resolveImageUrl } from '../../../config/urls.js';
import ChatComposer from './ChatComposer.jsx';

/** Nhãn ngày cho vạch ngăn: Hôm nay · Hôm qua · 12 tháng 9, 2025. */
function dayLabel(input, t) {
  const date = new Date(input);
  const today = new Date();
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(date, today)) return t('chat.today');
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (same(date, yesterday)) return t('chat.yesterday');
  return formatDate(date);
}

/** Thẻ bài viết được chia sẻ trong hội thoại. */
function SharedPostCard({ postId }) {
  const { t } = useI18n();
  const [post, setPost] = useState(null);

  useEffect(() => {
    let alive = true;
    postsApi
      .byId(postId)
      .then((data) => alive && setPost(data?.post || data))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [postId]);

  return (
    <Link
      to={ROUTES.post(postId)}
      className="mt-1 block w-56 overflow-hidden rounded-xl border border-ink-line bg-white text-ink"
    >
      {post?.imageUrl ? (
        <img src={resolveImageUrl(post.imageUrl)} alt="" className="h-40 w-full object-cover" />
      ) : (
        <div className="flex h-24 w-full items-center justify-center bg-ink-bg text-2xl">📎</div>
      )}
      <div className="p-2">
        <p className="text-[11px] uppercase tracking-wide text-ink-soft">{t('chat.sharedPost')}</p>
        <p className="line-clamp-2 text-xs">{post?.caption || t('chat.viewPost')}</p>
      </div>
    </Link>
  );
}

/** Một bong bóng tin nhắn. */
function MessageBubble({ message, peerName, onUnsend, onZoom }) {
  const { t } = useI18n();
  const mine = message.mine;
  const [menuOpen, setMenuOpen] = useState(false);

  /** Thu hồi chỉ trong 60 phút (backend cũng chặn lại lần nữa). */
  const canUnsend =
    mine && !message.isDeleted && (Date.now() - new Date(message.createdAt).getTime()) / 60000 < 60;

  if (message.isDeleted) {
    return (
      <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
        <p className="rounded-2xl border border-dashed border-ink-line px-3 py-1.5 text-[13px] italic text-ink-soft">
          {t('chat.recalled')}
        </p>
      </div>
    );
  }

  return (
    <div className={`group flex items-end gap-1.5 ${mine ? 'justify-end' : 'justify-start'}`}>
      {mine && canUnsend && (
        <div className="relative self-center">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="rounded-full p-1 text-ink-soft opacity-0 transition group-hover:opacity-100"
            aria-label={t('chat.more')}
          >
            <TrashIcon className="h-4 w-4" />
          </button>
          {menuOpen && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onUnsend(message);
              }}
              className="absolute bottom-6 right-0 z-20 whitespace-nowrap rounded-lg border border-ink-line bg-white px-3 py-1.5 text-xs shadow-lg"
            >
              {t('chat.unsend')}
            </button>
          )}
        </div>
      )}

      <div className={`max-w-[75%] ${mine ? 'items-end' : 'items-start'}`}>
        {message.attachmentUrl && message.attachmentType === 'image' && (
          <button type="button" onClick={() => onZoom(message.attachmentUrl)} className="block">
            <img
              src={resolveImageUrl(message.attachmentUrl)}
              alt=""
              loading="lazy"
              className="mb-1 max-h-80 rounded-2xl object-cover"
            />
          </button>
        )}

        {message.attachmentUrl && message.attachmentType === 'video' && (
          <video
            src={resolveImageUrl(message.attachmentUrl)}
            controls
            playsInline
            className="mb-1 max-h-80 rounded-2xl"
          />
        )}

        {message.body && (
          <p
            className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-6
              ${mine ? 'bg-ig-blue text-white' : 'bg-ink-bg text-ink'}`}
          >
            {message.body}
          </p>
        )}

        {message.sharedPostId && <SharedPostCard postId={message.sharedPostId} />}

        <p className={`mt-0.5 px-1 text-[10px] text-ink-soft ${mine ? 'text-right' : 'text-left'}`}>
          {timeAgo(message.createdAt)}
          {!mine && peerName ? ` · ${peerName}` : ''}
        </p>
      </div>
    </div>
  );
}

export default function MessageThread({
  conversation,
  messages = [],
  hasMore = false,
  loadingOlder = false,
  loading = false,
  sending = false,
  peerTyping = false,
  connected = false,
  onLoadOlder,
  onSend,
  onAccept,
  onDecline,
  onUnsend,
  onBack,
  onRead,
}) {
  const { t } = useI18n();
  const [zoomUrl, setZoomUrl] = useState(null);
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const bottomRef = useRef(null);
  const lastCountRef = useRef(0);
  const prevScrollHeightRef = useRef(0);

  /** Nhóm tin theo ngày để chèn vạch ngăn. */
  const groups = useMemo(() => {
    const result = [];
    for (const message of messages) {
      const label = dayLabel(message.createdAt, t);
      const last = result[result.length - 1];
      if (last && last.label === label) last.items.push(message);
      else result.push({ label, items: [message] });
    }
    return result;
  }, [messages, t]);

  /** Cuộn xuống đáy khi mở hội thoại hoặc khi có tin mới. */
  useEffect(() => {
    const grewAtBottom = messages.length > lastCountRef.current;
    lastCountRef.current = messages.length;
    if (loadingOlder && prevScrollHeightRef.current) {
      // Đang tải tin cũ: giữ nguyên vị trí người dùng đang đọc.
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight - prevScrollHeightRef.current;
      prevScrollHeightRef.current = 0;
      return;
    }
    if (grewAtBottom) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, loadingOlder]);

  /** Tự tải tin cũ khi cuộn tới đầu danh sách. */
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || !hasMore || loadingOlder) return;
    if (el.scrollTop < 60) {
      prevScrollHeightRef.current = el.scrollHeight;
      onLoadOlder?.();
    }
  }, [hasMore, loadingOlder, onLoadOlder]);

  /** Đánh dấu đã đọc khi mở/thay đổi hội thoại. */
  useEffect(() => {
    if (conversation?.id) onRead?.(conversation.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]);

  const peer = conversation?.peer;
  const lastMine = [...messages].reverse().find((message) => message.mine && !message.isDeleted);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* ---------------------------------- đầu khung ------------------------ */}
      <header className="flex items-center gap-3 border-b border-ink-line px-3 py-2.5">
        <button type="button" onClick={onBack} className="rounded-full p-1 lg:hidden" aria-label={t('common.back')}>
          <BackIcon />
        </button>

        <Link to={ROUTES.profile(peer?.username || '')} className="flex min-w-0 items-center gap-3">
          <Avatar src={peer?.avatarUrl} name={peer?.fullName} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold">
              {peer?.fullName || peer?.username || t('chat.unknownUser')}
            </span>
            <span className="block truncate text-[11px] text-ink-soft">
              {peerTyping ? (
                <span className="text-ig-blue">{t('chat.typing')}</span>
              ) : connected ? (
                t('chat.realtimeOn')
              ) : (
                t('chat.realtimeOff')
              )}
            </span>
          </span>
        </Link>
      </header>

      {/* ------------------------------ thanh tin nhắn chờ -------------------- */}
      {conversation?.isRequest && (
        <div className="flex flex-col gap-2 border-b border-ink-line bg-ink-bg px-4 py-3">
          <p className="flex items-center gap-2 text-[13px]">
            <RequestIcon className="h-4 w-4 shrink-0" />
            {t('chat.requestHint', { name: peer?.fullName || peer?.username || '' })}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onAccept?.(conversation.id)}
              className="rounded-lg bg-ig-blue px-4 py-1.5 text-sm font-semibold text-white hover:bg-ig-blueHover"
            >
              {t('chat.accept')}
            </button>
            <button
              type="button"
              onClick={() => onDecline?.(conversation.id)}
              className="rounded-lg bg-ink-line px-4 py-1.5 text-sm font-semibold hover:bg-ink-faint"
            >
              {t('chat.decline')}
            </button>
          </div>
        </div>
      )}

      {/* -------------------------------- danh sách tin ----------------------- */}
      <div ref={listRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-soft">
            <SpinnerInline /> {t('common.loading')}
          </div>
        )}

        {!loading && hasMore && (
          <div className="mb-2 flex justify-center">
            <button
              type="button"
              onClick={onLoadOlder}
              className="rounded-full bg-ink-bg px-3 py-1 text-xs text-ink-soft hover:bg-ink-line"
            >
              {loadingOlder ? t('common.loading') : t('chat.loadOlder')}
            </button>
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="mx-auto max-w-xs py-12 text-center">
            <Avatar src={peer?.avatarUrl} name={peer?.fullName} size="lg" />
            <p className="mt-3 text-sm font-semibold">{peer?.fullName || peer?.username}</p>
            <p className="mt-1 text-xs text-ink-soft">{t('chat.sayHi', { name: peer?.username || '' })}</p>
          </div>
        )}

        {!loading &&
          groups.map((group) => (
            <div key={group.label} className="mb-3">
              <p className="my-3 text-center text-[11px] font-medium uppercase tracking-wide text-ink-soft">
                {group.label}
              </p>
              <div className="flex flex-col gap-1.5">
                {group.items.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    peerName={message.mine ? '' : peer?.fullName}
                    onUnsend={onUnsend}
                    onZoom={setZoomUrl}
                  />
                ))}
              </div>
            </div>
          ))}

        {lastMine?.seen && (
          <p className="pr-1 text-right text-[11px] text-ink-soft">
            {t('chat.seen')} · {timeAgo(lastMine.createdAt)}
          </p>
        )}

        {peerTyping && (
          <div className="flex justify-start">
            <span className="rounded-2xl bg-ink-bg px-4 py-2 text-ink-soft">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
              </span>
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ---------------------------------- soạn tin -------------------------- */}
      {error && (
        <div className="px-3 pt-2">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {conversation?.status === 'declined' ? (
        <p className="border-t border-ink-line px-4 py-3 text-center text-xs text-ink-soft">
          {t('chat.declinedHint')}
        </p>
      ) : (
        <ChatComposer
          conversationId={conversation?.id}
          onSend={async (payload) => {
            setError('');
            await onSend?.(payload);
          }}
          disabled={sending || !conversation}
          onError={(message) => setError(message)}
        />
      )}

      {/* --------------------------------- ảnh phóng to ----------------------- */}
      {zoomUrl && (
        <button
          type="button"
          onClick={() => setZoomUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          aria-label={t('common.close')}
        >
          <img src={resolveImageUrl(zoomUrl)} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
        </button>
      )}
    </div>
  );
}
