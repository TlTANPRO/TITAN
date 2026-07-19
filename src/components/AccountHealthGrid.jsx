// AccountHealthGrid — 9 cards grouped by platform (IG first, then TT), each
// with health score breakdown (engagement, consistency, growth, diversity).
// Uses <ProxiedAvatar> for profile photos (browser-direct for IG/TT Akamai
// CDN, Worker /avatar for other). On load failure, falls back to brand-icon
// tile (no letter "E" — that was the V10 bug). Grade badge uses color-coded
// background, not a giant letter tile.
import { Link } from 'react-router-dom';
import { Heart, Eye, MessageCircle, Share2 } from 'lucide-react';
import { formatNumber, formatPercent } from '../lib/format.js';
import { performanceByMonth } from '../lib/analytics.js';
import { ProxiedAvatar } from './ProxiedAvatar.jsx';
import { PlatformIcon, platformLabel } from './icons/PlatformIcon.jsx';

const GRADE_COLORS = {
  A: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30',
  B: 'bg-sky-500/20 text-sky-500 border-sky-500/30',
  C: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
  D: 'bg-orange-500/20 text-orange-500 border-orange-500/30',
  E: 'bg-rose-500/20 text-rose-500 border-rose-500/30'
};

function AccountAvatar({ account }) {
  return <ProxiedAvatar account={account} size={40} className="" />;
}

function MiniSparkline({ data, color = 'var(--accent-primary)' }) {
  // CRITICAL: coerce every value to finite number — null/undefined/NaN from
  // performanceByMonth would propagate as <polyline points="0,NaN"> and crash
  const safe = (data ?? []).map((v) => Number.isFinite(v) ? v : 0);
  if (safe.length < 2) return null;
  const max = Math.max(...safe, 1);
  const min = Math.min(...safe, 0);
  const range = max - min || 1;
  const points = safe.map((v, i) => {
    const x = (i / (safe.length - 1)) * 60;
    const y = 20 - ((v - min) / range) * 20;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width="60" height="22" className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HealthCard({ acc, posts }) {
  const score = Number.isFinite(acc.healthScore) ? acc.healthScore : 0;
  const grade = acc.healthGrade ?? 'E';
  const breakdown = acc.healthBreakdown ?? { engagement: 0, consistency: 0, growth: 0, diversity: 0 };
  const monthly = performanceByMonth(posts ?? [], acc.followerCount ?? 0)
    .slice(-3)
    .map((m) => m.avgEngagementRate);
  return (
    <Link
      to={`/account/${acc.slug}`}
      aria-label={`Lihat detail akun @${acc.username}, health score ${score} dari 100, grade ${grade}`}
      className="surface p-4 hover:border-border-default transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
    >
      <div className="flex items-center gap-3">
        <AccountAvatar account={acc} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-text-primary truncate">@{acc.username}</div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider">
            {formatNumber(acc.followerCount)} pengikut
          </div>
        </div>
        <div
          className={`flex-shrink-0 px-2 py-1 rounded-md flex items-center gap-1 text-xs font-bold border ${GRADE_COLORS[grade]}`}
          title={`Health ${score}/100`}
        >
          <span>{grade}</span>
          <span className="font-normal text-[10px] opacity-75">{score}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <div className="text-text-muted">ER</div>
          <div className="font-semibold text-text-primary tabular-nums">
            {acc.hasER ? formatPercent(acc.engagementRate) : '—'}
          </div>
        </div>
        <div>
          <div className="text-text-muted">Avg Likes</div>
          <div className="font-semibold text-text-primary tabular-nums">{formatNumber(acc.avgLikes)}</div>
        </div>
        <div>
          <div className="text-text-muted">Posts/Mgu</div>
          <div className="font-semibold text-text-primary tabular-nums">{acc.postsPerWeek ?? 0}</div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1.5 text-[10px] text-text-muted">
        <div className="flex items-center gap-0.5" title="Engagement">
          <Heart className="w-2.5 h-2.5" />
          <span className="tabular-nums text-text-secondary font-medium">{breakdown.engagement}</span>
        </div>
        <div className="flex items-center gap-0.5" title="Consistency">
          <Share2 className="w-2.5 h-2.5" />
          <span className="tabular-nums text-text-secondary font-medium">{breakdown.consistency}</span>
        </div>
        <div className="flex items-center gap-0.5" title="Growth">
          <Eye className="w-2.5 h-2.5" />
          <span className="tabular-nums text-text-secondary font-medium">{breakdown.growth}</span>
        </div>
        <div className="flex items-center gap-0.5" title="Diversity">
          <MessageCircle className="w-2.5 h-2.5" />
          <span className="tabular-nums text-text-secondary font-medium">{breakdown.diversity}</span>
        </div>
      </div>

      {monthly.length >= 2 && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">3-mo ER trend</span>
          <MiniSparkline data={monthly} />
        </div>
      )}
    </Link>
  );
}

function PlatformGroup({ platform, accounts, fullAccounts }) {
  const list = accounts.filter((a) => (a.platform ?? (platform === 'tiktok' ? 'tiktok' : 'instagram')) === platform);
  if (list.length === 0) return null;
  return (
    <div className="mb-6 last:mb-0">
      <div className="flex items-center gap-2 mb-3">
        <PlatformIcon platform={platform} className="w-5 h-5" />
        <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
          {platformLabel(platform)}
        </h3>
        <span className="text-xs text-text-muted">· {list.length} akun</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.map((acc) => {
          const fullAcc = fullAccounts.find((a) => a.slug === acc.slug);
          return <HealthCard key={acc.slug} acc={acc} posts={fullAcc?.posts ?? []} />;
        })}
      </div>
    </div>
  );
}

export function AccountHealthGrid({ accounts, comparison }) {
  return (
    <div>
      <PlatformGroup platform="instagram" accounts={comparison} fullAccounts={accounts} />
      <PlatformGroup platform="tiktok" accounts={comparison} fullAccounts={accounts} />
    </div>
  );
}
