// ProxiedAvatar — single source of truth for IG/TT profile photos.
//
// Why this is brand-icon only (no fetch attempt):
//
// IG/TT CDN URLs (instagram.fbcdn.net, tiktokcdn-*.com) returned in our
// scraped `accounts-full.json` are **session-bound signed URLs**:
//   - IG: `_nc_oc`, `_nc_gid` parameters tie the URL to the IG session that
//     made the request. Fetched from a different browser/session → 403 from
//     Meta's proxygen-bolt proxy.
//   - TT: `x-signature` parameter is signed per session. `x-expires` is just
//     a time bound; the signature itself is session-bound → 403.
// Verified 18 Jul: browser-direct fetch from the user's own browser returns
// 403 for these URLs because they were scraped in MY session, not the
// user's. Re-scraping at deploy time would also fail for any other user.
//
// The only fully-working solution is to never attempt to fetch the IG/TT
// CDN URLs and always render the brand-icon tile (IG gradient or TT black).
// This is the same fallback we already use on load failure — we're just
// making it the default since the URL will never load.
//
// Worker /avatar proxy and direct browser fetch are both kept for OTHER
// CDNs (no accounts in this dataset use them today, but the helper stays
// generic for future accounts or post thumbnails from non-IG/TT sources).

import { useState } from 'react';
import { Instagram } from 'lucide-react';
import { proxiedImage } from '../lib/imageProxy.js';
import { TtIcon } from './icons/TtIcon.jsx';

// Hosts whose signed URLs are session-bound and will 403 from any other
// browser. We don't even attempt the fetch for these — instant fallback.
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
 * Render the account profile photo.
 *
 * For IG/TT accounts, renders the brand-icon tile by default (URL is
 * session-bound, will 403 from any other browser).
 * For other platforms, attempts fetch and falls back to a generic icon.
 *
 * Props:
 * - account: full account object (uses account.avatarUrl, account.platform, account.username)
 * - size: pixel size (default 48)
 * - className: optional extra classes
 */
export function ProxiedAvatar({ account, size = 48, className = '' }) {
  const url = account?.avatarUrl;
  const [failed, setFailed] = useState(false);
  const isIG = account?.platform === 'instagram';
  const PlatformIcon = isIG ? Instagram : TtIcon;

  // Session-bound URL → skip fetch, go straight to brand-icon fallback.
  if (!url || failed || isSessionBoundHost(url)) {
    return (
      <div
        className={`flex-shrink-0 rounded-full flex items-center justify-center ${
          isIG
            ? 'bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500'
            : 'bg-black'
        } ${className}`}
        style={{ width: size, height: size }}
        aria-label={`@${account?.username ?? 'account'}`}
      >
        <PlatformIcon className="text-white" style={{ width: size * 0.5, height: size * 0.5 }} />
      </div>
    );
  }

  // Non-session-bound URL (e.g. some other platform). Attempt fetch.
  return (
    <img
      src={proxiedImage(url, size)}
      alt={`@${account?.username ?? 'account'}`}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`flex-shrink-0 rounded-full object-cover bg-bg-tertiary ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
