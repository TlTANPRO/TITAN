// ProxiedAvatar — single source of truth for IG/TT profile photos.
//
// V16 update: use `account.localAvatar` (a /TITAN/assets/avatars/{slug}.{ext}
// path pointing to a real photo file committed to the repo) when present.
// Generated daily by scripts/scrape-avatars.mjs using the
// `facebookexternalhit/1.1` UA — see scripts/scrape-avatars.mjs for the
// why-and-how.
//
// The localAvatar path is the real, real, REAL profile photo: og:image
// served by IG/TT to Facebook's crawler UA, downloaded once, committed to
// the repo, served as a static asset. No proxy, no Worker, no 403 noise.
//
// Fallback chain:
//   1. `account.localAvatar`  → real photo, static asset (preferred)
//   2. Session-bound `account.avatarUrl` from ENSEMBLEDATA → SKIP (will 403)
//   3. Brand-icon tile (IG gradient or TT black) — always works

import { useState } from 'react';
import { Instagram } from 'lucide-react';
import { TtIcon } from './icons/TtIcon.jsx';

/**
 * Render the account profile photo.
 *
 * Priority:
 * - `account.localAvatar` → static asset (real photo committed to repo)
 * - else brand-icon tile (IG gradient or TT black)
 *
 * Why no `proxiedImage` / Worker fetch: the original `account.avatarUrl`
 * from ENSEMBLEDATA is session-bound (will 403 from any other browser).
 * `localAvatar` is the fresh-URL we re-scrape daily and save as a static
 * asset. See scripts/scrape-avatars.mjs.
 *
 * Props:
 * - account: full account object (uses account.localAvatar, account.avatarUrl, account.platform, account.username)
 * - size: pixel size (default 48)
 * - className: optional extra classes
 */
export function ProxiedAvatar({ account, size = 48, className = '' }) {
  const localAvatar = account?.localAvatar;
  const [failed, setFailed] = useState(false);
  const isIG = account?.platform === 'instagram';
  const PlatformIcon = isIG ? Instagram : TtIcon;

  // Local cached avatar — real photo, no fetch, no 502/403 noise.
  // This is the path that actually works in production.
  if (localAvatar && !failed) {
    return (
      <img
        src={localAvatar}
        alt={`@${account?.username ?? 'account'}`}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`flex-shrink-0 rounded-full object-cover bg-bg-tertiary ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  // No localAvatar OR localAvatar failed → brand-icon tile (always works)
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
