// ViralPostCard — single card in the "Top 5 Viral Posts" section.
// Shows: thumbnail (or platform icon if missing), caption line-clamp-2,
// metrics, @username + relative time. Click navigates to /account/:slug.
import { Link } from 'react-router-dom';
import { Eye, Heart, MessageCircle, Play, TrendingUp } from 'lucide-react';
import { PlatformIcon, platformLabel } from './icons/PlatformIcon.jsx';
import { formatNumber, formatCompact } from '../lib/format.js';
import { proxiedImage } from '../lib/imageProxy.js';

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
  return (
    <Link
      to={`/account/${post.slug}`}
      className="surface p-3 flex flex-col gap-2 hover:border-accent-primary/50 transition-colors group"
      aria-label={`Post viral @${post.username}: ${post.caption?.slice(0, 60) ?? 'tanpa caption'}`}
    >
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <PlatformIcon platform={post.platform} className="w-3.5 h-3.5" />
          <span className="text-text-muted truncate">@{post.username}</span>
        </div>
        {rank ? (
          <span
            className={`flex items-center gap-0.5 font-bold tabular-nums ${
              rank === 1 ? 'text-yellow-500' : rank === 2 ? 'text-zinc-400' : 'text-orange-700'
            }`}
          >
            <TrendingUp className="w-3 h-3" />
            #{rank}
          </span>
        ) : null}
      </div>

      <div className="relative aspect-square bg-bg-tertiary rounded overflow-hidden">
        {(() => {
          // proxiedImage() returns '' for IG/TT session-bound URLs.
          // Skip the <img> entirely so the placeholder gradient shows.
          const thumbSrc = proxiedImage(post.thumbnailUrl, 320);
          return thumbSrc ? (
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
          ) : null;
        })()}
        <div
          className={`${post.thumbnailUrl ? 'hidden' : ''} absolute inset-0 flex items-center justify-center bg-gradient-to-br from-bg-tertiary to-bg-primary`}
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
    </Link>
  );
}
