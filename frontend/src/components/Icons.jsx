/**
 * src/components/Icons.jsx
 * Inline SVG icon set matching Instagram's iconography (no external assets,
 * so the app works offline and inside sandboxed previews).
 * Every icon accepts a `filled` prop for the active/outline states.
 */

const base = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  'aria-hidden': true,
};

export const HomeIcon = ({ filled = false, className = 'w-6 h-6' }) => (
  <svg {...base} className={className} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.8}>
    <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-10.5Z" strokeLinejoin="round" />
  </svg>
);

export const SearchIcon = ({ filled = false, className = 'w-6 h-6' }) => (
  <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth={filled ? 2.4 : 1.8}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.6-3.6" strokeLinecap="round" />
  </svg>
);

export const PlusSquareIcon = ({ filled = false, className = 'w-6 h-6' }) => (
  <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth={1.8}>
    <rect x="3" y="3" width="18" height="18" rx="4.5" />
    <path d="M12 8v8M8 12h8" strokeLinecap="round" />
    {filled && <rect x="3" y="3" width="18" height="18" rx="4.5" fill="currentColor" opacity="0.12" />}
  </svg>
);

export const HeartIcon = ({ filled = false, className = 'w-6 h-6', strokeWidth = 1.8 }) => (
  <svg {...base} className={className} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={strokeWidth}>
    <path d="M12 20.5s-7.5-4.4-7.5-10A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 7.5 3.1c0 5.6-7.5 10-7.5 10Z" strokeLinejoin="round" />
  </svg>
);

export const CommentIcon = ({ className = 'w-6 h-6' }) => (
  <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M21 11.6c0 4.3-4 7.8-9 7.8-1 0-2-.2-2.9-.6L4 21l1.3-3.8A7.5 7.5 0 0 1 3 11.6C3 7.4 7 3.9 12 3.9s9 3.5 9 7.7Z" strokeLinejoin="round" />
  </svg>
);

export const ShareIcon = ({ className = 'w-6 h-6' }) => (
  <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M21 3 3 10.5l7 2.5 2.5 7L21 3Z" strokeLinejoin="round" />
    <path d="M21 3 10 14" strokeLinecap="round" />
  </svg>
);

export const BookmarkIcon = ({ filled = false, className = 'w-6 h-6' }) => (
  <svg {...base} className={className} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8}>
    <path d="M6 3h12v18l-6-4.3L6 21V3Z" strokeLinejoin="round" />
  </svg>
);

export const MoreIcon = ({ className = 'w-6 h-6' }) => (
  <svg {...base} className={className} fill="currentColor">
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
);

export const TrashIcon = ({ className = 'w-5 h-5' }) => (
  <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth={1.7}>
    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const BackIcon = ({ className = 'w-6 h-6' }) => (
  <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M15 4 7 12l8 8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CloseIcon = ({ className = 'w-6 h-6' }) => (
  <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
  </svg>
);

export const CameraIcon = ({ className = 'w-6 h-6' }) => (
  <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth={1.7}>
    <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.2l1.1-2h8.4l1.1 2h1.2A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-9Z" strokeLinejoin="round" />
    <circle cx="12" cy="13" r="3.6" />
  </svg>
);

export const ReelsIcon = ({ className = 'w-6 h-6' }) => (
  <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth={1.8}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <path d="M3.5 8.5h17M8.5 3.5 11 8.5M15 3.5l2.5 5" />
    <path d="m11 12.5 4 2.3-4 2.3v-4.6Z" fill="currentColor" stroke="none" />
  </svg>
);

export const GridIcon = ({ className = 'w-4 h-4' }) => (
  <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth={1.6}>
    <rect x="3" y="3" width="7.5" height="7.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" />
  </svg>
);

export const LogoutIcon = ({ className = 'w-5 h-5' }) => (
  <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M15 12H4m0 0 3.5-3.5M4 12l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11 4h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" strokeLinecap="round" />
  </svg>
);

export const SpinnerIcon = ({ className = 'w-5 h-5' }) => (
  <svg {...base} className={`${className} animate-spin`} fill="none" stroke="currentColor" strokeWidth={2.4}>
    <circle cx="12" cy="12" r="9" opacity="0.25" />
    <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
  </svg>
);

export default {
  HomeIcon,
  SearchIcon,
  PlusSquareIcon,
  HeartIcon,
  CommentIcon,
  ShareIcon,
  BookmarkIcon,
  MoreIcon,
  TrashIcon,
  BackIcon,
  CloseIcon,
  CameraIcon,
  ReelsIcon,
  GridIcon,
  LogoutIcon,
  SpinnerIcon,
};

/* ------------------------- bổ sung cho Reels/Stories/Viewer ---------------- */

export const DownloadIcon = ({ className = 'w-6 h-6' }) => (
  <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
  </svg>
);

export const VolumeOffIcon = ({ className = 'w-6 h-6' }) => (
  <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" strokeLinejoin="round" />
    <path d="m16 9 5 6m0-6-5 6" strokeLinecap="round" />
  </svg>
);

export const VolumeOnIcon = ({ className = 'w-6 h-6' }) => (
  <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" strokeLinejoin="round" />
    <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5m2.5-7.5a7 7 0 0 1 0 10" strokeLinecap="round" />
  </svg>
);

export const PlayIcon = ({ className = 'w-6 h-6' }) => (
  <svg {...base} className={className} fill="currentColor">
    <path d="M8 5.5v13l11-6.5-11-6.5Z" />
  </svg>
);

export const InstallIcon = ({ className = 'w-6 h-6' }) => (
  <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth={1.8}>
    <rect x="6" y="2.5" width="12" height="19" rx="3" />
    <path d="M12 8v6m0 0 2.5-2.5M12 14l-2.5-2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
