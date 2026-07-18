// Image proxy helper — handles Instagram/Facebook/TikTok CDN avatar restrictions.
//
// Two paths depending on host:
//
// 1. IG/TT CDN (instagram.fbcdn.net, tiktokcdn-*.com, etc.):
//    These use Akamai bot manager that fingerprints TLS handshake + Referer.
//    Server-side fetch from Cloudflare Worker returns 403 because Worker TLS
//    fingerprint is not a real browser. We let the BROWSER fetch directly:
//    - `crossOrigin="anonymous"` strips Origin/Referer headers at the network layer
//    - Browser's real TLS fingerprint passes Akamai
//    - Result: image loads with 200 OK from the user's browser, CORS-clean
//
// 2. Other / unknown CDN:
//    Route through Cloudflare Worker `/avatar` (3-strategy fallback).
//
// Why not just use weserv.nl: weserv itself is now blocked by IG/TT Akamai at
// the proxy level — it returns 404 for scontent-*.cdninstagram.com.
//
// Why not Worker as universal fallback: Worker TLS fingerprint is Node-like
// (not Chrome/Safari), so Akamai bot manager returns 403 even with browser UA
// and proper Referer — verified 18 Jul with all 3 strategies in Worker.

const WORKER_URL = import.meta.env.VITE_LLM_PROXY_URL || 'https://titan-llm-proxy.nickasad10007.workers.dev';

// Hosts where Akamai bot manager blocks server-side fetch (Worker).
// For these, browser-side fetch with `crossOrigin="anonymous"` is the only way.
const BROWSER_DIRECT_HOSTS = [
  'instagram.fbcdn.net',
  'fbcdn.net',
  'cdninstagram.com',
  'scontent-',           // scontent-ams2-1.cdninstagram.com
  'tiktokcdn-',          // tiktokcdn-eu.com, tiktokcdn-us.com
  'p16-common-sign',     // p16-common-sign.tiktokcdn-us.com
  'p77-sign',            // newer TT sign domain
  'musical.ly'           // legacy TT domain
];

/**
 * Return true if the URL is on a host where the browser can fetch directly
 * (passes Akamai TLS fingerprint) but Worker cannot.
 */
function isBrowserDirectHost(url) {
  try {
    const host = new URL(url).host.toLowerCase();
    return BROWSER_DIRECT_HOSTS.some((h) => host.includes(h));
  } catch {
    return false;
  }
}

/**
 * Convert a CDN image URL into a fetchable URL the browser will accept.
 *
 * - Empty / data: / local / already-proxied: returned untouched.
 * - IG/TT CDN (Akamai-protected): returned untouched, but caller MUST set
 *   `crossOrigin="anonymous"` on the <img> to strip Origin/Referer.
 * - Other remote CDN: routed through Worker `/avatar` (CORS-clean).
 */
export function proxiedImage(url, size = 192) {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  if (url.startsWith(WORKER_URL)) return url;
  if (url.startsWith('/TITAN/') || url.startsWith('/')) return url; // local asset
  if (isBrowserDirectHost(url)) return url; // browser-direct; caller needs crossOrigin
  // Route through Worker avatar proxy — strips CORP/COEP, sets proper CORS headers.
  return `${WORKER_URL}/avatar?url=${encodeURIComponent(url)}&w=${size}&h=${size}&fit=cover`;
}

/**
 * First character of the username, uppercased — used as the avatar fallback.
 */
export function avatarInitial(username) {
  return (username ?? '?')[0]?.toUpperCase() ?? '?';
}
