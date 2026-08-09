// /admin — Per-admin post tracking via hashtag markers.
//
// Maps each admin display name to a hashtag (#AgustusRE → Reni, etc.) and
// surfaces every post that carries that hashtag in a single unified table
// + per-admin summary, daily growth, and ranking. Single source of truth
// for the mapping lives in src/lib/adminHashtags.js.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Heart, MessageCircle, Eye, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown,
  TrendingUp, Trophy, BarChart3
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import { useAccounts } from '../hooks/useAccount.js';
import { ProxiedAvatar } from '../components/ProxiedAvatar.jsx';
import { PlatformIcon, platformLabel } from '../components/icons/PlatformIcon.jsx';
import { getAdminSummary } from '../lib/adminHashtags.js';
import { formatNumber, formatDate } from '../lib/format.js';

// Responsive column visibility — same pattern as EnhancedTable so mobile
// users keep the essential columns visible.
const COL_RESPONSIVE = {
  always: '',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell'
};

// Stable initials per admin for the summary card avatar.
function adminInitials(name) {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// 4 distinct accent colors. Julian moved from secondary (purple) to
// instagram (pink) so he's visually distinct from Reni/Rifqi/Reta.
const ADMIN_ACCENTS = [
  { ring: 'ring-accent-primary',   text: 'text-accent-primary',   chip: 'bg-accent-primary/10 text-accent-primary border-accent-primary/30',   hex: '#3b82f6', bar: 'bg-accent-primary' },
  { ring: 'ring-accent-success',   text: 'text-accent-success',   chip: 'bg-accent-success/10 text-accent-success border-accent-success/30',   hex: '#10b981', bar: 'bg-accent-success' },
  { ring: 'ring-accent-warning',   text: 'text-accent-warning',   chip: 'bg-accent-warning/10 text-accent-warning border-accent-warning/30',   hex: '#f59e0b', bar: 'bg-accent-warning' },
  { ring: 'ring-accent-instagram', text: 'text-accent-instagram', chip: 'bg-accent-instagram/10 text-accent-instagram border-accent-instagram/30', hex: '#E1306C', bar: 'bg-accent-instagram' }
];

function SortIcon({ active, dir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-accent-primary" /> : <ArrowDown className="w-3 h-3 text-accent-primary" />;
}

// Hero KPI tile — large display number + colored icon + uppercase label.
// Inspired by the design canon (display typography + single accent per tile).
const KPI_TONE = {
  primary:   { text: 'text-accent-primary',   bar: 'bg-accent-primary',   iconBg: 'bg-accent-primary/10' },
  success:   { text: 'text-accent-success',   bar: 'bg-accent-success',   iconBg: 'bg-accent-success/10' },
  warning:   { text: 'text-accent-warning',   bar: 'bg-accent-warning',   iconBg: 'bg-accent-warning/10' },
  danger:    { text: 'text-accent-danger',    bar: 'bg-accent-danger',    iconBg: 'bg-accent-danger/10' },
  instagram: { text: 'text-accent-instagram', bar: 'bg-accent-instagram', iconBg: 'bg-accent-instagram/10' }
};

function KpiTile({ icon, label, value, accent = 'primary' }) {
  const tone = KPI_TONE[accent] ?? KPI_TONE.primary;
  return (
    <div className="relative surface p-4 overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${tone.bar}`} aria-hidden="true" />
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md ${tone.iconBg} ${tone.text}`}>
          {icon}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">{label}</span>
      </div>
      <div className="text-display-lg text-text-primary tabular-nums leading-none">{formatNumber(value)}</div>
    </div>
  );
}

// Tiny inline-SVG sparkline — no recharts overhead, used inside admin cards.
// `data` is a flat number array. Renders a path + filled area underneath.
function Sparkline({ data, color, width = 80, height = 24 }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(1, ...data);
  const step = data.length > 1 ? width / (data.length - 1) : 0;
  const points = data.map((v, i) => {
    const x = i * step;
    const y = height - (v / max) * (height - 4) - 2;
    return [x, y];
  });
  const linePath = points.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
  const baseline = points.length === 1 ? `M 0 ${points[0][1]} L ${width} ${points[0][1]}` : linePath;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={areaPath} fill={color} opacity="0.12" />
      <path d={baseline} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={i === points.length - 1 ? 2.5 : 0} fill={color} />
      ))}
    </svg>
  );
}

// Build per-day aggregates across all admin posts (combined timeline).
// Returns sorted array of { day: 'YYYY-MM-DD', total: N, perAdmin: { name: N } }.
function buildDailyTotals(rows) {
  const byDay = new Map();
  const adminNames = new Set();
  for (const p of rows) {
    if (!p.createTime) continue;
    const day = new Date(p.createTime > 1e12 ? p.createTime : p.createTime * 1000)
      .toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, { day, total: 0 });
    const slot = byDay.get(day);
    slot.total += 1;
    slot[p._admin.name] = (slot[p._admin.name] ?? 0) + 1;
    adminNames.add(p._admin.name);
  }
  return {
    data: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
    adminNames: [...adminNames]
  };
}

// Build a sparkline series for one admin — last `days` days of post counts.
// Empty days left as null so recharts skips the dot instead of showing zero.
function buildSparkline(posts, days = 7) {
  const nowSec = Date.now() / 1000;
  const cutoff = nowSec - days * 86400;
  // Bucket 0..days-1 from oldest to newest.
  const counts = new Array(days).fill(0);
  for (const p of posts) {
    if (!p.createTime) continue;
    const ageSec = nowSec - p.createTime;
    if (ageSec < 0 || ageSec > days * 86400) continue;
    const idx = days - 1 - Math.floor(ageSec / 86400);
    if (idx >= 0 && idx < days) counts[idx] += 1;
  }
  return counts;
}

// Build ranking rows for the Admin Ranking table.
// Sorted by `metric` desc, ties broken by postCount desc.
const RANK_METRICS = {
  postCount:     { label: 'Post',        better: 'more' },
  totalLikes:    { label: 'Suka',        better: 'more' },
  totalComments: { label: 'Komentar',    better: 'more' },
  totalViews:    { label: 'Views',       better: 'more' },
  avgLikes:      { label: 'Avg Suka',    better: 'more' },
  avgComments:   { label: 'Avg Komentar',better: 'more' },
  avgViews:      { label: 'Avg Views',   better: 'more' },
  er:            { label: 'ER %',        better: 'more' }
};

export default function Admin() {
  const accounts = useAccounts();
  const summary = useMemo(() => getAdminSummary(accounts), [accounts]);

  const allRows = useMemo(() => {
    const out = [];
    summary.forEach((admin, i) => {
      for (const p of admin.posts) {
        out.push({ ...p, _admin: admin, _adminIndex: i, _key: `${admin.name}-${p._accountSlug}-${p.id}` });
      }
    });
    out.sort((a, b) => (b.createTime ?? 0) - (a.createTime ?? 0));
    return out;
  }, [summary]);

  const dailyTotals = useMemo(() => buildDailyTotals(allRows), [allRows]);

  // Per-admin ranking — extend with derived avg metrics so ranking covers
  // both volume and quality.
  const rankingRows = useMemo(() => {
    const totalFollowers = accounts.reduce((s, a) => s + (a.account?.followerCount ?? a.followerCount ?? 0), 0);
    return summary.map((admin, i) => {
      const avgLikes = admin.postCount > 0 ? admin.totalLikes / admin.postCount : 0;
      const avgComments = admin.postCount > 0 ? admin.totalComments / admin.postCount : 0;
      const avgViews = admin.postCount > 0 ? admin.totalViews / admin.postCount : 0;
      // Admin ER = total engagement / total followers (cross-account denominator).
      const totalEng = admin.totalLikes + admin.totalComments;
      const er = totalFollowers > 0 ? (totalEng / totalFollowers) * 100 : 0;
      return {
        index: i,
        name: admin.name,
        postCount: admin.postCount,
        totalLikes: admin.totalLikes,
        totalComments: admin.totalComments,
        totalViews: admin.totalViews,
        avgLikes,
        avgComments,
        avgViews,
        er
      };
    });
  }, [summary, accounts]);

  // Filter + sort for the posts table.
  const [adminFilter, setAdminFilter] = useState('all');
  const [sortKey, setSortKey] = useState('createTime');
  const [sortDir, setSortDir] = useState('desc');
  const filteredRows = useMemo(() => {
    let r = adminFilter === 'all' ? allRows : allRows.filter((row) => row._admin.name === adminFilter);
    r = [...r].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return r;
  }, [allRows, adminFilter, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  // Sort ranking.
  const [rankMetric, setRankMetric] = useState('postCount');
  const sortedRanking = useMemo(() => {
    return [...rankingRows].sort((a, b) => {
      const av = a[rankMetric] ?? 0;
      const bv = b[rankMetric] ?? 0;
      return bv - av;
    });
  }, [rankingRows, rankMetric]);

  const totalAdminPosts = summary.reduce((s, a) => s + a.postCount, 0);
  const totalLikes = summary.reduce((s, a) => s + a.totalLikes, 0);
  const totalComments = summary.reduce((s, a) => s + a.totalComments, 0);
  const totalViews = summary.reduce((s, a) => s + a.totalViews, 0);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-semibold tracking-widest uppercase text-text-muted">Section 09</span>
          <span className="text-text-muted">·</span>
          <span className="text-[10px] text-text-muted uppercase tracking-wider">Admin Tracker</span>
        </div>
        <h1 className="text-2xl font-bold text-text-primary">Admin</h1>
      </div>

      {/* Hero KPI strip — 4 platform-style tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile icon={<TrendingUp className="w-3.5 h-3.5" />} label="Total Post" value={totalAdminPosts} accent="primary" />
        <KpiTile icon={<Heart className="w-3.5 h-3.5" />} label="Total Suka" value={totalLikes} accent="danger" />
        <KpiTile icon={<MessageCircle className="w-3.5 h-3.5" />} label="Total Komentar" value={totalComments} accent="warning" />
        <KpiTile icon={<Eye className="w-3.5 h-3.5" />} label="Total Views" value={totalViews} accent="instagram" />
      </div>

      {/* Admin cards — expanded metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {summary.map((admin, i) => {
          const accent = ADMIN_ACCENTS[i % ADMIN_ACCENTS.length];
          const avgLikes = admin.postCount > 0 ? admin.totalLikes / admin.postCount : 0;
          const avgComments = admin.postCount > 0 ? admin.totalComments / admin.postCount : 0;
          const avgViews = admin.postCount > 0 ? admin.totalViews / admin.postCount : 0;
          return (
            <div key={admin.name} className="relative surface p-4 pt-5 overflow-hidden transition-colors hover:border-border-default">
              <div className={`absolute top-0 left-0 right-0 h-0.5 ${accent.bar}`} aria-hidden="true" />
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-10 h-10 rounded-full ring-2 ${accent.ring} bg-bg-tertiary flex items-center justify-center text-sm font-bold ${accent.text}`}>
                    {adminInitials(admin.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-text-primary truncate">{admin.name}</div>
                    <div className="text-[10px] text-text-muted uppercase tracking-wider">7d sparkline</div>
                  </div>
                </div>
                <Sparkline data={buildSparkline(admin.posts, 7)} color={accent.hex} />
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-3 border-t border-border-subtle text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-text-muted">Post</div>
                  <div className={`text-base font-bold tabular-nums ${accent.text}`}>{admin.postCount}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-text-muted">Avg Suka</div>
                  <div className="text-base font-bold text-text-primary tabular-nums">
                    {admin.postCount > 0 ? formatNumber(Math.round(avgLikes)) : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-text-muted">Total Suka</div>
                  <div className="text-sm font-semibold text-text-primary tabular-nums">{formatNumber(admin.totalLikes)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-text-muted">Total Komentar</div>
                  <div className="text-sm font-semibold text-text-primary tabular-nums">{formatNumber(admin.totalComments)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-text-muted">Total Views</div>
                  <div className="text-sm font-semibold text-text-primary tabular-nums">{formatNumber(admin.totalViews)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-text-muted">Avg Views</div>
                  <div className="text-sm font-semibold text-text-primary tabular-nums">
                    {admin.postCount > 0 ? formatNumber(Math.round(avgViews)) : '—'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Daily growth charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Combined daily line — all admin posts per day */}
        <div className="surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-accent-primary/10 text-accent-primary">
              <TrendingUp className="w-3.5 h-3.5" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Pertumbuhan Harian</span>
            <span className="ml-auto text-[10px] text-text-muted tabular-nums px-2 py-0.5 rounded-full bg-bg-tertiary">{dailyTotals.data.length} hari aktif</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyTotals.data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.4} />
              <XAxis
                dataKey="day"
                stroke="var(--text-muted)"
                tick={{ fontSize: 10 }}
                tickFormatter={(d) => d.slice(5)}
              />
              <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'var(--text-primary)' }}
                labelFormatter={(d) => `Tanggal ${d}`}
              />
              <Line
                type="monotone"
                dataKey="total"
                name="Total Post"
                stroke="#3b82f6"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#3b82f6' }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Stacked bar — total posts per admin per day */}
        <div className="surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-accent-instagram/10 text-accent-instagram">
              <BarChart3 className="w-3.5 h-3.5" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Komposisi Post per Admin</span>
            <span className="ml-auto text-[10px] text-text-muted px-2 py-0.5 rounded-full bg-bg-tertiary">{dailyTotals.adminNames.length} admin</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyTotals.data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.4} />
              <XAxis
                dataKey="day"
                stroke="var(--text-muted)"
                tick={{ fontSize: 10 }}
                tickFormatter={(d) => d.slice(5)}
              />
              <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'var(--text-primary)' }}
                labelFormatter={(d) => `Tanggal ${d}`}
              />
              {dailyTotals.adminNames.map((name) => {
                const idx = summary.findIndex((a) => a.name === name);
                const accent = ADMIN_ACCENTS[idx % ADMIN_ACCENTS.length];
                return (
                  <Bar
                    key={name}
                    dataKey={name}
                    name={name}
                    stackId="a"
                    fill={accent.hex}
                    radius={[2, 2, 0, 0]}
                  />
                );
              })}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Admin ranking table */}
      <div className="surface overflow-hidden">
        <div className="flex items-center gap-2 p-3 border-b border-border-subtle flex-wrap">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-accent-warning/10 text-accent-warning">
            <Trophy className="w-3.5 h-3.5" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Ranking Admin</span>
          <span className="ml-auto flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-text-muted uppercase tracking-wider">Sortir:</span>
            <select
              value={rankMetric}
              onChange={(e) => setRankMetric(e.target.value)}
              className="bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent-primary"
            >
              {Object.entries(RANK_METRICS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-text-muted uppercase border-b border-border-subtle">
                <th className="py-3 px-4 text-left font-medium">#</th>
                <th className="py-3 px-4 text-left font-medium">Admin</th>
                <th className="py-3 px-4 text-right font-medium">Post</th>
                <th className="py-3 px-4 text-right font-medium">Suka</th>
                <th className={`py-3 px-4 text-right font-medium ${COL_RESPONSIVE.md}`}>Komentar</th>
                <th className={`py-3 px-4 text-right font-medium ${COL_RESPONSIVE.md}`}>Views</th>
                <th className="py-3 px-4 text-right font-medium">Avg Suka</th>
                <th className={`py-3 px-4 text-right font-medium ${COL_RESPONSIVE.lg}`}>Avg Komentar</th>
                <th className={`py-3 px-4 text-right font-medium ${COL_RESPONSIVE.lg}`}>Avg Views</th>
              </tr>
            </thead>
            <tbody>
              {sortedRanking.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-sm text-text-muted">Belum ada data.</td>
                </tr>
              ) : (
                sortedRanking.map((row, rank) => {
                  const accent = ADMIN_ACCENTS[row.index % ADMIN_ACCENTS.length];
                  const isTop = rank === 0 && row[rankMetric] > 0;
                  return (
                    <tr key={row.name} className="border-b border-border-subtle/50 hover:bg-bg-tertiary/50">
                      <td className="py-3 px-4 tabular-nums">
                        {isTop ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent-warning/20 text-accent-warning font-bold text-xs">1</span>
                        ) : (
                          <span className="text-text-muted font-semibold">{rank + 1}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-7 h-7 rounded-full ring-2 ${accent.ring} bg-bg-tertiary flex items-center justify-center text-[10px] font-bold ${accent.text} flex-shrink-0`}>
                            {adminInitials(row.name)}
                          </div>
                          <div className="text-sm font-semibold text-text-primary truncate">{row.name}</div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums font-semibold text-text-primary">{formatNumber(row.postCount)}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-text-secondary">{formatNumber(row.totalLikes)}</td>
                      <td className={`py-3 px-4 text-right tabular-nums text-text-secondary ${COL_RESPONSIVE.md}`}>{formatNumber(row.totalComments)}</td>
                      <td className={`py-3 px-4 text-right tabular-nums text-text-secondary ${COL_RESPONSIVE.md}`}>{formatNumber(row.totalViews)}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-text-primary">{row.postCount > 0 ? formatNumber(Math.round(row.avgLikes)) : '—'}</td>
                      <td className={`py-3 px-4 text-right tabular-nums text-text-primary ${COL_RESPONSIVE.lg}`}>{row.postCount > 0 ? formatNumber(Math.round(row.avgComments)) : '—'}</td>
                      <td className={`py-3 px-4 text-right tabular-nums text-text-primary ${COL_RESPONSIVE.lg}`}>{row.postCount > 0 ? formatNumber(Math.round(row.avgViews)) : '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Posts table — limited to 10 preview, scroll for more */}
      <div className="surface overflow-hidden">
        <div className="flex items-center gap-2 p-3 border-b border-border-subtle flex-wrap">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">Filter Admin:</span>
          <button
            onClick={() => setAdminFilter('all')}
            className={`chip transition-colors ${adminFilter === 'all' ? 'bg-accent-primary text-white' : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'}`}
          >
            Semua
          </button>
          {summary.map((admin, i) => {
            const accent = ADMIN_ACCENTS[i % ADMIN_ACCENTS.length];
            const active = adminFilter === admin.name;
            return (
              <button
                key={admin.name}
                onClick={() => setAdminFilter(admin.name)}
                className={`chip transition-colors inline-flex items-center gap-1 ${active ? 'bg-accent-primary text-white' : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'}`}
              >
                <span className={`w-2 h-2 rounded-full ${active ? 'bg-white' : ''}`} style={active ? {} : { backgroundColor: accent.hex }} />
                {admin.name}
                <span className={`ml-1 px-1.5 text-[10px] font-semibold rounded-full ${active ? 'bg-white/20' : 'bg-bg-primary/40'}`}>
                  {admin.postCount}
                </span>
              </button>
            );
          })}
          <span className="ml-auto text-[10px] text-text-muted">
            Tampil {Math.min(10, filteredRows.length)} dari {filteredRows.length} post · scroll untuk lihat semua
          </span>
        </div>
        <div className="overflow-x-auto">
          <div className="max-h-[520px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-bg-secondary z-10">
                <tr className="text-xs text-text-muted uppercase border-b border-border-subtle">
                  <th className="py-3 px-4 text-left font-medium">Admin</th>
                  <th className="py-3 px-4 text-left font-medium">Akun</th>
                  <th className={`py-3 px-4 text-left font-medium ${COL_RESPONSIVE.md}`}>Platform</th>
                  <th className="py-3 px-4 text-left font-medium cursor-pointer select-none" onClick={() => handleSort('createTime')}>
                    <span className="inline-flex items-center gap-1.5">
                      Tanggal
                      <SortIcon active={sortKey === 'createTime'} dir={sortDir} />
                    </span>
                  </th>
                  <th className={`py-3 px-4 text-left font-medium ${COL_RESPONSIVE.lg}`}>Caption</th>
                  <th className="py-3 px-4 text-right font-medium cursor-pointer select-none" onClick={() => handleSort('likeCount')}>
                    <span className="inline-flex items-center gap-1.5">
                      Suka
                      <SortIcon active={sortKey === 'likeCount'} dir={sortDir} />
                    </span>
                  </th>
                  <th className={`py-3 px-4 text-right font-medium cursor-pointer select-none ${COL_RESPONSIVE.md}`} onClick={() => handleSort('commentCount')}>
                    <span className="inline-flex items-center gap-1.5">
                      Komen
                      <SortIcon active={sortKey === 'commentCount'} dir={sortDir} />
                    </span>
                  </th>
                  <th className={`py-3 px-4 text-right font-medium cursor-pointer select-none ${COL_RESPONSIVE.md}`} onClick={() => handleSort('viewCount')}>
                    <span className="inline-flex items-center gap-1.5">
                      Views
                      <SortIcon active={sortKey === 'viewCount'} dir={sortDir} />
                    </span>
                  </th>
                  <th className="py-3 px-4 text-right font-medium">Buka</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-sm text-text-muted">Belum ada post dengan hashtag admin.</td>
                  </tr>
                ) : (
                  filteredRows.map((p) => {
                    const accent = ADMIN_ACCENTS[p._adminIndex % ADMIN_ACCENTS.length];
                    return (
                      <tr key={p._key} className="border-b border-border-subtle/50 hover:bg-bg-tertiary/50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-7 h-7 rounded-full ring-2 ${accent.ring} bg-bg-tertiary flex items-center justify-center text-[10px] font-bold ${accent.text} flex-shrink-0`}>
                              {adminInitials(p._admin.name)}
                            </div>
                            <div className="text-sm font-semibold text-text-primary truncate">{p._admin.name}</div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2 min-w-0">
                            <ProxiedAvatar account={p._account} size={28} className="flex-shrink-0" />
                            <Link
                              to={`/account/${p._accountSlug}`}
                              className="text-text-primary hover:text-accent-primary font-medium truncate"
                            >
                              @{p._accountUsername}
                            </Link>
                          </div>
                        </td>
                        <td className={`py-3 px-4 text-text-secondary ${COL_RESPONSIVE.md}`}>
                          <span className="inline-flex items-center gap-1">
                            <PlatformIcon platform={p._accountPlatform} className="w-3.5 h-3.5" />
                            <span className="hidden md:inline">{platformLabel(p._accountPlatform)}</span>
                            <span className="md:hidden">{p._accountPlatform === 'instagram' ? 'IG' : 'TT'}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 text-text-secondary whitespace-nowrap tabular-nums">
                          {p.createTime ? formatDate(p.createTime > 1e12 ? p.createTime : p.createTime * 1000) : '—'}
                        </td>
                        <td className={`py-3 px-4 text-text-secondary max-w-xs ${COL_RESPONSIVE.lg}`}>
                          <p className="line-clamp-2 text-xs leading-relaxed">{p.caption || '(tanpa caption)'}</p>
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            <Heart className="w-3 h-3 text-accent-danger" />
                            {formatNumber(p.likeCount ?? 0)}
                          </span>
                        </td>
                        <td className={`py-3 px-4 text-right tabular-nums ${COL_RESPONSIVE.md}`}>
                          <span className="inline-flex items-center gap-1">
                            <MessageCircle className="w-3 h-3 text-accent-warning" />
                            {formatNumber(p.commentCount ?? 0)}
                          </span>
                        </td>
                        <td className={`py-3 px-4 text-right tabular-nums ${COL_RESPONSIVE.md}`}>
                          {p.viewCount > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <Eye className="w-3 h-3 text-accent-primary" />
                              {formatNumber(p.viewCount)}
                            </span>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {p.postUrl ? (
                            <a
                              href={p.postUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-accent-primary hover:underline text-xs"
                              aria-label={`Buka post ${p.id}`}
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span className="hidden md:inline">Buka</span>
                            </a>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
