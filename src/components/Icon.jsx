// Small, local line icons keep the first prototype independent of a remote icon CDN.
const paths = {
  book: <><path d="M12 7c-3-2-6-2-9-1v13c3-1 6-1 9 1 3-2 6-2 9-1V6c-3-1-6-1-9 1Z"/><path d="M12 7v13M6 9h3M6 12h3M15 9h3M15 12h3"/></>,
  home: <><path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z"/></>,
  compass: <><circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/></>,
  bookmark: <path d="M6 3h12v18l-6-4-6 4Z"/>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2Z"/></>,
  search: <><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></>,
  filter: <><path d="M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M8 15v6"/></>,
  back: <><path d="m14 5-7 7 7 7M7 12h14"/></>,
  chevron: <path d="m9 5 7 7-7 7"/>,
  play: <path d="m8 4 12 8-12 8Z"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></>,
  logout: <><path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4"/></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.01"/></>,
};
export default function Icon({ name, size = 22, className = '' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>{paths[name] || paths.book}</svg>;
}
