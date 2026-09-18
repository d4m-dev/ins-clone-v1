/**
 * src/pages/ProfilePage.jsx — trang cá nhân kiểu Instagram: avatar, số liệu,
 * lưới ảnh. Dùng cho cả thành viên đang đăng nhập và xem thành viên khác.
 */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ROUTES, resolveImageUrl } from '../../config/urls.js';
import Layout from '../components/Layout.jsx';
import Avatar from '../components/Avatar.jsx';
import { GridIcon, HeartIcon, CommentIcon, SpinnerIcon } from '../components/Icons.jsx';
import { EmptyState, ErrorState } from '../components/States.jsx';
import { usersApi, ApiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n/index.js';

function Stat({ value, label }) {
  return (
    <div className="flex flex-col items-center md:flex-row md:gap-1.5">
      <span className="text-base font-semibold">{value}</span>
      <span className="text-sm text-ink md:text-base">{label}</span>
    </div>
  );
}

export default function ProfilePage() {
  const { username } = useParams();
  const { user: currentUser } = useAuth();
  const { t, count, timeAgo } = useI18n();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const isOwnProfile = !username || username === currentUser?.username;

  /**
   * Một hàm, hai dạng URL:
   *   /api/users/me/posts        → lưới ảnh của tôi
   *   /api/users/<username>/posts → thành viên bất kỳ
   * Cả hai URL nằm trong config/urls.js.
   */
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);

    const request = isOwnProfile ? usersApi.myPosts() : usersApi.posts(username);

    request
      .then(({ profile: loadedProfile, posts: loadedPosts }) => {
        if (cancelled) return;
        setProfile(loadedProfile ?? currentUser ?? null);
        setPosts(loadedPosts ?? []);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : t('profile.loadFailed'));
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [username, isOwnProfile, currentUser, t]);

  const totalLikes = posts.reduce((sum, post) => sum + Number(post.likeCount || 0), 0);
  const displayName = profile?.fullName || currentUser?.fullName || username || t('profile.member');

  return (
    <Layout>
      <header className="border-b border-ink-line px-4 py-6 md:mb-6 md:rounded-lg md:border">
        <div className="flex items-center gap-6 md:gap-12">
          <Avatar
            src={profile?.avatarUrl}
            name={displayName}
            size="lg"
            ring={isOwnProfile}
            className="md:!w-36 md:!h-36"
          />

          <div className="flex flex-1 flex-col gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-normal md:text-2xl">{profile?.username || username}</h1>
              {isOwnProfile && (
                <Link to={ROUTES.upload} className="ig-button-ghost !py-1.5 !px-3 text-xs">
                  {t('profile.sharePhoto')}
                </Link>
              )}
              {/* Chỉ quản trị viên mới thấy nút mời thành viên. */}
              {currentUser?.role === 'admin' && (
                <Link
                  to={ROUTES.invite}
                  className="ig-button-ghost !py-1.5 !px-3 text-xs"
                >
                  {t('profile.inviteMember')}
                </Link>
              )}
              {currentUser?.role === 'admin' && Boolean(ROUTES.admin) && (
                <a
                  href={ROUTES.admin}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white"
                >
                  {t('profile.adminPanel')}
                </a>
              )}
            </div>

            <div className="flex gap-6 md:gap-10">
              <Stat value={count(posts.length)} label={t('profile.posts')} />
              <Stat value={count(totalLikes)} label={t('profile.likes')} />
              <Stat value={count(posts.filter((post) => post.commentCount > 0).length)} label={t('profile.withComments')} />
            </div>

            <div className="hidden text-sm md:block">
              <p className="font-semibold">{displayName}</p>
              {profile?.bio && <p className="text-ink-soft">{profile.bio}</p>}
              {profile?.createdAt && (
                <p className="mt-1 text-xs text-ink-soft">{t('profile.joined', { time: timeAgo(profile.createdAt) })}</p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 text-sm md:hidden">
          <p className="font-semibold">{displayName}</p>
          {profile?.bio && <p className="text-ink-soft">{profile.bio}</p>}
          {profile?.createdAt && (
            <p className="mt-1 text-xs text-ink-soft">{t('profile.joined', { time: timeAgo(profile.createdAt) })}</p>
          )}
        </div>
      </header>

      <div className="flex items-center justify-center gap-2 border-b border-ink-line py-3 text-xs font-semibold uppercase tracking-wide">
        <GridIcon /> {t('profile.tab')}
      </div>

      {status === 'loading' && (
        <div className="flex justify-center py-16">
          <SpinnerIcon className="w-6 h-6 text-ink-soft" />
        </div>
      )}

      {status === 'error' && <ErrorState message={error} />}

      {status === 'ready' && posts.length === 0 && (
        <EmptyState
          icon="📸"
          title={t('profile.empty.title')}
          description={isOwnProfile ? t('profile.empty.self') : t('profile.empty.other')}
        />
      )}

      {posts.length > 0 && (
        <div className="grid grid-cols-3 gap-0.5 md:gap-1">
          {posts.map((post) => (
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
