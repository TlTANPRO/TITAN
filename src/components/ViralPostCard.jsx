// ViralPostCard — single card in the "Top 5 Viral Posts" section.
// V26: card-level click opens the actual post (IG/TT) in a new tab.
// Falls back to /account/:slug if no postUrl available (defensive).
// Shows: thumbnail (or platform icon if missing), caption line-clamp-2,
// metrics, @username + relative time.
// V27.6: when proxiedImage returns '' (session-bound IG/TT CDN), fetch the
// public og:image via the existing webAccess pipeline (L1 local + L2 bot
// UA + L3 Jina) so the user sees the actual post visual instead of a
// blank platform-icon placeholder.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Heart, MessageCircle, Play, TrendingUp, ExternalLink } from 'lucide-react';
import { PlatformIcon, platformLabel } from './icons/PlatformIcon.jsx';
import { formatNumber, formatCompact } from '../lib/format.js';
import { proxiedImage } from '../lib/imageProxy.js';
import { fetchSocialContent } from '../lib/webAccess.js';
import { RANK_COLORS, relativeTimeID } from '../lib/titan-tokens.js';

export function ViralPostCard({ post, rank }) {
  // V27.8: defensive — post is normally an object, but the weekly recap can
  // hand back null/undefined in edge cases. Coerce to a safe shape so the
  // hooks below (useState + useEffect) always run in the same order on
  // every render — never return null BEFORE the hook calls.
  const safePost = post ?? null;
  const mediaIsVideo = safePost?.mediaType === 'VIDEO' || safePost?.mediaType === 'REEL';
  // V25.2: evaluate proxiedImage once; '' means session-bound URL or missing — show placeholder.
  const initialThumb = proxiedImage(safePost?.thumbnailUrl, 320);
  // V26: prefer postUrl (IG normalizes to this; TT also writes postUrl now),
  // fall back to videoUrl (TT legacy), then account page as last resort.
  const targetUrl = safePost?.postUrl || safePost?.videoUrl || null;
  const accountHref = safePost?.slug ? `/account/${safePost.slug}` : '#';

  // V27.6: when the session-bound thumbnail is empty, fetch the public
  // og:image via the existing webAccess pipeline (L1 local + L2 bot UA +
  // L3 Jina) so the user sees the actual post visual. og:image is the
  // public preview that IG/TT serve to crawlers — valid for days.
  const [ogImage, setOgImage] = useState('');
  useEffect(() => {
    if (initialThumb || !targetUrl) return;
    let cancelled = false;
    fetchSocialContent(targetUrl)
      .then((res) => {
        if (cancelled || !res?.ok) return;
        const img = res.raw?.image || res.image;
        if (img) setOgImage(img);
      })
      .catch(() => {
        // silent — placeholder stays visible
      });
    return () => {
      cancelled = true;
    };
  }, [initialThumb, targetUrl]);

  const thumbSrc = initialThumb || ogImage;

  // V27.8: after all hooks have run, we can safely return null for invalid post.
  if (!safePost) return null;

  // V26: shared body — extracted so both <a> (has postUrl) and <Link> (fallback)
  // render identically. Props.aria-label documented at outer wrapper.
  const cardBody = (
    <>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <PlatformIcon platform={safePost.platform} className="w-3.5 h-3.5" />
          <span className="text-text-muted truncate">@{safePost.username}</span>
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
            alt={`Post viral @${safePost.username}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        {/* V27.6: placeholder visible until thumb loads (or if all strategies fail) */}
        <div
          className={`${thumbSrc ? 'hidden' : ''} absolute inset-0 flex items-center justify-center bg-gradient-to-br from-bg-tertiary to-bg-primary`}
        >
          <PlatformIcon platform={safePost.platform} className="w-12 h-12 text-text-muted opacity-50" />
        </div>
        {mediaIsVideo ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
            <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
              <Play className="w-5 h-5 text-black fill-current ml-0.5" />
            </div>
          </div>
        ) : null}
      </div>

      {safePost.caption ? (
        <p className="text-xs text-text-secondary line-clamp-2 min-h-[2rem]">
          {safePost.caption}
        </p>
      ) : (
        <p className="text-xs text-text-muted italic line-clamp-2 min-h-[2rem]">
          (Tanpa caption)
        </p>
      )}

      <div className="flex items-center justify-between text-[11px] text-text-muted">
        <span title={platformLabel(safePost.platform)}>{platformLabel(safePost.platform)}</span>
        <span>{relativeTimeID(safePost.timestamp)}</span>
      </div>

      <div className="grid grid-cols-3 gap-1 text-center text-xs">
        <div className="flex flex-col items-center gap-0.5">
          <Eye className="w-3 h-3 text-text-muted" />
          <span className="font-semibold text-text-primary tabular-nums">
            {formatCompact(safePost.viewCount ?? 0)}
          </span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <Heart className="w-3 h-3 text-text-muted" />
          <span className="font-semibold text-text-primary tabular-nums">
            {formatNumber(safePost.likeCount ?? 0)}
          </span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <MessageCircle className="w-3 h-3 text-text-muted" />
          <span className="font-semibold text-text-primary tabular-nums">
            {formatNumber(safePost.commentCount ?? 0)}
          </span>
        </div>
      </div>
    </>
  );

  // V26: kalau ada postUrl → buka video/post asli di tab baru (user request).
  // Fallback ke internal /account/:slug kalau tidak ada (defensive).
  const sharedClass = "surface p-3 flex flex-col gap-2 hover:border-accent-primary/50 transition-colors group";
  // V37 a11y: accessible name harus mengandung teks visible di dalam link
  // (Lighthouse label-content-name-mismatch). Teks visible = "@username".
  const sharedAriaLabel = `Buka post viral @${safePost.username}`;

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
