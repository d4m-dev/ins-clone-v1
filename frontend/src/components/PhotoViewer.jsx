/**
 * src/components/PhotoViewer.jsx
 * ---------------------------------------------------------------------------
 * Trình xem ảnh/video toàn màn hình kiểu Instagram:
 *   • chạm đúp (hoặc double-click) để phóng to / thu nhỏ
 *   • pinch-zoom hai ngón, kéo để di chuyển khi đã phóng to
 *   • vuốt ngang để chuyển ảnh (khi chưa phóng to)
 *   • phím ← → để chuyển, Esc để đóng
 *   • nút tải về (ảnh hoặc video gốc)
 * Chỉ dùng Pointer Events + CSS transform: không cần thư viện ngoài.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { postsApi } from '../api/client.js';
import { useI18n } from '../i18n/index.js';
import Avatar from './Avatar.jsx';
import { CloseIcon, HeartIcon, ShareIcon, DownloadIcon, BackIcon } from './Icons.jsx';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../config/urls.js';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const SWIPE_THRESHOLD = 60;

export default function PhotoViewer({ items = [], startIndex = 0, onClose, onLike }) {
  const { t, timeAgo, count } = useI18n();
  const [index, setIndex] = useState(Math.min(Math.max(startIndex, 0), Math.max(items.length - 1, 0)));

  /* ----------------------------- trạng thái zoom ---------------------------- */
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [burst, setBurst] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  const pointers = useRef(new Map());
  const gesture = useRef({ startX: 0, startY: 0, startOffset: { x: 0, y: 0 }, startDistance: 0, startScale: 1, moved: false });
  const lastTap = useRef(0);

  const current = items[index] || null;
  const isVideo = current?.isVideo || current?.mediaType === 'video';

  /** Đưa về trạng thái ban đầu mỗi khi đổi ảnh. */
  const resetView = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setError(null);
  }, []);

  useEffect(resetView, [index, resetView]);

  const goTo = useCallback(
    (direction) => {
      setIndex((current) => {
        const next = current + direction;
        if (next < 0 || next >= items.length) return current;
        return next;
      });
    },
    [items.length]
  );

  /* --------------------------- bàn phím & khoá cuộn ------------------------- */
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
      if (event.key === 'ArrowRight') goTo(1);
      if (event.key === 'ArrowLeft') goTo(-1);
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [goTo, onClose]);

  /* ------------------------------- cử chỉ ---------------------------------- */
  const onPointerDown = (event) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const list = [...pointers.current.values()];
    gesture.current.startOffset = { ...offset };
    gesture.current.moved = false;

    if (list.length === 1) {
      gesture.current.startX = list[0].x;
      gesture.current.startY = list[0].y;
      setDragging(true);
    } else if (list.length === 2) {
      // pinch: ghi lại khoảng cách ban đầu
      gesture.current.startDistance = Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
      gesture.current.startScale = scale;
    }
  };

  const onPointerMove = (event) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const list = [...pointers.current.values()];

    if (list.length === 2) {
      const distance = Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
      const ratio = gesture.current.startDistance ? distance / gesture.current.startDistance : 1;
      setScale(Math.min(Math.max(gesture.current.startScale * ratio, 1), MAX_SCALE));
      gesture.current.moved = true;
      return;
    }

    if (list.length === 1) {
      const dx = list[0].x - gesture.current.startX;
      const dy = list[0].y - gesture.current.startY;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) gesture.current.moved = true;

      if (scale > 1) {
        setOffset({ x: gesture.current.startOffset.x + dx, y: gesture.current.startOffset.y + dy });
      } else {
        // chưa phóng to → kéo ngang là "vuốt để chuyển ảnh"
        setOffset({ x: dx, y: 0 });
      }
    }
  };

  const onPointerUp = (event) => {
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(event.pointerId);

    if (pointers.current.size === 0) {
      setDragging(false);
      const dx = offset.x;

      if (wasSingle && scale === 1 && Math.abs(dx) > SWIPE_THRESHOLD) {
        goTo(dx < 0 ? 1 : -1);
        setOffset({ x: 0, y: 0 });
        return;
      }
      // giới hạn vùng kéo khi đã phóng to
      if (scale > 1) {
        const limitX = (scale - 1) * 160;
        const limitY = (scale - 1) * 220;
        setOffset({
          x: Math.max(-limitX, Math.min(limitX, offset.x)),
          y: Math.max(-limitY, Math.min(limitY, offset.y)),
        });
      } else {
        setOffset({ x: 0, y: 0 });
      }
    }
  };

  /** Chạm đúp: phóng to tại điểm chạm hoặc thu nhỏ về 1×. */
  const handleDoubleTap = (event) => {
    const now = Date.now();
    const isDouble = now - lastTap.current < 300;
    lastTap.current = now;
    if (!isDouble) return;

    if (scale > 1) {
      resetView();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const pointX = event.clientX - rect.left - rect.width / 2;
    const pointY = event.clientY - rect.top - rect.height / 2;
    setScale(DOUBLE_TAP_SCALE);
    setOffset({ x: -pointX * (DOUBLE_TAP_SCALE - 1), y: -pointY * (DOUBLE_TAP_SCALE - 1) });
  };

  /** Chạm đúp để thích — giống Instagram. */
  const handleMediaClick = () => {
    if (gesture.current.moved) return; // vừa kéo/vuốt thì không tính là chạm
    const now = Date.now();
    if (now - lastTap.current < 300) {
      setBurst(true);
      setTimeout(() => setBurst(false), 700);
      if (current && !current.likedByViewer) onLike?.(current.id);
    }
    lastTap.current = now;
  };

  /* ------------------------------ tải tệp về ------------------------------- */
  const download = async () => {
    if (!current) return;
    setDownloading(true);
    setError(null);
    try {
      // Dùng route có Content-Disposition: attachment nên trình duyệt tải thẳng.
      const response = await fetch(postsApi.downloadUrl(current.id));
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = current.isVideo ? `pixgram-${current.id}.mp4` : `pixgram-${current.id}.jpg`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      setError(t('viewer.downloadFailed'));
    } finally {
      setDownloading(false);
    }
  };

  const share = async () => {
    const url = `${window.location.origin}${ROUTES.post(current.id)}`;
    try {
      if (navigator.share) await navigator.share({ title: t('app.name'), url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* đã huỷ */
    }
  };

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 animate-fade-in" role="dialog" aria-modal="true">
      {/* -------------------------------- header ------------------------------- */}
      <header className="flex items-center gap-3 px-4 py-3 text-white">
        <button type="button" onClick={onClose} aria-label={t('viewer.close')} className="p-1">
          <CloseIcon className="w-6 h-6" />
        </button>

        <Link to={ROUTES.profile(current.author?.username)} className="flex items-center gap-2">
          <Avatar src={current.author?.avatarUrl} name={current.author?.fullName} size="sm" />
          <span className="text-sm font-semibold">{current.author?.username}</span>
        </Link>

        <span className="ml-auto text-xs text-white/70">
          {items.length > 1 ? t('viewer.counter', { current: index + 1, total: items.length }) : timeAgo(current.createdAt)}
        </span>

        <button
          type="button"
          onClick={download}
          disabled={downloading}
          aria-label={t('viewer.download')}
          className="rounded-full border border-white/30 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          <span className="flex items-center gap-1.5">
            <DownloadIcon className="w-4 h-4" />
            {downloading ? t('viewer.downloading') : t('viewer.download')}
          </span>
        </button>
      </header>

      {/* --------------------------------- media ------------------------------ */}
      <div
        className="relative flex flex-1 select-none items-center justify-center overflow-hidden touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={handleMediaClick}
        onDoubleClick={handleDoubleTap}
        style={{ cursor: scale > 1 ? 'grab' : 'default' }}
      >
        <div
          className={`relative max-h-full max-w-full ${dragging ? '' : 'transition-transform duration-200'}`}
          style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})` }}
        >
          {isVideo ? (
            <video
              src={current.videoUrl}
              poster={current.imageUrl || undefined}
              controls
              autoPlay
              playsInline
              loop
              className="max-h-[80vh] max-w-full"
            />
          ) : (
            <img
              src={current.imageUrl}
              alt={current.caption || ''}
              draggable={false}
              className="max-h-[80vh] max-w-full object-contain"
            />
          )}
          {burst && (
            <HeartIcon
              filled
              className="pointer-events-none absolute left-1/2 top-1/2 w-28 h-28 -translate-x-1/2 -translate-y-1/2 text-white/90 animate-heart-pop"
            />
          )}
        </div>

        {/* điều hướng bằng nút (desktop) */}
        {items.length > 1 && (
          <>
            <button
              type="button"
              aria-label={t('viewer.previous')}
              onClick={(event) => {
                event.stopPropagation();
                goTo(-1);
              }}
              className="absolute left-2 hidden md:flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
            >
              <BackIcon className="w-6 h-6" />
            </button>
            <button
              type="button"
              aria-label={t('viewer.next')}
              onClick={(event) => {
                event.stopPropagation();
                goTo(1);
              }}
              className="absolute right-2 hidden md:flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
            >
              <BackIcon className="w-6 h-6 rotate-180" />
            </button>
          </>
        )}
      </div>

      {/* -------------------------------- footer ------------------------------ */}
      <footer className="space-y-1 px-4 py-4 text-white">
        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-label={t('post.likes', { count: current.likeCount, total: count(current.likeCount) })}
            onClick={() => onLike?.(current.id)}
          >
            <HeartIcon filled={current.likedByViewer} className={`w-6 h-6 ${current.likedByViewer ? 'text-ig-red' : 'text-white'}`} />
          </button>
          <button type="button" aria-label={t('common.copyLink')} onClick={share}>
            <ShareIcon className="w-6 h-6" />
          </button>
          <span className="ml-auto text-sm font-semibold">
            {t('post.likes', { count: current.likeCount, total: count(current.likeCount) })}
          </span>
        </div>

        {current.caption && (
          <p className="text-sm">
            <span className="mr-1.5 font-semibold">{current.author?.username}</span>
            {current.caption}
          </p>
        )}
        {current.location && <p className="text-xs text-white/70">{current.location}</p>}

        <p className="text-[11px] text-white/50">
          {t('viewer.zoomHint')} · {timeAgo(current.createdAt)}
        </p>
        {error && <p className="text-xs text-ig-red">{error}</p>}
      </footer>
    </div>
  );
}
