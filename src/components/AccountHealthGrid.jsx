// AccountHealthGrid — 9 cards grouped by platform (IG first, then TT), each
// with health score breakdown (engagement, consistency, growth, diversity).
// Uses real profile photos via Worker /avatar proxy; falls back to PlatformIcon
// (no letter "E" — that was the V10 bug). The Grade badge uses color-coded
// background, not a giant letter tile.
import { Link } from 'react-router-dom';
import { Heart, Eye, MessageCircle, Share2 } from 'lucide-react';
import { formatNumber, formatPercent } from '../lib/format.js';
import { performanceByMonth } from '../lib/analytics.js';
import { proxiedImage } from '../lib/imageProxy.js';
import { PlatformIcon, platformLabel } from './icons/PlatformIcon.jsx';

const GRADE_COLORS = {
  A: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30',
  B: 'bg-sky-500/20 text-sky-500 border-sky-500/30',
  C: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
  D: 'bg-orange-500/20 text-orange-500 border-orange-500/30',
  E: 'bg-rose-500/20 text-rose-500 border-rose-500/30'
};

function AccountAvatar({ account }) {
  if (!account.avatarUrl) {
    return (
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-bg-tertiary flex items-center justify-center border border-border-subtle">
        <PlatformIcon platform={account.platform} className="w-5 h-5" />
      </div>
    );
  }
  return (
    <img
      src={proxiedImage(account.avatarUrl, 80)}
      alt={`@${account.username}`}
      loading="lazy"
      onError={(e) => {
        // Replace with brand icon tile on load failure — never a letter.
        const fallback = document.createElement('div');
        fallback.className = 'flex-shrink-0 w-10 h-10 rounded-full bg-bg-tertiary flex items-center justify-center border border-border-subtle';
        const wrapper = document.createElement('div');
        wrapper.className = 'w-5 h-5';
        wrapper.innerHTML = account.platform === 'tiktok'
          ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.62a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.05Z"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.74 3.74 0 0 1-1.38-.9 3.74 3.74 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.21 15.58 2.2 15.2 2.2 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.21 8.8 2.2 12 2.2Zm0 1.8c-3.15 0-3.5.01-4.74.07-1.07.05-1.65.23-2.04.38-.51.2-.88.44-1.27.83-.39.39-.63.76-.83 1.27-.15.39-.33.97-.38 2.04C2.68 8.5 2.67 8.85 2.67 12s.01 3.5.07 4.74c.05 1.07.23 1.65.38 2.04.2.51.44.88.83 1.27.39.39.76.63 1.27.83.39.15.97.33 2.04.38 1.24.06 1.59.07 4.74.07s3.5-.01 4.74-.07c1.07-.05 1.65-.23 2.04-.38.51-.2.88-.44 1.27-.83.39-.39.63-.76.83-1.27.15-.39.33-.97.38-2.04.06-1.24.07-1.59.07-4.74s-.01-3.5-.07-4.74c-.05-1.07-.23-1.65-.38-2.04a3.42 3.42 0 0 0-.83-1.27 3.42 3.42 0 0 0-1.27-.83c-.39-.15-.97-.33-2.04-.38C15.5 4.01 15.15 4 12 4Zm0 3.07A4.93 4.93 0 1 1 7.07 12 4.93 4.93 0 0 1 12 7.07Z"/></svg>';
        fallback.appendChild(wrapper);
        if (e.currentTarget.parentNode) {
          e.currentTarget.parentNode.replaceChild(fallback, e.currentTarget);
        }
      }}
      className="flex-shrink-0 w-10 h-10 rounded-full object-cover bg-bg-tertiary"
    />
  );
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
      className="surface p-4 hover:border-border-default transition-all"
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
