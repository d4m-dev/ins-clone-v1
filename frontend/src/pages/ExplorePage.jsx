/**
 * src/pages/ExplorePage.jsx — lưới tìm kiếm toàn bộ ảnh của gia đình
 * (tab Explore của Instagram). Tìm theo chú thích, địa điểm hoặc tên thành viên.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES, resolveImageUrl } from '../../config/urls.js';
import Layout from '../components/Layout.jsx';
import Avatar from '../components/Avatar.jsx';
import { HeartIcon, CommentIcon, SearchIcon } from '../components/Icons.jsx';
import { EmptyState, SkeletonPost } from '../components/States.jsx';
import { postsApi } from '../api/client.js';
import { useI18n } from '../i18n/index.js';

export default function ExplorePage() {
  const { t, count } = useI18n();
  const [posts, setPosts] = useState([]);
  const [status, setStatus] = useState('loading');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    postsApi
      .list({ limit: 30 })
      .then((data) => {
        if (!cancelled) {
          setPosts(data.posts);
          setStatus('ready');
        }
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
    };
  }, []);

  const members = useMemo(() => {
    const map = new Map();
    posts.forEach((post) => {
      if (post.author && !map.has(post.author.username)) map.set(post.author.username, post.author);
    });
    return [...map.values()];
  }, [posts]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return posts;
    return posts.filter((post) =>
      [post.caption, post.location, post.author?.username, post.author?.fullName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [posts, query]);

  return (
    <Layout>
      <div className="px-4 pb-4">
        <div className="flex items-center gap-3 rounded-lg border border-ink-line bg-white px-3 py-2.5">
          <SearchIcon className="w-5 h-5 text-ink-soft" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('explore.searchPlaceholder')}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-soft"
          />
        </div>
      </div>

      {members.length > 1 && (
        <div className="mb-4 flex gap-4 overflow-x-auto px-4 pb-2">
          {members.map((member) => (
            <Link key={member.username} to={ROUTES.profile(member.username)} className="flex w-16 shrink-0 flex-col items-center gap-1">
              <Avatar src={member.avatarUrl} name={member.fullName} size="md" ring />
              <span className="truncate text-[11px]">{member.username}</span>
            </Link>
          ))}
        </div>
      )}

      {status === 'loading' && (
        <div className="px-4">
          <SkeletonPost />
        </div>
      )}

      {status === 'ready' && filtered.length === 0 && (
        <EmptyState
          icon="🔍"
          title={query ? t('explore.noMatch') : t('explore.emptyTitle')}
          description={query ? t('explore.noMatchHint') : t('explore.emptyHint')}
        />
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-3 gap-0.5 px-0.5 md:gap-1 md:px-0">
          {filtered.map((post) => (
            <Link key={post.id} to={ROUTES.post(post.id)} className="group relative aspect-square bg-ink-bg">
              <img
                src={resolveImageUrl(post.imageUrl)}
                alt={post.caption || t('explore.photoAlt')}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 hidden items-center justify-center gap-4 bg-black/40 text-sm font-semibold text-white group-hover:flex">
                <span className="flex items-center gap-1">
                  <HeartIcon filled className="w-5 h-5" /> {count(post.likeCount)}
                </span>
                <span className="flex items-center gap-1">
                  <CommentIcon className="w-5 h-5" /> {count(post.commentCount)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}
