// Image proxy helper — generic CDN image proxy.
//
// Why this returns Worker /avatar by default:
// - IG/TT CDN URLs in our scraped `accounts-full.json` are session-bound
//   signed URLs with short expiry (`oe=` ~24h, `x-expires` for TT).
//   Fetching them from any browser returns 403 because:
//     a) the URL is signed for a different session
//     b) the URL is time-expired
//   There is no client-side fix. Re-scraping gives URLs that expire
//   within days.
// - ProxiedAvatar (the only caller that needs IG/TT avatars) now skips
//   the fetch entirely and renders a brand-icon fallback. So this helper
//   is effectively only used for other CDNs (none in current dataset).
//
// Worker /avatar route stays as the universal CORS-clean proxy for any
// future non-IG/TT CDN, with 3-strategy fallback (direct, mobile UA,
// weserv.nl) — kept for any non-session-bound host.

const WORKER_URL = import.meta.env.VITE_LLM_PROXY_URL || 'https://titan-llm-proxy.nickasad10007.workers.dev';

/**
 * Convert a CDN image URL into a fetchable URL the browser will accept.
 *
 * - Empty / data: / local / already-proxied: returned untouched.
 * - Other remote CDN: routed through Worker `/avatar` (CORS-clean).
 *
 * Note: do NOT pass IG/TT signed URLs here — they are session-bound and
 * will return 403 regardless. Use ProxiedAvatar for those accounts.
 */
export function proxiedImage(url, size = 192) {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  if (url.startsWith(WORKER_URL)) return url;
  if (url.startsWith('/TITAN/') || url.startsWith('/')) return url; // local asset
  return `${WORKER_URL}/avatar?url=${encodeURIComponent(url)}&w=${size}&h=${size}&fit=cover`;
}

/**
 * First character of the username, uppercased — used as the avatar fallback.
 */
export function avatarInitial(username) {
  return (username ?? '?')[0]?.toUpperCase() ?? '?';
}
