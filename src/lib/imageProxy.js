// Image proxy helper — generic CDN image proxy, with session-bound URL
// detection that matches what ProxiedAvatar does for profile photos.
//
// Why session-bound URLs return '':
// - IG/TT CDN URLs in our scraped `accounts-full.json` are session-bound
//   signed URLs with short expiry (`oe=` ~24h, `x-expires` for TT).
//   Fetching them from any browser returns 403 because:
//     a) the URL is signed for a different session (Meta proxygen-bolt)
//     b) the URL is time-expired
//   There is no client-side fix. Re-scraping gives URLs that expire
//   within days.
// - For profile photos, ProxiedAvatar wraps this with a brand-icon tile
//   fallback. For post thumbnails (ViralPostCard), an empty src makes the
//   <img> render broken-image icon — the parent card already shows a
//   placeholder, so the visual is acceptable.
//
// Worker /avatar route stays as the universal CORS-clean proxy for any
// future non-IG/TT CDN, with 3-strategy fallback (direct, mobile UA,
// weserv.nl) — kept for any non-session-bound host.

const WORKER_URL = import.meta.env.VITE_LLM_PROXY_URL || 'https://titan-llm-proxy.nickasad10007.workers.dev';

// Hosts whose signed URLs are session-bound and will 403 from any other
// browser. Same list as ProxiedAvatar — keep them in sync.
const SESSION_BOUND_HOSTS = [
  'instagram.fbcdn.net',
  'fbcdn.net',
  'cdninstagram.com',
  'scontent-',
  'tiktokcdn-',
  'p16-common-sign',
  'p17-common-sign',
  'p18-common-sign',
  'p19-common-sign',
  'p77-sign',
  'musical.ly'
];

function isSessionBoundHost(url) {
  try {
    const host = new URL(url).host.toLowerCase();
    return SESSION_BOUND_HOSTS.some((h) => host.includes(h));
  } catch {
    return false;
  }
}

/**
 * Convert a CDN image URL into a fetchable URL the browser will accept.
 *
 * - Empty / data: / Worker / `/TITAN/...` committed asset: returned untouched.
 * - `/...` runtime path (e.g. /video/cover/{id}.webp — daily-scraped but
 *   not committed): may 404 if file is gone. Returned '' to skip the fetch.
 * - IG/TT session-bound: returns '' (caller must handle empty src).
 * - Other remote CDN: routed through Worker `/avatar` (CORS-clean).
 */
export function proxiedImage(url, size = 192) {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  if (url.startsWith(WORKER_URL)) return url;
  if (url.startsWith('/TITAN/')) return url; // committed static asset (avatars)
  if (url.startsWith('/')) return ''; // runtime local path — may 404, skip
  if (isSessionBoundHost(url)) return ''; // session-bound — skip fetch
  return `${WORKER_URL}/avatar?url=${encodeURIComponent(url)}&w=${size}&h=${size}&fit=cover`;
}

/**
 * First character of the username, uppercased — used as the avatar fallback.
 */
export function avatarInitial(username) {
  return (username ?? '?')[0]?.toUpperCase() ?? '?';
}
