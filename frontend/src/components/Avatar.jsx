/**
 * src/components/Avatar.jsx
 * Round avatar with the Instagram story-ring, graceful fallback to initials.
 * Image URLs are resolved through config/urls.js (never built by hand).
 */

import { useState } from 'react';
import { resolveImageUrl } from '../../config/urls.js';
import { initialsOf } from '../utils/format.js';

const SIZES = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-20 h-20 text-xl',
  xl: 'w-36 h-36 text-4xl',
};

export default function Avatar({
  src,
  name = '',
  size = 'md',
  ring = false,
  className = '',
  onClick,
}) {
  const [failed, setFailed] = useState(false);
  const resolved = src ? resolveImageUrl(src) : null;
  const showFallback = !resolved || failed;

  const inner = (
    <div
      className={`${SIZES[size]} overflow-hidden rounded-full bg-ink-bg border border-ink-line
                  flex items-center justify-center font-semibold text-ink-soft ${className}`}
    >
      {showFallback ? (
        <span>{initialsOf(name || 'FG')}</span>
      ) : (
        <img
          src={resolved}
          alt={name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );

  const wrapped = ring ? (
    <div
      className={`${SIZES[size]} rounded-full ig-story-ring p-[2px] flex items-center justify-center`}
    >
      <div className="rounded-full bg-white p-[2px]">{inner}</div>
    </div>
  ) : (
    inner
  );

  if (!onClick) return wrapped;
  return (
    <button type="button" onClick={onClick} className="shrink-0 focus:outline-none">
      {wrapped}
    </button>
  );
}
