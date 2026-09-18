/**
 * src/components/CommentSection.jsx
 * Danh sách bình luận + ô soạn bình luận (dùng ở PostCard và PostPage).
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { postsApi, commentsApi, ApiError } from '../api/client.js';
import { ROUTES } from '../../config/urls.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n/index.js';
import Avatar from './Avatar.jsx';
import { HeartIcon, SpinnerIcon } from './Icons.jsx';

export default function CommentSection({ postId, initialCount = 0, onAdded, compact = false }) {
  const { user } = useAuth();
  const { t, timeAgo } = useI18n();
  const [comments, setComments] = useState([]);
  const [status, setStatus] = useState('loading');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    postsApi
      .comments(postId)
      .then(({ comments: list }) => {
        if (!cancelled) {
          setComments(list);
          setStatus('ready');
        }
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
    };
  }, [postId]);

  const submit = async (event) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);
    try {
      const { comment } = await postsApi.addComment(postId, body);
      setComments((current) => [...current, comment]);
      setDraft('');
      onAdded?.(comment);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('comment.sendFailed'));
    } finally {
      setSending(false);
    }
  };

  const remove = async (commentId) => {
    const snapshot = comments;
    setComments((current) => current.filter((comment) => comment.id !== commentId));
    try {
      await commentsApi.remove(commentId);
      onAdded?.({ deleted: true });
    } catch {
      setComments(snapshot);
    }
  };

  return (
    <div className="flex flex-col">
      <div className={`flex-1 space-y-3 overflow-y-auto px-4 py-3 ${compact ? 'max-h-56' : 'max-h-[45vh]'} md:max-h-none`}>
        {status === 'loading' && (
          <div className="flex justify-center py-4">
            <SpinnerIcon className="w-5 h-5 text-ink-soft" />
          </div>
        )}

        {status === 'error' && <p className="py-2 text-center text-sm text-ig-red">{t('comment.loadFailed')}</p>}

        {status === 'ready' && comments.length === 0 && (
          <p className="py-4 text-center text-sm text-ink-soft">{t('comment.empty')}</p>
        )}

        {comments.map((comment) => (
          <div key={comment.id} className="group flex items-start gap-3 text-sm">
            <Avatar src={comment.author?.avatarUrl} name={comment.author?.fullName} size="sm" />
            <div className="flex-1 leading-snug">
              <Link to={ROUTES.profile(comment.author?.username)} className="font-semibold hover:underline">
                {comment.author?.username}
              </Link>{' '}
              <span className="text-ink">{comment.body}</span>
              <div className="mt-0.5 flex items-center gap-3 text-[11px] text-ink-soft">
                <span>{timeAgo(comment.createdAt)}</span>
                {comment.canDelete && (
                  <button
                    type="button"
                    onClick={() => remove(comment.id)}
                    className="opacity-0 transition group-hover:opacity-100 hover:text-ig-red"
                  >
                    {t('common.delete')}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="px-4 pb-1 text-xs text-ig-red">{error}</p>}

      <form onSubmit={submit} className="flex items-center gap-3 border-t border-ink-line px-4 py-3">
        <HeartIcon className="w-6 h-6 shrink-0 text-ink" />
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={user ? t('comment.placeholder') : t('comment.loginRequired')}
          disabled={!user || sending}
          maxLength={400}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-soft"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          className="text-sm font-semibold text-ig-blue disabled:opacity-40"
        >
          {t('comment.send')}
        </button>
      </form>
    </div>
  );
}
