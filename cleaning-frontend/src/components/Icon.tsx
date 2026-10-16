import type { ReactNode } from "react";

const PATHS = {
  dashboard: (
    <>
      <rect x="1.8" y="1.8" width="5" height="5" rx="1.4" />
      <rect x="9.2" y="1.8" width="5" height="5" rx="1.4" />
      <rect x="1.8" y="9.2" width="5" height="5" rx="1.4" />
      <rect x="9.2" y="9.2" width="5" height="5" rx="1.4" />
    </>
  ),
  tasks: (
    <>
      <rect x="2.2" y="1.8" width="11.6" height="12.4" rx="2" />
      <path d="M5 5.6l1.2 1.2 2.2-2.2M5 10.4l1.2 1.2 2.2-2.2M10.2 5.8h1.4M10.2 10.6h1.4" />
    </>
  ),
  locations: (
    <>
      <path d="M8 14.2s4.6-4 4.6-7.6a4.6 4.6 0 00-9.2 0c0 3.6 4.6 7.6 4.6 7.6z" />
      <circle cx="8" cy="6.6" r="1.7" />
    </>
  ),
  reports: (
    <>
      <path d="M2 13.8h12" />
      <rect x="3" y="8.4" width="2.4" height="3.6" rx=".8" />
      <rect x="6.8" y="5.2" width="2.4" height="6.8" rx=".8" />
      <rect x="10.6" y="2.4" width="2.4" height="9.6" rx=".8" />
    </>
  ),
  import: (
    <>
      <path d="M8 2v7.6M5 6.8l3 3 3-3" />
      <path d="M2.2 10.4v1.8a1.6 1.6 0 001.6 1.6h8.4a1.6 1.6 0 001.6-1.6v-1.8" />
    </>
  ),
  export: (
    <>
      <path d="M8 9.8V2.2M5 5l3-3 3 3" />
      <path d="M2.2 10.4v1.8a1.6 1.6 0 001.6 1.6h8.4a1.6 1.6 0 001.6-1.6v-1.8" />
    </>
  ),
  users: (
    <>
      <circle cx="6.4" cy="5.4" r="2.6" />
      <path d="M1.9 13.4a4.5 4.5 0 019 0" />
      <path d="M10.6 3.2a2.4 2.4 0 010 4.4" />
      <path d="M11.6 9.4a4.2 4.2 0 012.6 4" />
    </>
  ),
  sidebar: (
    <>
      <rect x="1.8" y="2.6" width="12.4" height="10.8" rx="2.2" />
      <path d="M6.2 2.6v10.8" />
    </>
  ),
  sun: (
    <>
      <circle cx="8" cy="8" r="2.8" />
      <path d="M8 1.6v1.2M8 13.2v1.2M1.6 8h1.2M13.2 8h1.2M3.5 3.5l.85.85M11.65 11.65l.85.85M3.5 12.5l.85-.85M11.65 4.35l.85-.85" />
    </>
  ),
  moon: <path d="M13.4 9.6A5.6 5.6 0 016.4 2.6a5.6 5.6 0 107 7z" />,
  bell: (
    <>
      <path d="M4 6.6a4 4 0 018 0c0 3.2 1.4 4.4 1.4 4.4H2.6S4 9.8 4 6.6z" />
      <path d="M6.6 13.4a1.5 1.5 0 002.8 0" />
    </>
  ),
  logout: (
    <>
      <path d="M6.2 13.8H3.6a1.4 1.4 0 01-1.4-1.4V3.6a1.4 1.4 0 011.4-1.4h2.6" />
      <path d="M10.4 11.2L13.6 8l-3.2-3.2M13.6 8H6.2" />
    </>
  ),
  menu: <path d="M2.4 4h11.2M2.4 8h11.2M2.4 12h11.2" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  plus: <path d="M8 3v10M3 8h10" />,
  back: <path d="M9.8 3.4L5.2 8l4.6 4.6" />,
  chevronRight: <path d="M6.2 3.4L10.8 8l-4.6 4.6" />,
  chevronDown: <path d="M3.4 6.2L8 10.8l4.6-4.6" />,
  check: <path d="M3.2 8.4l3 3 6.6-6.8" />,
  calendar: (
    <>
      <rect x="2" y="3" width="12" height="11" rx="2" />
      <path d="M2 6.6h12M5.4 1.8v2.4M10.6 1.8v2.4" />
    </>
  ),
  filter: <path d="M2.2 3.4h11.6M4.4 8h7.2M6.6 12.6h2.8" />,
  edit: (
    <>
      <path d="M10.8 2.8l2.4 2.4-7.6 7.6-3 .6.6-3z" />
      <path d="M9.4 4.2l2.4 2.4" />
    </>
  ),
  trash: (
    <>
      <path d="M2.6 4.4h10.8M6.4 4.4V2.8h3.2v1.6" />
      <path d="M3.8 4.4l.7 8.6a1.4 1.4 0 001.4 1.2h4.2a1.4 1.4 0 001.4-1.2l.7-8.6" />
    </>
  ),
  keyboard: (
    <>
      <rect x="1.6" y="3.6" width="12.8" height="8.8" rx="1.8" />
      <path d="M4.4 6.4h.01M6.8 6.4h.01M9.2 6.4h.01M11.6 6.4h.01M5.2 9.6h5.6" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.6" />
      <path d="M10.7 10.7 14 14" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 17 }: { name: IconName; size?: number }): ReactNode {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
