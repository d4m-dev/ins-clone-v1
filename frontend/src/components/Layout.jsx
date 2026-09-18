/**
 * src/components/Layout.jsx
 * ---------------------------------------------------------------------------
 * Khung Instagram: sidebar desktop (245px) · thanh trên + tab dưới (mobile)
 * · cột nội dung 470px. Mọi nhãn đều lấy từ i18n (mặc định tiếng Việt).
 * ---------------------------------------------------------------------------
 */

import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../config/urls.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n/index.js';
import Avatar from './Avatar.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import {
  HomeIcon,
  SearchIcon,
  PlusSquareIcon,
  ReelsIcon,
  HeartIcon,
  LogoutIcon,
  CameraIcon,
  MessengerIcon,
} from './Icons.jsx';
import InstallPrompt from './InstallPrompt.jsx';
import useChatBadge from '../hooks/useChatBadge.js';

/** Huy hiệu đỏ cho biểu tượng Tin nhắn. */
function UnreadBadge({ count }) {
  if (!count) return null;
  return (
    <span className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-ig-red px-1 text-center text-[10px] font-semibold leading-4 text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

function useNavItems() {
  const { t } = useI18n();
  const { totalUnread, pendingRequests } = useChatBadge();
  return [
    { to: ROUTES.feed, label: t('nav.home'), Icon: HomeIcon },
    { to: ROUTES.explore, label: t('nav.search'), Icon: SearchIcon },
    { to: ROUTES.upload, label: t('nav.create'), Icon: PlusSquareIcon },
    { to: ROUTES.reels, label: t('nav.reels'), Icon: ReelsIcon },
    {
      to: ROUTES.messages,
      label: t('nav.messages'),
      Icon: MessengerIcon,
      badge: totalUnread + pendingRequests,
    },
  ];
}

function Sidebar({ user, onLogout }) {
  const { t } = useI18n();
  const navItems = useNavItems();

  return (
    <aside className="hidden lg:flex fixed top-0 left-0 h-screen w-[245px] flex-col border-r border-ink-line bg-white px-3 py-6">
      <Link to={ROUTES.feed} className="px-3 pb-6 text-2xl font-semibold ig-gradient-text">
        {t('app.name')}
      </Link>

      <nav className="flex flex-col gap-1">
        {navItems.map(({ to, label, Icon, disabled, badge }) => (
          <NavLink
            key={label}
            to={disabled ? '#' : to}
            aria-disabled={disabled}
            onClick={(event) => disabled && event.preventDefault()}
            className={({ isActive }) =>
              `flex items-center gap-4 rounded-lg px-3 py-3 text-[15px] transition
               ${isActive && !disabled ? 'font-bold' : 'font-normal'}
               hover:bg-ink-bg ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <Icon filled={isActive && !disabled} />
                  <UnreadBadge count={badge} />
                </span>
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}

        <NavLink
          to={ROUTES.profile(user?.username || '')}
          className="flex items-center gap-4 rounded-lg px-3 py-3 text-[15px] hover:bg-ink-bg"
        >
          <Avatar src={user?.avatarUrl} name={user?.fullName} size="xs" />
          <span>{t('nav.profile')}</span>
        </NavLink>
      </nav>

      <div className="mt-auto flex flex-col gap-2 px-1">
        <LanguageSwitcher variant="sidebar" />

        <Link
          to={ROUTES.upload}
          className="rounded-lg bg-gradient-to-r from-ig-purple via-ig-pink to-ig-orange
                     px-4 py-2 text-center text-sm font-semibold text-white"
        >
          {t('nav.sharePhoto')}
        </Link>
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-soft hover:text-ink"
        >
          <LogoutIcon /> {t('nav.logout')}
        </button>
      </div>
    </aside>
  );
}

function TopBar() {
  const { t } = useI18n();
  const { totalUnread, pendingRequests } = useChatBadge();

  return (
    <header className="md:hidden sticky top-0 z-30 flex h-12 items-center justify-between border-b border-ink-line bg-white px-4">
      <Link to={ROUTES.feed} className="text-xl font-semibold ig-gradient-text">
        {t('app.name')}
      </Link>
      <div className="flex items-center gap-4">
        <Link to={ROUTES.explore} aria-label={t('nav.search')}>
          <SearchIcon className="w-6 h-6" />
        </Link>
        <Link to={ROUTES.upload} aria-label={t('nav.create')}>
          <PlusSquareIcon className="w-6 h-6" />
        </Link>
        <Link to={ROUTES.messages} aria-label={t('nav.messages')} className="relative">
          <MessengerIcon className="w-6 h-6" />
          <UnreadBadge count={totalUnread + pendingRequests} />
        </Link>
        <LanguageSwitcher variant="topbar" />
      </div>
    </header>
  );
}

function BottomNav({ user }) {
  const { t } = useI18n();
  const { totalUnread, pendingRequests } = useChatBadge();
  const tabs = [
    { to: ROUTES.feed, Icon: HomeIcon, label: t('nav.home') },
    { to: ROUTES.explore, Icon: SearchIcon, label: t('nav.search') },
    { to: ROUTES.reels, Icon: ReelsIcon, label: t('nav.reels') },
    { to: ROUTES.upload, Icon: PlusSquareIcon, label: t('nav.create') },
    { to: ROUTES.messages, Icon: MessengerIcon, label: t('nav.messages'), badge: totalUnread + pendingRequests },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex h-12 items-center justify-around border-t border-ink-line bg-white">
      {tabs.map(({ to, Icon, label, badge }) => (
        <NavLink key={label} to={to} aria-label={label} className="relative p-2">
          {({ isActive }) => (
            <>
              <Icon filled={isActive} className="w-6 h-6" />
              <UnreadBadge count={badge} />
            </>
          )}
        </NavLink>
      ))}
      <NavLink to={ROUTES.profile(user?.username || '')} aria-label={t('nav.profile')} className="p-2">
        <Avatar src={user?.avatarUrl} name={user?.fullName} size="xs" />
      </NavLink>
    </nav>
  );
}

export default function Layout({ children, hideChrome = false }) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();

  /** Hộp thư dùng bố cục rộng (hai cột) thay vì cột 470px của bảng tin. */
  const isMessages = location.pathname.startsWith(ROUTES.messages);

  const handleLogout = () => {
    logout();
    navigate(ROUTES.login, { replace: true });
  };

  if (hideChrome) return <div className="min-h-screen bg-white">{children}</div>;

  return (
    <div className="min-h-screen bg-white md:bg-ink-bg">
      <Sidebar user={user} onLogout={handleLogout} />
      <TopBar />

      <main className="lg:pl-[245px] pb-14 md:pb-8">
        <div
          className={`mx-auto w-full pt-0 ${isMessages ? 'max-w-shell px-0 md:pt-4' : 'max-w-feed md:pt-6'}`}
          key={location.pathname}
        >
          {children}
        </div>
        <footer
          className={`py-8 text-center text-[11px] uppercase tracking-wide text-ink-soft ${
            isMessages ? 'hidden' : 'hidden md:block'
          }`}
        >
          <span className="inline-flex items-center gap-1">
            <CameraIcon className="w-3 h-3" /> {t('app.footer')}
          </span>
        </footer>

        <InstallPrompt />
      </main>

      <BottomNav user={user} />
    </div>
  );
}
