// ProxiedAvatar — single source of truth for IG/TT profile photos.
//
// Why this component exists:
// - IG/TT CDN (instagram.fbcdn.net, tiktokcdn-*.com) uses Akamai bot manager
//   that fingerprints TLS handshake. Cloudflare Worker cannot bypass this
//   (Worker TLS fingerprint is Node-like, not a real browser) — verified 18 Jul.
// - The BROWSER can fetch these URLs directly because the browser's real TLS
//   fingerprint passes Akamai. We do NOT set crossOrigin (which would force a
//   CORS preflight that the CDN doesn't honor); we just let the browser's
//   natural TLS + Referer headers do the work.
// - On load failure (e.g. signed URL expired), we fall back to a brand-icon
//   tile (IG gradient or TT black) — never a letter, per V10 design rule.

import { useState } from 'react';
import { Instagram } from 'lucide-react';
import { proxiedImage } from '../lib/imageProxy.js';
import { TtIcon } from './icons/TtIcon.jsx';

/**
 * Render the account profile photo.
 *
 * Props:
 * - account: full account object (uses account.avatarUrl, account.platform, account.username)
 * - size: pixel size of the rounded image (default 48)
 * - className: optional extra classes on the <img> (always uses object-cover)
 */
export function ProxiedAvatar({ account, size = 48, className = '' }) {
  const url = account?.avatarUrl;
  const [failed, setFailed] = useState(false);
  const isIG = account?.platform === 'instagram';
  const PlatformIcon = isIG ? Instagram : TtIcon;

  if (!url || failed) {
    // Brand-icon fallback — no letter "E", per V10 design rule.
    return (
      <div
        className={`flex-shrink-0 rounded-full flex items-center justify-center ${
          isIG
            ? 'bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500'
            : 'bg-black'
        } ${className}`}
        style={{ width: size, height: size }}
      >
        <PlatformIcon className="text-white" style={{ width: size * 0.5, height: size * 0.5 }} />
      </div>
    );
  }

  // Direct browser fetch for IG/TT Akamai-protected hosts (TLS fingerprint
  // passes because it's a real browser), or Worker /avatar proxy for other
  // CDNs. No crossOrigin — that would force CORS preflight that IG/TT
  // don't honor. Referer is sent by the browser naturally, which is what
  // Akamai expects.
  const src = proxiedImage(url, size);

  return (
    <img
      src={src}
      alt={`@${account.username ?? 'account'}`}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`flex-shrink-0 rounded-full object-cover bg-bg-tertiary ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
