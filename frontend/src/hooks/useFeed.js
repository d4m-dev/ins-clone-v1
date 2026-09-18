/**
 * src/hooks/useFeed.js
 * Paginated feed loader with optimistic mutations (like, comment, delete) and
 * infinite-scroll support. Keeps FeedPage free of data-fetching noise.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { postsApi } from '../api/client.js';

const PAGE_SIZE = 8;

export function useFeed({ userId = null, pageSize = PAGE_SIZE } = {}) {
  const [posts, setPosts] = useState([]);
  const [pagination, setPagination] = useState({ page: 0, total: 0, hasMore: true });
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  const loadPage = useCallback(
    async (page, { replace = false } = {}) => {
      const id = ++requestId.current;
      setStatus(page === 1 ? 'loading' : 'ready');
      setError(null);
      try {
        const data = await postsApi.list({ page, limit: pageSize, userId });
        if (id !== requestId.current) return; // a newer request won
        setPosts((current) => (replace ? data.posts : [...current, ...data.posts]));
        setPagination(data.pagination);
        setStatus('ready');
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err);
        setStatus('error');
      }
    },
    [pageSize, userId]
  );

  /** Initial load / reload when the filter changes. */
  useEffect(() => {
    setPosts([]);
    setPagination({ page: 0, total: 0, hasMore: true });
    loadPage(1, { replace: true });
  }, [loadPage]);

  const loadMore = useCallback(() => {
    if (status === 'loading' || !pagination.hasMore) return;
    loadPage((pagination.page || 0) + 1);
  }, [loadPage, pagination.hasMore, pagination.page, status]);

  const reload = useCallback(() => loadPage(1, { replace: true }), [loadPage]);

  /** Prepends freshly uploaded photos without a full refetch. */
  const prependPost = useCallback((post) => {
    setPosts((current) => [post, ...current.filter((item) => item.id !== post.id)]);
    setPagination((current) => ({ ...current, total: (current.total || 0) + 1 }));
  }, []);

  /**
   * Optimistic like toggle: the heart reacts instantly, then reconciles with
   * the server counter. Rolls back when the request fails.
   */
  const toggleLike = useCallback(async (postId) => {
    let snapshot = null;
    setPosts((current) =>
      current.map((post) => {
        if (post.id !== postId) return post;
        snapshot = { likedByViewer: post.likedByViewer, likeCount: post.likeCount };
        const liked = !post.likedByViewer;
        return { ...post, likedByViewer: liked, likeCount: Math.max(0, post.likeCount + (liked ? 1 : -1)) };
      })
    );

    try {
      const result = await postsApi.toggleLike(postId);
      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? { ...post, likedByViewer: result.liked, likeCount: result.likeCount }
            : post
        )
      );
      return result;
    } catch (error) {
      if (snapshot) {
        setPosts((current) =>
          current.map((post) => (post.id === postId ? { ...post, ...snapshot } : post))
        );
      }
      throw error;
    }
  }, []);

  const addComment = useCallback(async (postId, body) => {
    const { comment } = await postsApi.addComment(postId, body);
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? { ...post, commentCount: post.commentCount + 1, latestComment: comment }
          : post
      )
    );
    return comment;
  }, []);

  const removePost = useCallback(async (postId) => {
    const removed = [];
    setPosts((current) => {
      removed.push(...current.filter((post) => post.id === postId));
      return current.filter((post) => post.id !== postId);
    });
    try {
      await postsApi.remove(postId);
    } catch (error) {
      setPosts((current) => [...removed, ...current]); // rollback
      throw error;
    }
  }, []);

  return {
    posts,
    pagination,
    status,
    error,
    reload,
    loadMore,
    prependPost,
    toggleLike,
    addComment,
    removePost,
    isLoadingFirstPage: status === 'loading' && posts.length === 0,
    isEmpty: status === 'ready' && posts.length === 0,
  };
}

export default useFeed;
