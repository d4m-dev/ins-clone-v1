/**
 * src/pages/ReelsPage.jsx
 * ---------------------------------------------------------------------------
 * Reels — dòng video dọc toàn màn hình, cuộn "snap" từng clip như Instagram:
 *   • IntersectionObserver phát clip đang hiển thị, tạm dừng các clip khác
 *   • tự tắt tiếng khi mở (quy tắc autoplay của trình duyệt) + nút bật tiếng
 *   • chạm 1 lần = tạm dừng/phát · chạm đúp = thích
 *   • thanh trượt tiến trình, đếm lượt xem, tải về, mở trang bài viết
 *   • nút ↑/↓ cho bàn phím máy tính
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../config/urls.js';
import Layout from '../components/Layout.jsx';
import Avatar from '../components/Avatar.jsx';
import { EmptyState, ErrorState, Spinner } from '../components/States.jsx';
import {
  HeartIcon,
  CommentIcon,
  ShareIcon,
  DownloadIcon,
  VolumeOffIcon,
  VolumeOnIcon,
  PlayIcon,
  BackIcon,
  MoreIcon,
} from '../components/Icons.jsx';
import { reelsApi, postsApi } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n/index.js';

const PAGE_SIZE = 4;

export default function ReelsPage() {
  const { user } = useAuth();
  const { t, count } = useI18n();
  const navigate = useNavigate();

  const [reels, setReels] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [burstOn, setBurstOn] = useState(null);
  const [showComments, setShowComments] = useState(false);
  const [shareHint, setShareHint] = useState(false);

  const containerRef = useRef(null);
  const videoRefs = useRef(new Map());
  const cardRefs = useRef(new Map());
  const seenRef = useRef(new Set());
  const lastTapRef = useRef(0);

  /* ------------------------------ nạp dữ liệu ------------------------------- */
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    reelsApi
      .list({ page: 1, limit: PAGE_SIZE })
      .then((data) => {
        if (cancelled) return;
        setReels(data.reels || []);
        setHasMore(Boolean(data.pagination?.hasMore));
        setPage(1);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (status !== 'ready' || !hasMore) return;
    const nextPage = page + 1;
    try {
      const data = await reelsApi.list({ page: nextPage, limit: PAGE_SIZE });
      setReels((current) => {
        const known = new Set(current.map((post) => post.id));
        return [...current, ...(data.reels || []).filter((post) => !known.has(post.id))];
      });
      setHasMore(Boolean(data.pagination?.hasMore));
      setPage(nextPage);
    } catch {
      setHasMore(false);
    }
  }, [page, hasMore, status]);

  /* --------------------- clip nào đang hiển thị thì phát -------------------- */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = Number(entry.target.dataset.index);
          const video = videoRefs.current.get(index);
          if (!video) return;

          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            setActiveIndex(index);
            setPaused(false);
            video.currentTime = 0;
            video.muted = muted;
            // Trình duyệt có thể chặn autoplay → bỏ qua lỗi trong im lặng.
            video.play().catch(() => {});

            const post = reels.find((item, position) => position === index);
            if (post && !seenRef.current.has(post.id)) {
              seenRef.current.add(post.id);
              postsApi
                .incrementView(post.id)
                .then((data) => {
                  setReels((current) =>
                    current.map((item) => (item.id === post.id ? { ...item, viewCount: data.viewCount } : item))
                  );
                })
                .catch(() => {}); // đếm lượt xem là "best effort"
            }
          } else {
            video.pause();
          }
        });
      },
      { root: container, threshold: [0, 0.6, 1] }
    );

    cardRefs.current.forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, [reels, muted]);

  useEffect(() => {
    videoRefs.current.forEach((video) => {
      if (video) video.muted = muted;
    });
  }, [muted]);

  /* ------------------------------ tương tác -------------------------------- */
  const toggleLike = async (post) => {
    if (!user) {
      navigate(ROUTES.login);
      return;
    }
    setBurstOn(post.id);
    setTimeout(() => setBurstOn(null), 800);
    try {
      const result = await postsApi.toggleLike(post.id);
      setReels((current) =>
        current.map((item) =>
          item.id === post.id ? { ...item, likedByViewer: result.liked, likeCount: result.likeCount } : item
        )
      );
    } catch {
      /* mạng lỗi — giữ nguyên trạng thái cũ */
    }
  };

  const handleSurfaceTap = (post) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      toggleLike(post);
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
    // chờ 300ms: nếu không phải chạm đúp thì coi là tạm dừng
    setTimeout(() => {
      if (lastTapRef.current !== 0) {
        setPaused((value) => !value);
        const video = videoRefs.current.get(activeIndex);
        if (video) (video.paused ? video.play().catch(() => {}) : video.pause());
        lastTapRef.current = 0;
      }
    }, 300);
  };

  const openFullscreen = (post) => navigate(ROUTES.post(post.id));

  const share = async (post) => {
    const url = `${window.location.origin}${ROUTES.post(post.id)}`;
    try {
      if (navigator.share) await navigator.share({ title: t('app.name'), url });
      else {
        await navigator.clipboard.writeText(url);
        setShareHint(true);
        setTimeout(() => setShareHint(false), 1800);
      }
    } catch {
      /* người dùng huỷ */
    }
  };

  const goTo = (direction) => {
    const next = activeIndex + direction;
    if (next < 0) return;
    if (next >= reels.length) {
      loadMore();
      return;
    }
    cardRefs.current.get(next)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'ArrowDown') goTo(1);
      if (event.key === 'ArrowUp') goTo(-1);
      if (event.key === 'm') setMuted((value) => !value);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  /* -------------------------------- render --------------------------------- */
  if (status === 'loading') {
    return (
      <Layout>
        <Spinner />
      </Layout>
    );
  }

  if (status === 'error') {
    return (
      <Layout>
        <ErrorState message={error?.message} onRetry={() => window.location.reload()} />
      </Layout>
    );
  }

  if (reels.length === 0) {
    return (
      <Layout>
        <EmptyState
          icon="🎬"
          title={t('reels.empty.title')}
          description={t('reels.empty.description')}
          action={
            <Link to={ROUTES.upload} className="ig-button w-auto px-6">
              {t('reels.empty.action')}
            </Link>
          }
        />
      </Layout>
    );
  }

  return (
    <Layout>
      <div
        ref={containerRef}
        className="no-scrollbar -mx-4 md:mx-0 h-[calc(100dvh-8rem)] snap-y snap-mandatory overflow-y-scroll bg-black md:rounded-lg"
        onClick={() => showComments && setShowComments(false)}
      >
        {reels.map((post, index) => (
          <article
            key={post.id}
            data-index={index}
            ref={(node) => (cardRefs.current.set(index, node), undefined)}
            className="relative flex h-full snap-start snap-always items-center justify-center"
            onClick={(event) => {
              event.stopPropagation();
              handleSurfaceTap(post);
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              toggleLike(post);
            }}
          >
            {/* ------------------------------- video ------------------------------- */}
            <video
              ref={(node) => (node ? videoRefs.current.set(index, node) : videoRefs.current.delete(index), undefined)}
              src={post.videoUrl}
              poster={post.imageUrl || undefined}
              playsInline
              loop
              muted={muted}
              preload={Math.abs(index - activeIndex) <= 1 ? 'auto' : 'none'}
              className="h-full w-full object-contain"
            />

            {paused && index === activeIndex && (
              <PlayIcon className="pointer-events-none absolute left-1/2 top-1/2 w-16 h-16 -translate-x-1/2 -translate-y-1/2 text-white/80" />
            )}

            {burstOn === post.id && (
              <HeartIcon
                filled
                className="pointer-events-none absolute left-1/2 top-1/2 w-28 h-28 -translate-x-1/2 -translate-y-1/2 text-white/90 animate-heart-pop"
              />
            )}

            {/* ------------------------------ overlay ------------------------------ */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/35 to-transparent p-4 pb-6 text-white">
              <div className="pointer-events-auto flex items-center gap-3">
                <Link to={ROUTES.profile(post.author?.username)} onClick={(event) => event.stopPropagation()}>
                  <Avatar src={post.author?.avatarUrl} name={post.author?.fullName} size="sm" />
                </Link>
                <Link
                  to={ROUTES.profile(post.author?.username)}
                  onClick={(event) => event.stopPropagation()}
                  className="text-sm font-semibold"
                >
                  {post.author?.username}
                </Link>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMuted((value) => !value);
                  }}
                  aria-label={muted ? t('reels.soundOn') : t('reels.soundOff')}
                  className="ml-auto rounded-full bg-white/15 p-2"
                >
                  {muted ? <VolumeOffIcon className="w-5 h-5" /> : <VolumeOnIcon className="w-5 h-5" />}
                </button>
              </div>

              {post.caption && (
                <p className="pointer-events-auto mt-2 line-clamp-2 text-sm">
                  <span className="mr-1.5 font-semibold">{post.author?.username}</span>
                  {post.caption}
                </p>
              )}

              {post.audioUrl ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-white/80">
                  🎵 {post.audioTitle || t('reels.music')}
                  <audio src={post.audioUrl} autoPlay={index === activeIndex && !muted} loop />
                </p>
              ) : null}

              <p className="mt-1 text-xs text-white/70">
                {t('reels.views', { count: post.viewCount ?? 0, total: count(post.viewCount ?? 0) })}
              </p>
            </div>

            {/* --------------------------- nút hành động --------------------------- */}
            <div className="absolute bottom-24 right-3 z-20 flex flex-col items-center gap-5 text-white">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleLike(post);
                }}
                className="flex flex-col items-center gap-1"
                aria-label={t('post.likes', { count: post.likeCount, total: count(post.likeCount) })}
              >
                <HeartIcon filled={post.likedByViewer} className={`w-7 h-7 ${post.likedByViewer ? 'text-ig-red' : ''}`} />
                <span className="text-[11px]">{count(post.likeCount)}</span>
              </button>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  openFullscreen(post);
                }}
                className="flex flex-col items-center gap-1"
                aria-label={t('post.comments', { count: post.commentCount, total: count(post.commentCount) })}
              >
                <CommentIcon className="w-7 h-7" />
                <span className="text-[11px]">{count(post.commentCount)}</span>
              </button>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  share(post);
                }}
                className="flex flex-col items-center gap-1"
                aria-label={t('common.copyLink')}
              >
                <ShareIcon className="w-7 h-7" />
              </button>

              <a
                href={postsApi.downloadUrl(post.id)}
                download
                onClick={(event) => event.stopPropagation()}
                className="flex flex-col items-center gap-1"
                aria-label={t('viewer.download')}
              >
                <DownloadIcon className="w-7 h-7" />
              </a>
            </div>

            {/* --------------------------- thanh tiến trình ------------------------ */}
            {index === activeIndex && <ReelProgress videoRef={() => videoRefs.current.get(index)} />}

            {/* ----------------------------- điều hướng ---------------------------- */}
            {index === activeIndex && (
              <div className="absolute right-3 top-4 z-20 hidden flex-col gap-2 md:flex">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    goTo(-1);
                  }}
                  className="rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
                  aria-label={t('viewer.previous')}
                >
                  <BackIcon className="w-5 h-5 rotate-90" />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    goTo(1);
                  }}
                  className="rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
                  aria-label={t('viewer.next')}
                >
                  <BackIcon className="w-5 h-5 -rotate-90" />
                </button>
              </div>
            )}

            {index === activeIndex && (
              <p className="absolute left-1/2 top-1/2 z-0 -translate-x-1/2 text-center text-xs text-white/40 md:hidden">
                {t('reels.swipeHint')}
              </p>
            )}
          </article>
        ))}
      </div>

      {shareHint && (
        <p className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full bg-black/80 px-4 py-2 text-xs text-white">
          {t('common.copied')}
        </p>
      )}

      {showComments && (
        <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setShowComments(false)}>
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-white p-4" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-semibold">{t('post.comments', { count: 0, total: '0' })}</p>
              <button type="button" onClick={() => setShowComments(false)} aria-label={t('viewer.close')}>
                <MoreIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="pt-3 text-sm text-ink-soft">{t('comment.empty')}</p>
          </div>
        </div>
      )}
    </Layout>
  );
}

/** Thanh tiến trình mảnh ở đáy clip — tự cập nhật theo `timeupdate`. */
function ReelProgress({ videoRef }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const video = videoRef();
    if (!video) return undefined;

    const onTimeUpdate = () => {
      if (!video.duration) return;
      setProgress((video.currentTime / video.duration) * 100);
    };
    video.addEventListener('timeupdate', onTimeUpdate);
    return () => video.removeEventListener('timeupdate', onTimeUpdate);
  }, [videoRef]);

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 h-0.5 bg-white/25">
      <div className="h-full bg-white transition-[width] duration-150" style={{ width: `${progress}%` }} />
    </div>
  );
}
