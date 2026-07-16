// CompetitorWatch — 5-8 similar accounts (from curated list) + radar compare
import { useMemo } from 'react';
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend
} from 'recharts';
import { Users, TrendingUp, AlertCircle } from 'lucide-react';
import { formatNumber, formatPercent } from '../lib/format.js';
import { competitorGap } from '../lib/analytics.js';
import { COMPETITORS } from '../data/competitors.js';

function buildRadarData(myAcc, peer) {
  // 5 dimensi: followers (log), avg likes, avg views, ER, posts/week
  // Normalize to 0-100 by using platform benchmarks
  const f = (val, max) => Math.min(100, (val / max) * 100);
  return [
    { metric: 'Pengikut', mine: f(Math.log10((myAcc.followerCount ?? 0) + 1), Math.log10(100000)), peer: f(Math.log10((peer.followerCount ?? 0) + 1), Math.log10(100000)) },
    { metric: 'Avg Likes', mine: f(myAcc.avgLikes ?? 0, 5000), peer: f(peer.avgLikes ?? 0, 5000) },
    { metric: 'Avg Views', mine: f(myAcc.avgViews ?? 0, 100000), peer: f(peer.avgViews ?? 0, 100000) },
    { metric: 'ER', mine: f((myAcc.engagementRate ?? 0) * 10, 100), peer: f((peer.engagementRate ?? 0) * 10, 100) },
    { metric: 'Posts/Mgu', mine: f((myAcc.postsPerWeek ?? 0) * 10, 100), peer: f((peer.postsPerWeek ?? 0) * 10, 100) }
  ];
}

export function CompetitorWatch({ account }) {
  const peerList = useMemo(() => COMPETITORS.filter((p) => p.platform === account?.platform), [account]);

  if (peerList.length === 0) {
    return (
      <div className="surface p-5">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-2">
          <Users className="w-4 h-4 text-accent-secondary" />
          Pantauan Kompetitor
        </h3>
        <p className="text-sm text-text-muted flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          Daftar kompetitor untuk platform ini belum dikurasi. Edit file <code className="bg-bg-tertiary px-1 rounded text-xs">src/data/competitors.js</code>.
        </p>
      </div>
    );
  }

  // Find nearest peer by follower count for radar
  const sorted = [...peerList].sort((a, b) => Math.abs(a.followerCount - (account?.followerCount ?? 0)) - Math.abs(b.followerCount - (account?.followerCount ?? 0)));
  const primary = sorted[0];
  const radarData = buildRadarData(account ?? {}, primary);
  const gap = competitorGap({
    engagementRate: account?.engagementRate,
    avgLikes: account?.avgLikes,
    avgViews: account?.avgViews,
    postsPerWeek: account?.postsPerWeek
  }, peerList);

  return (
    <div className="surface p-5">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
        <Users className="w-4 h-4 text-accent-secondary" />
        Pantauan Kompetitor ({peerList.length} akun sejenis)
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Radar */}
        <div>
          <div className="text-xs text-text-muted mb-2">Radar vs @{primary.username} (akun dengan pengikut terdekat)</div>
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={radarData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <PolarGrid stroke="var(--border-subtle)" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
              <PolarRadiusAxis tick={{ fontSize: 8 }} stroke="var(--border-subtle)" />
              <Radar name="Anda" dataKey="mine" stroke="#ec4899" fill="#ec4899" fillOpacity={0.4} />
              <Radar name={primary.username} dataKey="peer" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.2} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Gap summary */}
        <div>
          <div className="text-xs text-text-muted mb-2">Gap vs Rata-rata Peer</div>
          <div className="space-y-2">
            <GapRow label="ER" mine={account?.engagementRate} peer={gap.peerMedian?.er} fmt={formatPercent} />
            <GapRow label="Avg Likes" mine={account?.avgLikes} peer={gap.peerMedian?.likes} fmt={formatNumber} />
            <GapRow label="Avg Views" mine={account?.avgViews} peer={gap.peerMedian?.views} fmt={formatNumber} />
            <GapRow label="Posts/Mgu" mine={account?.postsPerWeek} peer={gap.peerMedian?.postsPerWeek} fmt={(v) => v.toFixed(1)} />
          </div>
        </div>

        {/* Peer table */}
        <div>
          <div className="text-xs text-text-muted mb-2">Semua Peer</div>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {peerList.map((p) => (
              <div key={p.handle} className="flex items-center gap-2 text-xs">
                <span className="text-text-muted w-6">{p.platform === 'instagram' ? 'IG' : 'TT'}</span>
                <a href={`https://${p.platform === 'instagram' ? 'www.instagram.com' : 'www.tiktok.com'}/@${p.handle}`} target="_blank" rel="noopener noreferrer" className="font-medium text-text-primary hover:text-accent-primary flex-1 truncate">@{p.handle}</a>
                <span className="text-text-muted tabular-nums">{formatNumber(p.followerCount)}</span>
                <span className={`tabular-nums font-semibold ${p.engagementRate > 3 ? 'text-accent-success' : p.engagementRate > 1 ? 'text-text-secondary' : 'text-text-muted'}`}>
                  {formatPercent(p.engagementRate)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function GapRow({ label, mine, peer, fmt }) {
  const diff = (mine ?? 0) - (peer ?? 0);
  const positive = diff > 0;
  return (
    <div className="flex items-center gap-2 text-sm surface p-2 bg-bg-tertiary/30">
      <span className="text-text-secondary text-xs w-20">{label}</span>
      <span className="font-bold text-text-primary tabular-nums flex-1 text-right">{mine != null ? fmt(mine) : '—'}</span>
      <span className={`text-xs font-semibold tabular-nums w-16 text-right ${positive ? 'text-accent-success' : diff < 0 ? 'text-accent-danger' : 'text-text-muted'}`}>
        {positive ? '↑' : diff < 0 ? '↓' : '→'} {fmt(Math.abs(diff))}
      </span>
      <span className="text-text-muted text-xs tabular-nums w-16 text-right">vs {fmt(peer ?? 0)}</span>
    </div>
  );
}
