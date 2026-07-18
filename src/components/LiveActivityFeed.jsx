// LiveActivityFeed — latest 10 posts across all 9 accounts, ticking relative time.
// Each post row shows the real account avatar (via <ProxiedAvatar>) — not the
// platform icon. The data layer (getLatestPosts) attaches _accountLocalAvatar
// so this component doesn't need a separate account lookup.
import { Link } from 'react-router-dom';
import { Heart, Eye, MessageCircle } from 'lucide-react';
import { formatNumber } from '../lib/format.js';
import { useEffect, useState } from 'react';
import { platformLabel } from './icons/PlatformIcon.jsx';
import { ProxiedAvatar } from './ProxiedAvatar.jsx';

const DAY_NAMES_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function relativeTime(unixSec, now) {
  const diff = Math.max(0, now / 1000 - unixSec);
  if (diff < 60) return 'baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}j`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}h`;
  return `${Math.floor(diff / 604800)}mgu`;
}

export function LiveActivityFeed({ posts }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!posts || posts.length === 0) {
    return (
      <div className="surface p-6 text-center text-text-muted text-sm">
        Belum ada aktivitas terbaru.
      </div>
    );
  }

  return (
    <div className="surface divide-y divide-border-subtle">
      {posts.map((p) => {
        const d = new Date((p.timestamp ?? p.createTime * 1000) || 0);
        return (
          <Link
            key={p._accountSlug + '-' + p.id}
            to={`/account/${p._accountSlug}`}
            className="flex items-start gap-3 p-3 hover:bg-bg-tertiary/50 transition-colors"
          >
            <ProxiedAvatar
              account={{
                platform: p._accountPlatform,
                username: p._accountUsername,
                localAvatar: p._accountLocalAvatar
              }}
              size={36}
              className=""
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <span className="font-semibold text-text-primary">@{p._accountUsername}</span>
                <span>·</span>
                <span className="hidden sm:inline">{platformLabel(p._accountPlatform)}</span>
                <span>·</span>
                <span className="hidden md:inline">{DAY_NAMES_ID[d.getDay()]} {d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="md:hidden">{relativeTime(p.createTime, now)}</span>
                <span className="hidden md:inline text-accent-primary font-medium">{relativeTime(p.createTime, now)}</span>
              </div>
              <div className="text-sm text-text-secondary line-clamp-1 mt-0.5">{p.caption || '(tanpa caption)'}</div>
              <div className="flex items-center gap-3 mt-1 text-[11px] text-text-muted tabular-nums">
                <span><Eye className="w-3 h-3 inline" /> {formatNumber(p.viewCount ?? 0)}</span>
                <span><Heart className="w-3 h-3 inline" /> {formatNumber(p.likeCount ?? 0)}</span>
                <span><MessageCircle className="w-3 h-3 inline" /> {formatNumber(p.commentCount ?? 0)}</span>
                <span className="ml-auto text-[10px] uppercase tracking-wider">{p.mediaType}</span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
