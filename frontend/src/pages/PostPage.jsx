/**
 * src/pages/PostPage.jsx — xem một ảnh theo liên kết /p/:id
 * (liên kết này cũng là deep link mà bot Telegram gửi cho admin).
 * Desktop: ảnh bên trái, bình luận bên phải.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ROUTES, resolveImageUrl } from '../../config/urls.js';
import Layout from '../components/Layout.jsx';
import Avatar from '../components/Avatar.jsx';
import CommentSection from '../components/CommentSection.jsx';
import { SpinnerIcon, HeartIcon, ShareIcon, BackIcon, MoreIcon } from '../components/Icons.jsx';
import { ErrorState } from '../components/States.jsx';
import { postsApi, ApiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n/index.js';

export default function PostPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, timeAgo, count } = useI18n();
  const [post, setPost] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    postsApi
      .byId(id)
      .then(({ post: data }) => {
        if (cancelled) return;
        setPost(data);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : t('postPage.loadFailed'));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  const toggleLike = async () => {
    if (!user || busy) return;
    setBusy(true);
    const snapshot = post;
    setPost((current) => ({
      ...current,
      likedByViewer: !current.likedByViewer,
      likeCount: Math.max(0, current.likeCount + (current.likedByViewer ? -1 : 1)),
    }));
    try {
      const result = await postsApi.toggleLike(id);
      setPost((current) => ({ ...current, likedByViewer: result.liked, likeCount: result.likeCount }));
    } catch {
      setPost(snapshot);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t('post.deleteConfirm'))) return;
    try {
      await postsApi.remove(id);
      navigate(ROUTES.feed, { replace: true });
    } catch {
      setError(t('post.deleteFailed'));
    }
  };

  return (
    <Layout>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 px-3 py-3 text-sm font-semibold md:hidden"
      >
        <BackIcon className="w-5 h-5" /> {t('common.back')}
      </button>

      {status === 'loading' && (
        <div className="flex justify-center py-20">
          <SpinnerIcon className="w-7 h-7 text-ink-soft" />
        </div>
      )}

      {status === 'error' && <ErrorState message={error} onRetry={() => navigate(ROUTES.feed)} />}

      {status === 'ready' && post && (
        <article className="md:flex md:overflow-hidden md:rounded-lg md:border md:border-ink-line md:bg-white">
          <div className="bg-black md:w-[62%]">
            <img
              src={resolveImageUrl(post.imageUrl)}
              alt={t('postPage.imageAlt', { name: post.author?.username })}
              className="h-full max-h-[80vh] w-full object-contain"
            />
          </div>

          <div className="flex flex-1 flex-col md:w-[38%]">
            <header className="flex items-center gap-3 border-b border-ink-line px-4 py-3">
              <Avatar src={post.author?.avatarUrl} name={post.author?.fullName} size="sm" ring />
              <div className="flex flex-1 flex-col leading-tight">
                <Link to={ROUTES.profile(post.author?.username)} className="text-sm font-semibold hover:underline">
                  {post.author?.username}
                </Link>
                {post.location && <span className="text-xs text-ink-soft">{post.location}</span>}
              </div>
              {(post.canDelete || (user && user.id === post.author?.id)) && (
                <button type="button" onClick={remove} aria-label={t('post.delete')} className="p-1 text-ig-red">
                  <MoreIcon className="w-5 h-5" />
                </button>
              )}
            </header>

            <div className="px-4 py-3">
              {post.caption && (
                <p className="text-sm leading-snug">
                  <Link to={ROUTES.profile(post.author?.username)} className="mr-1.5 font-semibold hover:underline">
                    {post.author?.username}
                  </Link>
                  {post.caption}
                </p>
              )}
              <p className="mt-2 text-[10px] uppercase tracking-wide text-ink-soft">{timeAgo(post.createdAt)}</p>
            </div>

            <div className="border-t border-ink-line md:flex-1 md:overflow-hidden">
              <CommentSection postId={post.id} initialCount={post.commentCount} />
            </div>

            <div className="flex items-center gap-4 border-t border-ink-line px-4 py-3">
              <button type="button" onClick={toggleLike} disabled={!user} aria-label={t('post.likes', { count: post.likeCount, total: count(post.likeCount) })}>
                <HeartIcon
                  filled={post.likedByViewer}
                  className={`w-6 h-6 ${post.likedByViewer ? 'text-ig-red' : 'text-ink'}`}
                />
              </button>
              <button
                type="button"
                aria-label={t('common.copyLink')}
                onClick={() => navigator.clipboard?.writeText(window.location.href)}
              >
                <ShareIcon className="w-6 h-6" />
              </button>
              <span className="ml-auto text-sm font-semibold">{t('post.likes', { count: post.likeCount, total: count(post.likeCount) })}</span>
            </div>
          </div>
        </article>
      )}
    </Layout>
  );
}
