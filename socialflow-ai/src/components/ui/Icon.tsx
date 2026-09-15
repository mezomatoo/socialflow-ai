'use client';

/**
 * Hafif, bağımlılıksız SVG ikon seti (24×24, stroke tabanlı).
 * İkon kütüphanesi indirmesi gerektirmez; önizleme iframe'inde de çalışır.
 */

const PATHS: Record<string, React.ReactNode> = {
  inbox: <><path d="M4 4h16l2 11v5H2v-5L4 4Z" /><path d="M2 15h6l2 3h4l2-3h6" /></>,
  home: <path d="M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  draft: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 12h6M9 16h6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5 10-11" />,
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.5 2.5L16 9.5" />
    </>
  ),
  'alert-triangle': (
    <>
      <path d="M12 4 2.8 20h18.4z" />
      <path d="M12 10v4.5M12 17.4v.2" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" />,
  'x-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="m4 17 4.5-4.5L13 17l3-2.5L20 18" />
    </>
  ),
  video: (
    <>
      <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
      <path d="m15.5 11 6-3.5v9l-6-3.5z" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.8 20c.6-3.4 3.1-5.2 6.2-5.2s5.6 1.8 6.2 5.2" />
      <path d="M16.5 5.2a3.4 3.4 0 0 1 0 6.6M18 14.4c2 .8 3.3 2.5 3.7 5" />
    </>
  ),
  brand: (
    <>
      <path d="M12 3 4 7v6c0 4.4 3.3 7.4 8 8 4.7-.6 8-3.6 8-8V7z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3.5 13.6 8 18 9.6 13.6 11.2 12 15.7 10.4 11.2 6 9.6 10.4 8z" />
      <path d="M18.5 15.5 19.2 17.4 21 18.1 19.2 18.8 18.5 20.7 17.8 18.8 16 18.1 17.8 17.4z" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16v-4M12 16V8M16 16v-6" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z" />
      <path d="M10 19a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 7 2.6h.1A1.7 1.7 0 0 0 8.3 1V1a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 2.6c.6.3 1.3.2 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M8 8l4-4 4 4" />
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v12M8 12l4 4 4-4" />
      <path d="M4 17v1.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V17" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="m14.5 5.5 4 4" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 6.5A2.5 2.5 0 0 0 12.5 4H6.5A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-13.7-5.3L4 8" />
      <path d="M4 4v4h4M4 13a8 8 0 0 0 13.7 5.3L20 16" />
      <path d="M20 20v-4h-4" />
    </>
  ),
  send: <path d="M21 3 10.5 13.5M21 3l-6.8 18-3.7-7.5L3 10z" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M4 4l16 16" />
      <path d="M9.9 5.9A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.3 4.1M6.4 7.9A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1.2 0 2.3-.2 3.3-.6" />
      <path d="M9.9 10.2a3 3 0 0 0 4.1 4.2" />
    </>
  ),
  link: (
    <>
      <path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 1 0-5.7-5.7l-1.3 1.3" />
      <path d="M14 10.5a4 4 0 0 0-5.7 0L5.5 13.3a4 4 0 1 0 5.7 5.7l1.3-1.3" />
    </>
  ),
  hashtag: <path d="M9 3 7 21M17 3l-2 18M4 8h17M3 16h17" />,
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3.5 12.5 8.5 4.7 8.5-4.7M3.5 16.8 12 21.5l8.5-4.7" />
    </>
  ),
  crop: (
    <>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M2 6h14a2 2 0 0 1 2 2v14" />
    </>
  ),
  magic: (
    <>
      <path d="m4 20 10.5-10.5M14 4l1 2.5L17.5 8 15 9l-1 2.5L13 9l-2.5-1L13 6.5z" />
      <path d="m18 13 .8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z" />
    </>
  ),
  expand: <path d="M4 9V4h5M20 15v5h-5M20 9V4h-5M4 15v5h5" />,
  collapse: <path d="M9 4v5H4M15 20v-5h5M15 4v5h5M9 20v-5H4" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  arrowRight: <path d="M4 12h15M13 6l6 6-6 6" />,
  arrowLeft: <path d="M20 12H5M11 6l-6 6 6 6" />,
  logout: (
    <>
      <path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15" />
      <path d="M10 8 6 12l4 4M6 12h10" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20c.7-3.6 3.5-5.6 7.2-5.6s6.5 2 7.2 5.6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v6c0 4.2 3 7.2 7 8 4-.8 7-3.8 7-8V6z" />
      <path d="M12 8v4M12 15.4v.2" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7.5" ry="3" />
      <path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
      <path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 0 0 0 18c1.4 0 2-1 2-2s-.7-1.6-.7-2.4c0-.9.7-1.6 1.7-1.6H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z" />
      <circle cx="7.8" cy="11.5" r="1.1" />
      <circle cx="10.5" cy="7.6" r="1.1" />
      <circle cx="15" cy="8.2" r="1.1" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" />
      <path d="M3.5 4v4.5H8" />
      <path d="M12 8v4.3l3 1.8" />
    </>
  ),
  folder: <path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h3.6l1.8 2H19a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />,
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.2M3.5 12h.2M3.5 18h.2" />,
  filter: <path d="M3.5 5h17l-6.5 8v6l-4 2v-8z" />,
  save: (
    <>
      <path d="M5 3.5h11L20.5 8v12.5H5z" />
      <path d="M8.5 3.5v6h7v-6M8.5 20.5v-6h7v6" />
    </>
  ),
  zap: <path d="M13.5 2 4 13.5h6.5L10 22l9.5-11.5H13z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.6v.2" />
    </>
  ),
  phone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.8 5.2h2.4M11 18.6h2" />
    </>
  ),
  monitor: (
    <>
      <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
      <path d="M8.5 20.5h7M12 16.5v4" />
    </>
  ),
  rotate: (
    <>
      <path d="M20 5v5h-5" />
      <path d="M19.4 10A7.7 7.7 0 1 0 12 19.7" />
    </>
  ),
  text: <path d="M5 6.5V5h14v1.5M12 5v14M9 19h6" />,
  shapes: (
    <>
      <circle cx="7.5" cy="7.5" r="4" />
      <rect x="12.5" y="12.5" width="8" height="8" rx="1.6" />
      <path d="m16.5 3.5 4 7h-8z" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="10" cy="17" r="2.2" />
    </>
  ),
  drag: (
    <>
      <circle cx="9" cy="6" r="1.3" />
      <circle cx="15" cy="6" r="1.3" />
      <circle cx="9" cy="12" r="1.3" />
      <circle cx="15" cy="12" r="1.3" />
      <circle cx="9" cy="18" r="1.3" />
      <circle cx="15" cy="18" r="1.3" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  play: <path d="M7.5 4.8 19 12 7.5 19.2z" />,
  pause: <path d="M9 5v14M15 5v14" />,
  key: (
    <>
      <circle cx="8" cy="14" r="4" />
      <path d="m11 11 8-8 2 2-2 2 2 2-2.5 2.5-2-2L14 12" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.2 9.5h17.6M3.2 14.5h17.6" />
      <path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" />
    </>
  )
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 18,
  className = '',
  strokeWidth = 1.7
}: {
  name: IconName | string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const content = PATHS[name] ?? PATHS.info;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {content}
    </svg>
  );
}

export default Icon;
