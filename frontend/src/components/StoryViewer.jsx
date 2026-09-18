/**
 * src/components/StoryViewer.jsx
 * ---------------------------------------------------------------------------
 * Trình xem story toàn màn hình: thanh tiến trình theo từng mục, tự chuyển sau
 * 5 giây (ảnh) hoặc đúng thời lượng (video), chạm trái/phải để lùi/tiến, Esc để đóng.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../config/urls.js';
import Avatar from './Avatar.jsx';
import { CloseIcon, BackIcon, HeartIcon, DownloadIcon } from './Icons.jsx';
import { useI18n } from '../i18n/index.js';
import { postsApi } from '../api/client.js';

const IMAGE_DURATION_MS = 5000;

export default function StoryViewer({ groups = [], startGroupIndex = 0, onClose, onSeen }) {
  const { t, timeAgo } = useI18n();
  const [groupIndex, setGroupIndex] = useState(startGroupIndex);
  const [itemIndex, setItemIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);

  const group = groups[groupIndex];
  const item = group?.posts?.[itemIndex];

  const advance = useCallback(() => {
    setItemIndex((currentItem) => {
      if (currentItem + 1 < (group?.posts?.length ?? 0)) return currentItem + 1;
      // hết nhóm này → sang nhóm kế tiếp
      setGroupIndex((currentGroup) => {
        if (currentGroup + 1 < groups.length) {
          setItemIndex(0);
          return currentGroup + 1;
        }
        onClose?.();
        return currentGroup;
      });
      return currentItem;
    });
  }, [group, groups.length, onClose]);

  const goBack = () => {
    if (itemIndex > 0) setItemIndex((current) => current - 1);
    else if (groupIndex > 0) {
      setGroupIndex((current) => current - 1);
      setItemIndex(0);
    }
  };

  /** Đồng hồ tiến trình: 5s cho ảnh, đúng thời lượng cho video. */
  useEffect(() => {
    if (!item || paused) return undefined;

    const total = item.isVideo && item.durationSeconds ? item.durationSeconds * 1000 : IMAGE_DURATION_MS;
    const stepMs = 50;
    let elapsed = 0;

    const timer = setInterval(() => {
      elapsed += stepMs;
      setProgress(Math.min(elapsed / total, 1));
      if (elapsed >= total) {
        clearInterval(timer);
        advance();
      }
    }, stepMs);

    return () => clearInterval(timer);
  }, [item, paused, advance]);

  useEffect(() => setProgress(0), [itemIndex, groupIndex]);

  /** Báo "đã xem" cho nhóm hiện tại. */
  useEffect(() => {
    if (group?.posts?.length) onSeen?.(group.posts.map((post) => post.id));
  }, [group, onSeen]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
      if (event.key === 'ArrowRight') advance();
      if (event.key === 'ArrowLeft') goBack();
      if (event.key === ' ') setPaused((value) => !value);
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [advance, onClose]);

  const download = () => {
    if (!item) return;
    const anchor = document.createElement('a');
    anchor.href = postsApi.downloadUrl(item.id);
    anchor.download = '';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const [liked, setLiked] = useState(false);
  const lastTap = useRef(0);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black" role="dialog" aria-modal="true">
      <div className="relative h-full w-full max-w-[430px] overflow-hidden bg-black md:h-[92vh] md:rounded-xl">
        {/* ---------------------------- thanh tiến trình --------------------------- */}
        <div className="absolute left-0 right-0 top-0 z-20 flex gap-1 p-3">
          {group.posts.map((post, index) => (
            <span key={post.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/35">
              <span
                className="block h-full bg-white transition-[width] duration-75 ease-linear"
                style={{ width: index < itemIndex ? '100%' : index === itemIndex ? `${progress * 100}%` : '0%' }}
              />
            </span>
          ))}
        </div>

        {/* -------------------------------- header -------------------------------- */}
        <header className="absolute left-0 right-0 top-4 z-20 flex items-center gap-2 px-3 pt-3 text-white">
          <Avatar src={group.author?.avatarUrl} name={group.author?.fullName} size="sm" />
          <Link to={ROUTES.profile(group.author?.username)} className="text-sm font-semibold">
            {group.author?.username}
          </Link>
          <span className="text-xs text-white/60">{timeAgo(item.createdAt)}</span>
          <button type="button" onClick={onClose} aria-label={t('viewer.close')} className="ml-auto p-1">
            <CloseIcon className="w-6 h-6" />
          </button>
        </header>

        {/* --------------------------------- media -------------------------------- */}
        <div
          className="relative h-full w-full"
          onClick={(event) => {
            const now = Date.now();
            if (now - lastTap.current < 300) {
              setLiked(true);
              setTimeout(() => setLiked(false), 800);
              lastTap.current = now;
              return;
            }
            lastTap.current = now;
            const rect = event.currentTarget.getBoundingClientRect();
            if (event.clientX - rect.left < rect.width * 0.35) goBack();
            else advance();
          }}
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerLeave={() => setPaused(false)}
        >
          {item.isVideo ? (
            <video
              key={item.id}
              src={item.videoUrl}
              poster={item.imageUrl || undefined}
              autoPlay
              playsInline
              loop
              className="h-full w-full object-contain"
            />
          ) : (
            <img key={item.id} src={item.imageUrl} alt="" className="h-full w-full object-contain" />
          )}

          {liked && (
            <HeartIcon
              filled
              className="pointer-events-none absolute left-1/2 top-1/2 w-24 h-24 -translate-x-1/2 -translate-y-1/2 text-white/90 animate-heart-pop"
            />
          )}

          {/* nút điều hướng cho desktop */}
          <button
            type="button"
            aria-label={t('viewer.previous')}
            onClick={(event) => {
              event.stopPropagation();
              goBack();
            }}
            className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25 md:block"
          >
            <BackIcon className="w-5 h-5" />
          </button>
        </div>

        {/* -------------------------------- footer -------------------------------- */}
        <footer className="absolute bottom-0 left-0 right-0 z-20 space-y-1 bg-gradient-to-t from-black/80 to-transparent px-4 pb-5 pt-10 text-white">
          {item.caption && <p className="text-sm">{item.caption}</p>}
          <div className="flex items-center gap-4 pt-1">
            <button
              type="button"
              onClick={() => setLiked((value) => !value)}
              aria-label={t('post.likes', { count: item.likeCount, total: item.likeCount })}
            >
              <HeartIcon filled={liked || item.likedByViewer} className={`w-6 h-6 ${liked || item.likedByViewer ? 'text-ig-red' : 'text-white'}`} />
            </button>
            <button type="button" onClick={download} aria-label={t('viewer.download')}>
              <DownloadIcon className="w-6 h-6" />
            </button>
            <span className="ml-auto text-xs text-white/70">{paused ? '❚❚' : '▶'}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
