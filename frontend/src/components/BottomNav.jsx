/**
 * src/components/BottomNav.jsx
 * ---------------------------------------------------------------------------
 * Thanh điều hướng dưới kiểu Instagram.
 *
 * Instagram đã đổi thanh dưới từ 10/2025 (triển khai rộng 12/2025 – 3/2026):
 *     Trang chủ · Thước phim · TIN NHẮN (ở giữa) · Tìm kiếm · Trang cá nhân
 * và chuyển nút Đăng (+) ra khỏi thanh dưới, lên góc trên màn hình (xem TopBar
 * trong Layout.jsx). Tệp này bám đúng thứ tự đó.
 *
 * Quy ước hiển thị giống Instagram:
 *   · tab đang mở  → biểu tượng ĐẶC (filled) và đậm
 *   · tab khác     → biểu tượng NÉT (outline)
 *   · tab Tin nhắn → huy hiệu đỏ khi có tin chưa đọc / lời mời kết bạn
 *   · tab cá nhân  → ảnh đại diện của bạn, có viền khi đang mở
 *   · chạm vào tab → thu nhỏ nhẹ (active:scale) như app thật
 * Chỉ hiện dưới `lg` — từ `lg` trở lên đã có sidebar bên trái.
 * ---------------------------------------------------------------------------
 */

import { NavLink } from 'react-router-dom';
import { ROUTES } from '../../config/urls.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n/index.js';
import Avatar from './Avatar.jsx';
import { HomeIcon, ReelsIcon, MessengerIcon, SearchIcon } from './Icons.jsx';
import useChatBadge from '../hooks/useChatBadge.js';

/** Huy hiệu đỏ kiểu Instagram: bám ngay góc trên-phải của biểu tượng. */
function UnreadBadge({ count }) {
  if (!count) return null;
  return (
    <span
      aria-hidden="true"
      className="absolute -right-1.5 -top-1 min-w-[17px] rounded-full bg-ig-red px-1 text-center
                 text-[10px] font-semibold leading-[17px] text-white ring-2 ring-white"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default function BottomNav() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { totalUnread, pendingRequests } = useChatBadge();
  const directMessageBadge = totalUnread + pendingRequests;

  /** Đúng thứ tự thanh dưới của Instagram: nhắn tin nằm giữa. */
  const tabs = [
    { to: ROUTES.feed, label: t('nav.home'), Icon: HomeIcon },
    { to: ROUTES.reels, label: t('nav.reels'), Icon: ReelsIcon },
    { to: ROUTES.messages, label: t('nav.messages'), Icon: MessengerIcon, badge: directMessageBadge },
    { to: ROUTES.explore, label: t('nav.search'), Icon: SearchIcon },
  ];

  return (
    <nav
      aria-label={t('app.name')}
      className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-ink-line bg-white/95 backdrop-blur"
      /* Chừa chỗ cho vạch Home trên iPhone (giống app thật). */
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="flex h-[52px] items-stretch">
        {tabs.map(({ to, label, Icon, badge }) => (
          <li key={label} className="relative flex-1">
            <NavLink
              to={to}
              aria-label={label}
              title={label}
              className="flex h-full items-center justify-center transition-transform duration-150
                         active:scale-90"
            >
              {({ isActive }) => (
                <span className="relative flex h-[26px] w-[26px] items-center justify-center text-ink">
                  <Icon filled={isActive} className="h-[26px] w-[26px]" />
                  <UnreadBadge count={badge} />
                </span>
              )}
            </NavLink>
          </li>
        ))}

        <li className="relative flex-1">
          <NavLink
            to={user?.username ? ROUTES.profile(user.username) : ROUTES.login}
            aria-label={t('nav.profile')}
            title={t('nav.profile')}
            className="flex h-full items-center justify-center transition-transform duration-150
                       active:scale-90"
          >
            {({ isActive }) => (
              <span
                className={`flex h-[26px] w-[26px] items-center justify-center rounded-full
                            ${isActive ? 'ring-2 ring-ink' : 'ring-1 ring-ink-faint'}`}
              >
                <Avatar src={user?.avatarUrl} name={user?.fullName} size="xs" />
              </span>
            )}
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}
