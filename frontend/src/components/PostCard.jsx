/**
 * src/components/PostCard.jsx
 * Thẻ bài viết kiểu Instagram: header · ảnh vuông · hàng nút · lượt thích ·
 * chú thích · bình luận. Mọi chữ hiển thị đều đi qua i18n.
 */

import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES, resolveImageUrl } from '../../config/urls.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n/index.js';
import Avatar from './Avatar.jsx';
import CommentSection from './CommentSection.jsx';
import {
  HeartIcon,
  CommentIcon,
  ShareIcon,
  BookmarkIcon,
  MoreIcon,
  TrashIcon,
  PlayIcon,
  DownloadIcon,
  MessengerIcon,
} from './Icons.jsx';
import PersonPickerDialog from './chat/PersonPickerDialog.jsx';

export default function PostCard({ post, onLike, onDelete, onCommentAdded, onOpenViewer, defaultShowComments = false }) {
  const { user } = useAuth();
  const { t, count, timeAgo } = useI18n();
  const [showComments, setShowComments] = useState(defaultShowComments);
  const [showMenu, setShowMenu] = useState(false);
  /** Hộp thoại "gửi vào tin nhắn" (giống Instagram: bài viết gửi kèm thẻ). */
  const [shareOpen, setShareOpen] = useState(false);
  const [burst, setBurst] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [bookmarked, setBookmarked] = useState(false);
  const lastTap = useRef(0);

  const canDelete = post.canDelete ?? (user && Number(user.id) === Number(post.author?.id));

  /** Nhấn đúp (mobile) / double-click (desktop) để thích — giống Instagram. */
  const handleMediaClick = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!post.likedByViewer) handleLike();
      setBurst(true);
      setTimeout(() => setBurst(false), 700);
    }
    lastTap.current = now;
  };

  const handleLike = async () => {
    if (!user || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onLike?.(post.id);
    } catch {
      setError(t('post.likeFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setShowMenu(false);
    if (!window.confirm(t('post.deleteConfirm'))) return;
    try {
      await onDelete?.(post.id);
    } catch {
      setError(t('post.deleteFailed'));
    }
  };

  const share = async () => {
    const url = `${window.location.origin}${ROUTES.post(post.id)}`;
    try {
      if (navigator.share) await navigator.share({ title: t('app.name'), text: post.caption || '', url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* người dùng huỷ */
    }
  };

  return (
    <article className="ig-card mb-0 md:mb-6 animate-fade-in">
      {/* ------------------------------ header ------------------------------ */}
      <header className="flex items-center gap-3 px-3 py-2.5 md:px-4">
        <Link to={ROUTES.profile(post.author?.username)}>
          <Avatar src={post.author?.avatarUrl} name={post.author?.fullName} size="sm" ring />
        </Link>
        <div className="flex flex-1 flex-col leading-tight">
          <Link to={ROUTES.profile(post.author?.username)} className="text-sm font-semibold hover:underline">
            {post.author?.username}
          </Link>
          {post.location && <span className="text-xs text-ink-soft">{post.location}</span>}
        </div>

        <div className="relative">
          <button
            type="button"
            aria-label={t('post.menu')}
            onClick={() => setShowMenu((value) => !value)}
            className="p-1"
          >
            <MoreIcon className="w-5 h-5" />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-8 z-20 w-52 overflow-hidden rounded-lg border border-ink-line bg-white shadow-lg animate-fade-in">
              {canDelete ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-ig-red hover:bg-ink-bg"
                >
                  <TrashIcon /> {t('post.delete')}
                </button>
              ) : (
                <p className="px-4 py-3 text-xs text-ink-soft">{t('post.deleteDenied')}</p>
              )}
              <button
                type="button"
                onClick={() => setShowMenu(false)}
                className="w-full border-t border-ink-line px-4 py-3 text-left text-sm hover:bg-ink-bg"
              >
                {t('common.cancel')}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ------------------------------ media ------------------------------- */}
      <div
        className="relative aspect-square w-full select-none bg-black"
        onClick={handleMediaClick}
        onDoubleClick={handleLike}
        role="presentation"
      >
        {post.isVideo ? (
          <>
            <video
              src={post.videoUrl}
              poster={resolveImageUrl(post.imageUrl)}
              controls
              playsInline
              preload="metadata"
              className="h-full w-full object-contain"
            />
            {post.durationLabel && (
              <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
                {post.durationLabel}
              </span>
            )}
          </>
        ) : (
          <img
            src={resolveImageUrl(post.imageUrl)}
            alt={t('post.imageAlt', { name: post.author?.username })}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain"
          />
        )}

        {/* mở toàn màn hình (trình xem có zoom + tải về) */}
        {onOpenViewer && (
          <button
            type="button"
            aria-label={t('viewer.openFull')}
            onClick={(event) => {
              event.stopPropagation();
              onOpenViewer();
            }}
            className="absolute bottom-2 right-2 rounded-full bg-black/45 p-2 text-white backdrop-blur-sm"
          >
            {post.isVideo ? <PlayIcon className="w-4 h-4" /> : <DownloadIcon className="w-4 h-4" />}
          </button>
        )}

        {burst && (
          <HeartIcon
            filled
            className="pointer-events-none absolute left-1/2 top-1/2 w-24 h-24 -translate-x-1/2 -translate-y-1/2 text-white/90 drop-shadow-lg animate-heart-pop"
          />
        )}
      </div>

      {/* ------------------------------ actions ----------------------------- */}
      <div className="flex items-center gap-4 px-3 pt-2.5 md:px-4">
        <button type="button" aria-label={t('post.likes', { count: post.likeCount, total: count(post.likeCount) })} onClick={handleLike} disabled={!user} className="transition active:scale-90">
          <HeartIcon filled={post.likedByViewer} className={`w-6 h-6 ${post.likedByViewer ? 'text-ig-red' : 'text-ink'}`} />
        </button>
        <button type="button" aria-label={t('post.comments', { count: post.commentCount, total: count(post.commentCount) })} onClick={() => setShowComments((value) => !value)}>
          <CommentIcon className="w-6 h-6" />
        </button>
        {/* Gửi bài viết vào tin nhắn — hành vi chính của Instagram. */}
        <button
          type="button"
          aria-label={t('chat.shareTo')}
          title={t('chat.shareTo')}
          onClick={() => setShareOpen(true)}
        >
          <MessengerIcon className="w-6 h-6" />
        </button>
        <button type="button" aria-label={t('common.copyLink')} onClick={share}>
          <ShareIcon className="w-6 h-6" />
        </button>
        <button
          type="button"
          aria-label={t('common.copyLink')}
          onClick={() => setBookmarked((value) => !value)}
          className="ml-auto"
        >
          <BookmarkIcon filled={bookmarked} className="w-6 h-6" />
        </button>
      </div>

      {/* -------------------------- likes & caption ------------------------- */}
      <div className="space-y-1 px-3 pt-2 pb-1 md:px-4">
        <p className="text-sm font-semibold">{t('post.likes', { count: post.likeCount, total: count(post.likeCount) })}</p>

        {post.caption && (
          <p className="text-sm leading-snug">
            <Link to={ROUTES.profile(post.author?.username)} className="mr-1.5 font-semibold hover:underline">
              {post.author?.username}
            </Link>
            {post.caption}
          </p>
        )}

        {post.commentCount > 0 && !showComments && (
          <button
            type="button"
            onClick={() => setShowComments(true)}
            className="text-sm text-ink-soft hover:text-ink"
          >
            {t('post.viewAllComments', { count: post.commentCount, total: count(post.commentCount) })}
          </button>
        )}

        <p className="pb-2 text-[10px] uppercase tracking-wide text-ink-soft">{timeAgo(post.createdAt)}</p>
        {error && <p className="pb-2 text-xs text-ig-red">{error}</p>}
      </div>

      {showComments && (
        <CommentSection
          postId={post.id}
          initialCount={post.commentCount}
          compact
          onAdded={(comment) => !comment?.deleted && onCommentAdded?.(post.id)}
        />
      )}

      {/* Gửi bài viết này vào tin nhắn (kiểu Instagram: kèm thẻ bài viết). */}
      <PersonPickerDialog
        open={shareOpen}
        mode="share"
        postId={post.id}
        onClose={() => setShareOpen(false)}
      />

      <div className="h-2 md:hidden" />
    </article>
  );
}
