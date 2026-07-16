// AccountHealthGrid — 9 cards with health score badge + mini sparkline.
// Uses real profile photos via Worker /avatar proxy. No letter fallback.
import { Link } from 'react-router-dom';
import { Instagram, Heart, Eye } from 'lucide-react';
import { formatNumber, formatPercent } from '../lib/format.js';
import { performanceByMonth } from '../lib/analytics.js';
import { proxiedImage } from '../lib/imageProxy.js';

const GRADE_COLORS = {
  A: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30',
  B: 'bg-sky-500/20 text-sky-500 border-sky-500/30',
  C: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
  D: 'bg-orange-500/20 text-orange-500 border-orange-500/30',
  E: 'bg-rose-500/20 text-rose-500 border-rose-500/30'
};

function TtIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.62a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.05Z" />
    </svg>
  );
}

function AccountAvatar({ account }) {
  const isIG = account.platform === 'instagram';
  const PlatformIcon = isIG ? Instagram : TtIcon;
  if (!account.avatarUrl) {
    return (
      <div
        className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
          isIG ? 'bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500' : 'bg-black'
        }`}
      >
        <PlatformIcon className="w-5 h-5 text-white" />
      </div>
    );
  }
  return (
    <img
      src={proxiedImage(account.avatarUrl, 80)}
      alt={`@${account.username}`}
      loading="lazy"
      onError={(e) => {
        // Replace with brand icon tile on load failure
        const fallback = document.createElement('div');
        fallback.className = `flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
          isIG ? 'bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500' : 'bg-black'
        }`;
        const icon = document.createElement('span');
        icon.className = 'text-white';
        icon.innerHTML = isIG
          ? '<svg viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5"><path d="M12 2.16c3.2 0 3.58 0 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s0 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58 0-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.72 3.72 0 0 1-1.38-.9 3.72 3.72 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.16 15.58 2.16 15.2 2.16 12s0-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.16 8.8 2.16 12 2.16M12 0C8.74 0 8.33 0 7.05.07 5.78.13 4.9.33 4.14.63a5.86 5.86 0 0 0-2.13 1.38A5.86 5.86 0 0 0 .63 4.14c-.3.76-.5 1.64-.56 2.91C0 8.33 0 8.74 0 12s0 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.32.79.74 1.46 1.38 2.13a5.86 5.86 0 0 0 2.13 1.38c.76.3 1.64.5 2.91.56C8.33 24 8.74 24 12 24s3.67 0 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.86 5.86 0 0 0 2.13-1.38 5.86 5.86 0 0 0 1.38-2.13c.3-.76.5-1.64.56-2.91C24 15.67 24 15.26 24 12s0-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.86 5.86 0 0 0-1.38-2.13A5.86 5.86 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67 0 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.41-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.62a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.05Z"/></svg>';
        fallback.appendChild(icon);
        e.currentTarget.parentNode.replaceChild(fallback, e.currentTarget);
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

export function AccountHealthGrid({ accounts, comparison }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {comparison.map((acc) => {
        const health = {
          score: acc.healthScore ?? 0,
          grade: acc.healthGrade ?? 'E'
        };
        // Build 3-month ER sparkline
        const posts = acc.posts ?? acc.postCount ? accounts.find((a) => a.slug === acc.slug)?.posts ?? [] : [];
        const monthly = performanceByMonth(posts, acc.followerCount ?? 0).slice(-3).map((m) => m.er);
        return (
          <Link
            key={acc.slug}
            to={`/account/${acc.slug}`}
            className="surface p-4 hover:border-border-default transition-all"
          >
            <div className="flex items-center gap-3">
              <AccountAvatar account={acc} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-text-primary truncate">@{acc.username}</div>
                <div className="text-[10px] text-text-muted uppercase tracking-wider">
                  {acc.platform === 'instagram' ? 'IG' : 'TT'} · {formatNumber(acc.followerCount)} pengikut
                </div>
              </div>
              <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm border ${GRADE_COLORS[health.grade]}`}>
                {health.grade}
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
                <div className="font-semibold text-text-primary tabular-nums">{acc.postsPerWeek}</div>
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
      })}
    </div>
  );
}
