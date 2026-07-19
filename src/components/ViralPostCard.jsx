// ViralPostCard — single card in the "Top 5 Viral Posts" section.
// V26: card-level click opens the actual post (IG/TT) in a new tab.
// Falls back to /account/:slug if no postUrl available (defensive).
// Shows: thumbnail (or platform icon if missing), caption line-clamp-2,
// metrics, @username + relative time.
import { Link } from 'react-router-dom';
import { Eye, Heart, MessageCircle, Play, TrendingUp, ExternalLink } from 'lucide-react';
import { PlatformIcon, platformLabel } from './icons/PlatformIcon.jsx';
import { formatNumber, formatCompact } from '../lib/format.js';
import { proxiedImage } from '../lib/imageProxy.js';

// V25.2: token-based rank palette (V23: no raw Tailwind colors)
const RANK_COLORS = [
  'text-accent-warning',   // gold
  'text-text-secondary',   // silver
  'text-accent-secondary'  // bronze (purple)
];

function relativeTime(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'baru saja';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}j lalu`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}h lalu`;
  const week = Math.floor(day / 7);
  if (week < 5) return `${week}mgu lalu`;
  const month = Math.floor(day / 30);
  return `${month}bln lalu`;
}

export function ViralPostCard({ post, rank }) {
  if (!post) return null;
  const mediaIsVideo = post.mediaType === 'VIDEO' || post.mediaType === 'REEL';
  // V25.2: evaluate proxiedImage once; '' means session-bound URL or missing — show placeholder.
  const thumbSrc = proxiedImage(post.thumbnailUrl, 320);
  // V26: prefer postUrl (IG normalizes to this; TT also writes postUrl now),
  // fall back to videoUrl (TT legacy), then account page as last resort.
  const targetUrl = post.postUrl || post.videoUrl || null;
  const accountHref = `/account/${post.slug}`;

  // V26: shared body — extracted so both <a> (has postUrl) and <Link> (fallback)
  // render identically. Props.aria-label documented at outer wrapper.
  const cardBody = (
    <>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <PlatformIcon platform={post.platform} className="w-3.5 h-3.5" />
          <span className="text-text-muted truncate">@{post.username}</span>
        </div>
        <div className="flex items-center gap-2">
          {rank ? (
            <span
              className={`flex items-center gap-0.5 font-semibold tabular-nums ${
                RANK_COLORS[rank - 1] ?? RANK_COLORS[2]
              }`}
            >
              <TrendingUp className="w-3 h-3" />
              #{rank}
            </span>
          ) : null}
        </div>
      </div>

      <div className="relative aspect-square bg-bg-tertiary rounded overflow-hidden">
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        {/* V25.2: hide placeholder only when thumb is actually rendered (thumbSrc truthy) */}
        <div
          className={`${thumbSrc ? 'hidden' : ''} absolute inset-0 flex items-center justify-center bg-gradient-to-br from-bg-tertiary to-bg-primary`}
        >
          <PlatformIcon platform={post.platform} className="w-12 h-12 text-text-muted opacity-50" />
        </div>
        {mediaIsVideo ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
            <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
              <Play className="w-5 h-5 text-black fill-current ml-0.5" />
            </div>
          </div>
        ) : null}
      </div>

      {post.caption ? (
        <p className="text-xs text-text-secondary line-clamp-2 min-h-[2rem]">
          {post.caption}
        </p>
      ) : (
        <p className="text-xs text-text-muted italic line-clamp-2 min-h-[2rem]">
          (Tanpa caption)
        </p>
      )}

      <div className="flex items-center justify-between text-[11px] text-text-muted">
        <span title={platformLabel(post.platform)}>{platformLabel(post.platform)}</span>
        <span>{relativeTime(post.timestamp)}</span>
      </div>

      <div className="grid grid-cols-3 gap-1 text-center text-xs">
        <div className="flex flex-col items-center gap-0.5">
          <Eye className="w-3 h-3 text-text-muted" />
          <span className="font-semibold text-text-primary tabular-nums">
            {formatCompact(post.viewCount ?? 0)}
          </span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <Heart className="w-3 h-3 text-text-muted" />
          <span className="font-semibold text-text-primary tabular-nums">
            {formatNumber(post.likeCount ?? 0)}
          </span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <MessageCircle className="w-3 h-3 text-text-muted" />
          <span className="font-semibold text-text-primary tabular-nums">
            {formatNumber(post.commentCount ?? 0)}
          </span>
        </div>
      </div>
    </>
  );

  // V26: kalau ada postUrl → buka video/post asli di tab baru (user request).
  // Fallback ke internal /account/:slug kalau tidak ada (defensive).
  const sharedClass = "surface p-3 flex flex-col gap-2 hover:border-accent-primary/50 transition-colors group";
  const sharedAriaLabel = `Buka post viral @${post.username}: ${post.caption?.slice(0, 60) ?? 'tanpa caption'}`;

  if (targetUrl) {
    return (
      <a
        href={targetUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={sharedClass}
        aria-label={sharedAriaLabel}
      >
        {cardBody}
      </a>
    );
  }

  return (
    <Link
      to={accountHref}
      className={sharedClass}
      aria-label={sharedAriaLabel}
    >
      {cardBody}
    </Link>
  );
}
