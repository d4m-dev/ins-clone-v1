/**
 * src/components/StoriesBar.jsx
 * ---------------------------------------------------------------------------
 * "Khoảnh khắc 24 giờ" — hàng vòng tròn story ở đầu bảng tin.
 * Không có bảng dữ liệu riêng: story = bài đăng trong 24h qua, gom theo tác giả
 * (API: GET /api/stories). Hết 24h là tự biến mất, không cần job dọn dẹp.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useState } from 'react';
import { storiesApi } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n/index.js';
import { ROUTES } from '../../config/urls.js';
import { Link } from 'react-router-dom';
import Avatar from './Avatar.jsx';
import { PlusSquareIcon } from './Icons.jsx';
import StoryViewer from './StoryViewer.jsx';

const SEEN_KEY = 'pixgram.seenStories';

const readSeen = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
  } catch {
    return new Set();
  }
};

const writeSeen = (set) => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-400)));
  } catch {
    /* chế độ riêng tư */
  }
};

export default function StoriesBar({ refreshKey = 0 }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [groups, setGroups] = useState([]);
  const [status, setStatus] = useState('loading');
  const [openIndex, setOpenIndex] = useState(null);
  const [seen, setSeen] = useState(readSeen);

  useEffect(() => {
    let cancelled = false;
    storiesApi
      .list()
      .then((data) => {
        if (cancelled) return;
        setGroups(data.groups || []);
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const markSeen = (postIds) => {
    const next = new Set(seen);
    postIds.forEach((id) => next.add(String(id)));
    setSeen(next);
    writeSeen(next);
  };

  if (status !== 'ready' || groups.length === 0) return null;

  const isSeen = (group) => group.posts.every((post) => seen.has(String(post.id)));

  return (
    <>
      <section className="border-b border-ink-line bg-white px-2 py-3 md:mb-4 md:rounded-lg md:border">
        <div className="flex gap-4 overflow-x-auto pb-1">
          {/* Ô "Thêm khoảnh khắc" */}
          <Link to={ROUTES.upload} className="flex w-[68px] shrink-0 flex-col items-center gap-1">
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full border border-ink-line bg-ink-bg">
              <PlusSquareIcon className="w-6 h-6 text-ink-soft" />
            </span>
            <span className="w-full truncate text-center text-[11px]">{t('stories.yourStory')}</span>
          </Link>

          {groups.map((group, position) => (
            <button
              key={group.author?.id ?? position}
              type="button"
              onClick={() => {
                setOpenIndex(position);
                markSeen(group.posts.map((post) => post.id));
              }}
              className="flex w-[68px] shrink-0 flex-col items-center gap-1"
            >
              <Avatar
                src={group.author?.avatarUrl}
                name={group.author?.fullName}
                size="lg"
                ring={!isSeen(group)}
                className="!h-16 !w-16"
              />
              <span className="w-full truncate text-center text-[11px]">
                {group.author?.id === user?.id ? t('stories.yourStory') : group.author?.username}
              </span>
            </button>
          ))}
        </div>

        <p className="px-2 pt-2 text-[11px] uppercase tracking-wide text-ink-soft">{t('stories.today')}</p>
      </section>

      {openIndex !== null && (
        <StoryViewer
          groups={groups}
          startGroupIndex={openIndex}
          onClose={() => setOpenIndex(null)}
          onSeen={markSeen}
        />
      )}
    </>
  );
}
