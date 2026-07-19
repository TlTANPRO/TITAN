// CompetitorWatch — 5-8 similar accounts (from curated list) + radar compare
// V11: radar uses log-scaled followers (so 100k vs 5k not 1-point) + each axis
// capped to peer range so outliers don't squash other dims. postsPerWeek falls
// back to NaN-safe "—" when undefined.
import { useMemo } from 'react';
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend
} from 'recharts';
import { Users, TrendingUp, AlertCircle } from 'lucide-react';
import { formatNumber, formatPercent } from '../lib/format.js';
import { competitorGap } from '../lib/analytics.js';
import { COMPETITORS } from '../data/competitors.js';
import { PlatformIcon, platformLabel } from './icons/PlatformIcon.jsx';

// V11: normalize per-axis by the maximum seen in (mine, peer) so both values
// share the same scale and one big outlier doesn't crush the rest. log-scale
// for follower count, linear for the others.
function axisScore(val, max) {
  if (!Number.isFinite(val) || val <= 0 || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(100, (val / max) * 100);
}
function logAxisScore(val, max) {
  if (!Number.isFinite(val) || val <= 0) return 0;
  const lv = Math.log10(val + 1);
  const lm = max > 0 ? Math.log10(max + 1) : 1;
  return Math.min(100, (lv / lm) * 100);
}

function buildRadarData(myAcc, peer) {
  const followers = [myAcc.followerCount ?? 0, peer.followerCount ?? 0];
  const likes = [myAcc.avgLikes ?? 0, peer.avgLikes ?? 0];
  const views = [myAcc.avgViews ?? 0, peer.avgViews ?? 0];
  const ers = [
    (myAcc.engagementRate ?? 0) * 100,
    (peer.engagementRate ?? 0) * 100
  ];
  const ppw = [myAcc.postsPerWeek ?? 0, peer.postsPerWeek ?? 0];

  const maxFollowers = Math.max(...followers);
  const maxLikes = Math.max(...likes);
  const maxViews = Math.max(...views);
  const maxER = Math.max(...ers, 5); // baseline 5 so ER < 5% still readable
  const maxPPW = Math.max(...ppw, 7);

  return [
    { metric: 'Pengikut', mine: logAxisScore(followers[0], maxFollowers), peer: logAxisScore(followers[1], maxFollowers) },
    { metric: 'Avg Likes', mine: axisScore(likes[0], maxLikes), peer: axisScore(likes[1], maxLikes) },
    { metric: 'Avg Views', mine: axisScore(views[0], maxViews), peer: axisScore(views[1], maxViews) },
    { metric: 'ER', mine: axisScore(ers[0], maxER), peer: axisScore(ers[1], maxER) },
    { metric: 'Posts/Mgu', mine: axisScore(ppw[0], maxPPW), peer: axisScore(ppw[1], maxPPW) }
  ];
}

export function CompetitorWatch({ account }) {
  const peerList = useMemo(
    () => COMPETITORS.filter((p) => p.platform === account?.platform),
    [account]
  );

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
  const sorted = [...peerList].sort(
    (a, b) =>
      Math.abs((a.followerCount ?? 0) - (account?.followerCount ?? 0)) -
      Math.abs((b.followerCount ?? 0) - (account?.followerCount ?? 0))
  );
  const primary = sorted[0];
  const radarData = buildRadarData(account ?? {}, primary);
  const gap = competitorGap(
    {
      engagementRate: account?.engagementRate,
      avgLikes: account?.avgLikes,
      avgViews: account?.avgViews,
      postsPerWeek: account?.postsPerWeek
    },
    peerList
  );

  // NaN-safe postsPerWeek display
  const ppwMine = Number.isFinite(account?.postsPerWeek) ? account.postsPerWeek : null;
  const ppwPeer = Number.isFinite(gap.peerMedian?.postsPerWeek) ? gap.peerMedian.postsPerWeek : null;

  return (
    <div className="surface p-5">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
        <Users className="w-4 h-4 text-accent-secondary" />
        Pantauan Kompetitor ({peerList.length} akun sejenis · {platformLabel(account?.platform)})
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Radar */}
        <div>
          <div className="text-xs text-text-muted mb-2 flex items-center gap-1.5">
            <PlatformIcon platform={account?.platform} className="w-3 h-3" />
            Radar vs @{primary.username} (akun dengan pengikut terdekat)
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={radarData} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
              <PolarGrid stroke="var(--border-subtle)" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
              <PolarRadiusAxis tick={{ fontSize: 8 }} stroke="var(--border-subtle)" domain={[0, 100]} />
              <Radar name="Anda" dataKey="mine" stroke="oklch(0.65 0.22 350)" fill="oklch(0.65 0.22 350)" fillOpacity={0.4} />
              <Radar name={primary.username} dataKey="peer" stroke="oklch(0.65 0.16 200)" fill="oklch(0.65 0.16 200)" fillOpacity={0.2} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </RadarChart>
          </ResponsiveContainer>
          <div className="text-[10px] text-text-muted mt-1 italic">
            Skala per-axis: pengikut log-scale, sisanya linear (dinormalisasi ke peer terdekat).
          </div>
        </div>

        {/* Gap summary */}
        <div>
          <div className="text-xs text-text-muted mb-2">Gap vs Rata-rata Peer</div>
          <div className="space-y-2">
            <GapRow label="ER" mine={account?.engagementRate} peer={gap.peerMedian?.er} fmt={formatPercent} />
            <GapRow label="Avg Likes" mine={account?.avgLikes} peer={gap.peerMedian?.likes} fmt={formatNumber} />
            <GapRow label="Avg Views" mine={account?.avgViews} peer={gap.peerMedian?.views} fmt={formatNumber} />
            <GapRow
              label="Posts/Mgu"
              mine={ppwMine}
              peer={ppwPeer}
              fmt={(v) => (Number.isFinite(v) ? v.toFixed(1) : '—')}
            />
          </div>
        </div>

        {/* Peer table */}
        <div>
          <div className="text-xs text-text-muted mb-2">Semua Peer</div>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {peerList.map((p) => (
              <div key={p.handle} className="flex items-center gap-2 text-xs">
                <PlatformIcon platform={p.platform} className="w-3 h-3 flex-shrink-0" />
                <a
                  href={`https://${p.platform === 'instagram' ? 'www.instagram.com' : 'www.tiktok.com'}/@${p.handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-text-primary hover:text-accent-primary flex-1 truncate"
                >
                  @{p.handle}
                </a>
                <span className="text-text-muted tabular-nums">{formatNumber(p.followerCount)}</span>
                <span
                  className={`tabular-nums font-semibold ${
                    p.engagementRate > 3 ? 'text-accent-success' : p.engagementRate > 1 ? 'text-text-secondary' : 'text-text-muted'
                  }`}
                >
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
  const safeMine = Number.isFinite(mine) ? mine : null;
  const safePeer = Number.isFinite(peer) ? peer : null;
  const diff = safeMine != null && safePeer != null ? safeMine - safePeer : 0;
  const positive = diff > 0;
  return (
    <div className="flex items-center gap-2 text-sm surface p-2 bg-bg-tertiary/30">
      <span className="text-text-secondary text-xs w-20">{label}</span>
      <span className="font-bold text-text-primary tabular-nums flex-1 text-right">
        {safeMine != null ? fmt(safeMine) : '—'}
      </span>
      <span
        className={`text-xs font-semibold tabular-nums w-16 text-right ${
          positive ? 'text-accent-success' : diff < 0 ? 'text-accent-danger' : 'text-text-muted'
        }`}
      >
        {safeMine == null || safePeer == null
          ? '—'
          : positive
          ? '↑'
          : diff < 0
          ? '↓'
          : '→'}{' '}
        {safeMine != null && safePeer != null ? fmt(Math.abs(diff)) : ''}
      </span>
      <span className="text-text-muted text-xs tabular-nums w-16 text-right">
        vs {safePeer != null ? fmt(safePeer) : '—'}
      </span>
    </div>
  );
}
