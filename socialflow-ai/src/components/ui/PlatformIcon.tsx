'use client';

import { PLATFORM_META, type PlatformCode } from '@/lib/platforms/platforms';

/**
 * Platform simgeleri — basitleştirilmiş, özgün geometrik işaretler.
 * Korunan resmî logolar birebir kopyalanmaz; marka rengi + tanınabilir
 * bir glyph kullanılır.
 */

const MARKS: Record<string, React.ReactNode> = {
  INSTAGRAM: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="5" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4" strokeWidth="1.8" />
      <circle cx="17" cy="7" r="1.15" fill="currentColor" stroke="none" />
    </>
  ),
  FACEBOOK: <path d="M14.6 21v-7.2h2.5l.4-2.9h-2.9V9.1c0-.84.24-1.42 1.45-1.42H17.6V5.1c-.28-.04-1.2-.12-2.28-.12-2.26 0-3.8 1.38-3.8 3.9v1.98H9v2.9h2.5V21z" fill="currentColor" stroke="none" />,
  X: <path d="M5 5h3.6l3.9 5.3L17 5h2.1l-5.7 6.8L19.4 19h-3.6l-4.1-5.6L7.1 19H5l6-7.1z" fill="currentColor" stroke="none" />,
  LINKEDIN: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3.2" strokeWidth="1.7" />
      <path d="M8 10.5V16M8 7.8v.1M11.5 16v-3.2c0-1.2.8-1.9 1.8-1.9s1.7.7 1.7 1.9V16" strokeWidth="1.7" />
    </>
  ),
  TIKTOK: (
    <path
      d="M14.3 4c.3 2 1.5 3.2 3.5 3.4v2.3c-1.3.1-2.5-.3-3.6-1.1v5.1c0 3.5-2.6 5.6-5.4 5.2-2.3-.3-3.9-2.3-3.8-4.6.1-2.5 2.2-4.3 4.7-4.1.3 0 .6.1.8.1v2.4c-.3-.1-.6-.2-1-.2-1.2 0-2.1.9-2.2 2.1-.1 1.2.8 2.2 2 2.2 1.2 0 2.1-.9 2.1-2.2V4z"
      fill="currentColor"
      stroke="none"
    />
  ),
  YOUTUBE: (
    <>
      <rect x="2.8" y="6" width="18.4" height="12" rx="4" strokeWidth="1.7" />
      <path d="m10.6 9.6 4.6 2.4-4.6 2.4z" fill="currentColor" stroke="none" />
    </>
  ),
  THREADS: (
    <path
      d="M16.4 11.6c-.2-.1-.5-.2-.7-.3.1-.9.1-1.7-.1-2.4-.5-1.9-2.1-2.9-3.9-2.9-1.6 0-3 .8-3.6 2.1l1.6.9c.3-.8 1.1-1.2 2-1.2 1 0 1.8.5 2 1.4.1.5.1 1.1 0 1.8-1.6-.2-3.2.1-4.3.9-1.2.9-1.6 2.3-1.2 3.5.4 1.2 1.6 2 3 2 1.3 0 2.5-.5 3.3-1.5.6.8 1.5 1.3 2.5 1.3v-1.8c-.7 0-1.2-.4-1.4-1 .7-.7 1.1-1.5 1.3-2.4l-1.4-.4zm-3.5 3c-.5.7-1.2 1-2 1-.7 0-1.2-.3-1.4-.9-.2-.7.1-1.5 1-1.9.6-.3 1.4-.4 2.3-.3-.1.8-.3 1.5-.6 2.1z"
      fill="currentColor"
      stroke="none"
    />
  ),
  PINTEREST: (
    <path
      d="M12 4.2a7.8 7.8 0 0 0-2.9 15c-.1-.6-.1-1.5 0-2.1l.8-3.3s-.2-.4-.2-1c0-1 .6-1.7 1.3-1.7.6 0 .9.4.9 1 0 .6-.4 1.5-.6 2.3-.2.7.3 1.3 1 1.3 1.3 0 2.2-1.6 2.2-3.5 0-1.5-1-2.5-2.8-2.5-2 0-3.3 1.5-3.3 3.1 0 .6.2 1 .5 1.4l.2.3-.1.5c0 .2-.1.2-.3.1-1-.4-1.5-1.5-1.5-2.7 0-2 1.7-4.4 5-4.4 2.7 0 4.4 1.9 4.4 4 0 2.7-1.5 4.8-3.8 4.8-.8 0-1.5-.4-1.7-.9l-.5 1.9c-.2.6-.5 1.3-.8 1.7a7.8 7.8 0 0 0 5.3-7.4c0-4.3-3.5-7.6-7.8-7.6z"
      fill="currentColor"
      stroke="none"
    />
  ),
  GOOGLE_BUSINESS: (
    <>
      <path d="M12 3.5 4 7v6.2c0 4 3.3 6.9 8 7.8 4.7-.9 8-3.8 8-7.8V7z" strokeWidth="1.7" />
      <path d="M12 8.5v7M8.5 12h7" strokeWidth="1.7" />
    </>
  )
};

export function PlatformIcon({
  platform,
  size = 24,
  rounded = 'md',
  className = '',
  muted = false
}: {
  platform: PlatformCode | string;
  size?: number;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
  muted?: boolean;
}) {
  const meta = PLATFORM_META[platform as PlatformCode];
  const color = meta?.brandColor ?? '#64748b';
  const radius = rounded === 'full' ? '999px' : rounded === 'lg' ? '12px' : rounded === 'sm' ? '6px' : '8px';

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: muted ? 'transparent' : color,
        color: muted ? color : '#fff',
        border: muted ? `1.5px solid ${color}33` : 'none',
        boxShadow: muted ? 'none' : `0 1px 2px ${color}44`
      }}
      title={meta?.name ?? platform}
      aria-label={meta?.name ?? platform}
    >
      <svg
        width={Math.round(size * 0.66)}
        height={Math.round(size * 0.66)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {MARKS[platform] ?? <circle cx="12" cy="12" r="7" strokeWidth="1.8" />}
      </svg>
    </span>
  );
}

export default PlatformIcon;
