/**
 * src/pages/FeedPage.jsx
 * Trang chủ: cuộn vô hạn, thích/bình luận tức thì, chủ ảnh hoặc admin được xoá.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../config/urls.js';
import Layout from '../components/Layout.jsx';
import PostCard from '../components/PostCard.jsx';
import StoriesBar from '../components/StoriesBar.jsx';
import PhotoViewer from '../components/PhotoViewer.jsx';
import { SkeletonPost, EmptyState, ErrorState, Spinner } from '../components/States.jsx';
import { useFeed } from '../hooks/useFeed.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n/index.js';

export default function FeedPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { posts, pagination, status, error, reload, loadMore, toggleLike, removePost, isLoadingFirstPage, isEmpty } =
    useFeed();
  const sentinel = useRef(null);
  /** Vị trí bài đang mở toàn màn hình (null = đang đóng). */
  const [viewerIndex, setViewerIndex] = useState(null);

  /** Cuộn vô hạn bằng IntersectionObserver — mượt như app thật trên điện thoại. */
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '400px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <Layout>
      {isLoadingFirstPage && (
        <>
          <SkeletonPost />
          <SkeletonPost />
        </>
      )}

      {error && posts.length === 0 && <ErrorState message={error.message} onRetry={reload} />}

      {isEmpty && (
        <EmptyState
          icon="🖼️"
          title={t('feed.empty.title')}
          description={t('feed.empty.description')}
          action={
            <Link to={ROUTES.upload} className="ig-button w-auto px-6">
              {t('feed.empty.action')}
            </Link>
          }
        />
      )}

      <StoriesBar />

      {posts.map((post, index) => (
        <PostCard
          key={post.id}
          post={post}
          onLike={toggleLike}
          onDelete={removePost}
          onCommentAdded={() => {}}
          onOpenViewer={() => setViewerIndex(index)}
        />
      ))}

      {viewerIndex !== null && (
        <PhotoViewer
          items={posts}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onLike={toggleLike}
        />
      )}

      <div ref={sentinel} className="h-10" />

      {status === 'loading' && posts.length > 0 && <Spinner />}

      {!pagination.hasMore && posts.length > 0 && (
        <p className="py-8 text-center text-sm text-ink-soft">{t('feed.end')}</p>
      )}

      {!user && posts.length > 0 && (
        <p className="pb-8 text-center text-sm text-ink-soft">
          <Link to={ROUTES.login} className="ig-link">
            {t('auth.login')}
          </Link>{' '}
          {t('feed.loginHint')}
        </p>
      )}
    </Layout>
  );
}
