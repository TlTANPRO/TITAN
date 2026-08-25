// CrossAccountTimeline — recharts ComposedChart: 9 lines, monthly avg ER / views
// Toggle: ER / Views / Posts / Likes — Date range: 30d / 90d / 6mo / 1y / all
import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { performanceByMonth } from '../lib/analytics.js';

// Mapping: UI metric label → performanceByMonth field.
// V10 had this as `key: 'er'` but performanceByMonth returns `avgEngagementRate`,
// so the chart was always empty. V11 maps each metric to its real field name.
const METRICS = {
  ER: { key: 'avgEngagementRate', label: 'Engagement Rate (%)', color: 'er' },
  likes: { key: 'avgLikeCount', label: 'Avg Likes', color: 'likes' },
  views: { key: 'avgViewCount', label: 'Avg Views', color: 'views' },
  posts: { key: 'postCount', label: 'Posts per Month', color: 'posts' }
};

const RANGES = {
  '30d': 30 * 86400,
  '90d': 90 * 86400,
  '6mo': 180 * 86400,
  '1y': 365 * 86400,
  all: null
};

// V24.2: oklch palette for 9 accounts
const COLORS = [
  'oklch(0.65 0.22 350)',  // pink
  'oklch(0.65 0.16 200)',  // cyan
  'oklch(0.58 0.22 280)',  // purple
  'oklch(0.75 0.16 75)',   // amber
  'oklch(0.65 0.16 160)',  // emerald
  'oklch(0.65 0.20 250)',  // blue
  'oklch(0.62 0.22 25)',   // red
  'oklch(0.65 0.16 195)',  // teal
  'oklch(0.68 0.18 50)'    // orange
];

function buildTimelineData(accounts, metric, rangeSec) {
  const now = Date.now() / 1000;
  const cutoff = rangeSec ? now - rangeSec : 0;

  // Build per-account per-month series
  const perAccount = accounts.map((acc) => {
    // Filter by createTime (seconds) for the date range — keeps posts inside the window.
    // performanceByMonth reads `p.timestamp` (ms) so we also set it from createTime.
    const filtered = (acc.posts ?? []).filter((p) => p.createTime >= cutoff).map((p) => ({
      ...p,
      timestamp: p.timestamp ?? p.createTime * 1000
    }));
    const perf = performanceByMonth(filtered, acc.followerCount ?? 0);
    return { slug: acc.slug, username: acc.username, platform: acc.platform, data: perf };
  });

  // Union of all month keys
  const allMonths = new Set();
  for (const a of perAccount) {
    for (const p of a.data) allMonths.add(p.month);
  }
  const sortedMonths = [...allMonths].sort();
  if (sortedMonths.length === 0) return { data: [], perAccount };

  // Build rows: each row = { month, accSlug: value }
  // CRITICAL: coerce to finite number — null/undefined/NaN from performanceByMonth
  // would propagate as <polyline points="0,NaN"> and crash the chart
  const data = sortedMonths.map((month) => {
    const row = { month };
    for (const a of perAccount) {
      const m = a.data.find((x) => x.month === month);
      const raw = m?.[METRICS[metric].key];
      const v = Number.isFinite(raw) ? raw : 0;
      row[a.slug] = Math.round(v * 100) / 100;
    }
    return row;
  });
  return { data, perAccount };
}

export function CrossAccountTimeline({ accounts }) {
  const [metric, setMetric] = useState('ER');
  const [range, setRange] = useState('6mo');

  const { data, perAccount } = useMemo(
    () => buildTimelineData(accounts, metric, RANGES[range]),
    [accounts, metric, range]
  );

  // V33.1: detect IG accounts with no posts in the latest month — explain
  // the gap inline so a single flat 0-line on the chart is not mistaken
  // for a dashboard bug. Looks at the post populate timestamp directly
  // from the input accounts (performanceByMonth does not preserve posts).
  const igStaleInfo = useMemo(() => {
    if (data.length === 0) return null;
    const latestMonth = data[data.length - 1].month;
    const igAccounts = perAccount.filter((a) => a.platform === 'instagram');
    if (igAccounts.length === 0) return null;
    const staleness = igAccounts.map((a) => {
      const monthData = a.data.find((m) => m.month === latestMonth);
      const raw = monthData?.[METRICS[metric].key];
      const noData = !Number.isFinite(raw) || raw === 0;
      const acc = accounts.find((x) => x.slug === a.slug);
      const tsList = (acc?.posts ?? [])
        .map((p) => p.timestamp ?? p.createTime * 1000)
        .filter((t) => t > 0)
        .sort((x, y) => y - x);
      const lastPost = tsList[0] ?? null;
      return { slug: a.slug, username: a.username, noData, lastPost };
    });
    const staleCount = staleness.filter((s) => s.noData).length;
    if (staleCount === 0) return null;
    const oldestLastPost = staleness
      .filter((s) => s.noData && s.lastPost)
      .map((s) => s.lastPost)
      .sort((x, y) => x - y)[0] ?? null;
    return { staleCount, igCount: igAccounts.length, lastPost: oldestLastPost };
  }, [data, perAccount, metric, accounts]);

  if (data.length === 0) {
    return (
      <div className="surface p-6 text-center text-text-muted text-sm">
        <BarChart3 className="w-5 h-5 mx-auto mb-2 opacity-50" />
        Belum ada data time-series untuk rentang ini.
        <div className="text-xs mt-1">Coba rentang lebih panjang (1y) atau periksa apakah data IG sudah di-enrich.</div>
      </div>
    );
  }

  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-accent-primary" />
          Tren Bulanan Lintas Akun
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-bg-tertiary rounded p-0.5">
            {Object.keys(METRICS).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded font-medium transition-colors ${metric === m ? 'bg-accent-primary text-[#0b1220]' : 'text-text-muted hover:text-text-primary'}`}
              >
                {m === 'ER' ? 'ER' : m}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-bg-tertiary rounded p-0.5">
            {Object.keys(RANGES).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`text-[10px] px-2 py-1 rounded font-medium transition-colors ${range === r ? 'bg-accent-primary text-[#0b1220]' : 'text-text-muted hover:text-text-primary'}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.4} />
          <XAxis dataKey="month" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
          <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} domain={['auto', 'auto']} allowDataOverflow={false} />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: 'var(--text-primary)' }}
          />
          <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
          {perAccount.map((a, i) => (
            <Line
              key={a.slug}
              type="monotone"
              dataKey={a.slug}
              name={a.username}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {igStaleInfo && (
        <div className="text-[10px] text-text-muted mt-3 text-center">
          {igStaleInfo.staleCount}/{igStaleInfo.igCount} akun IG belum punya post di bulan {
            data[data.length - 1].month
          }{
            igStaleInfo.lastPost
              ? ` · post IG terakhir ${new Date(igStaleInfo.lastPost).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })}`
              : ''
          }
        </div>
      )}
    </div>
  );
}
