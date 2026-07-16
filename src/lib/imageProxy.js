// Image proxy helper — bypass cross-origin restrictions on Instagram/Facebook CDN avatars.
//
// Primary path: Cloudflare Worker `/avatar` route (titan-llm-proxy.nickasad10007.workers.dev/avatar?url=...)
//   — Worker fetches with Mozilla UA, returns image bytes with CORS + cross-origin headers.
// Fallback:    UI letter avatar (caller passes `avatarInitial`).
//
// Why not `images.weserv.nl` anymore: weserv now returns 404 for scontent-*.cdninstagram.com
// and p16-common-sign.tiktokcdn-us.com (blacklisted at proxy level).

const WORKER_URL = import.meta.env.VITE_LLM_PROXY_URL || 'https://titan-llm-proxy.nickasad10007.workers.dev';

/**
 * Convert a direct CDN image URL into a proxy URL the browser will accept.
 * Leaves data: URLs, already-proxied URLs, and Worker-avatar URLs untouched.
 */
export function proxiedImage(url, size = 192) {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  if (url.startsWith(WORKER_URL)) return url;
  if (url.startsWith('/TITAN/') || url.startsWith('/')) return url; // local asset
  // Route through Worker avatar proxy — strips CORP/COEP, sets proper CORS headers.
  return `${WORKER_URL}/avatar?url=${encodeURIComponent(url)}&w=${size}&h=${size}&fit=cover`;
}

/**
 * First character of the username, uppercased — used as the avatar fallback.
 */
export function avatarInitial(username) {
  return (username ?? '?')[0]?.toUpperCase() ?? '?';
}
