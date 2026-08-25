// /admin — Per-admin post tracking via hashtag markers.
//
// Maps each admin display name to a hashtag (#AgustusRE → Reni, etc.) and
// surfaces every post that carries that hashtag in a single unified table
// + per-admin summary, daily growth, and ranking. Single source of truth
// for the mapping lives in src/lib/adminHashtags.js.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Heart, MessageCircle, Eye, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown,
  TrendingUp, Trophy, BarChart3, Layers, ChevronDown, ChevronRight, Link2, UserCog
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import { useAccounts } from '../hooks/useAccount.js';
import { ProxiedAvatar } from '../components/ProxiedAvatar.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { PulseBar } from '../components/ui/PulseBar.jsx';
import { PlatformIcon, platformLabel } from '../components/icons/PlatformIcon.jsx';
import { getAdminSummary, ADMIN_HASHTAGS } from '../lib/adminHashtags.js';
import { formatNumber, formatDate } from '../lib/format.js';
import { ADMIN_ACCENTS, MONTH_NAMES_ID, monthLabel } from '../lib/titan-tokens.js';
import { KomentarAdmin } from '../components/admin/KomentarAdmin.jsx';

// Responsive column visibility — same pattern as EnhancedTable so mobile
// users keep the essential columns visible.
const COL_RESPONSIVE = {
  always: '',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell'
};

import { adminInitials, SortIcon, KpiTile, Sparkline, postTimestampMs, buildDailyTotals, filterByRange, listMonths, countPostsLast7Days, normalizeCaption, detectCrossPosts, buildCrossPlatformKpi, listAvailableMonths, buildSparkline, RANGES_ADMIN, RANGE_LABELS, RANK_METRICS } from '../lib/admin-helpers.jsx';

export default function Admin() {
  const accounts = useAccounts();
  const summary = useMemo(() => getAdminSummary(accounts), [accounts]);

  // V34: page-level tabs — "Postingan" (existing content) | "Komentar"
  // (KomentarAdmin). Splits the former 1500-line single page into two
  // focused tabs per design-system information-density audit.
  const [pageTab, setPageTab] = useState('posts');

  // V33.2: range + monthly picker + drill-down focus state declared BEFORE
  // any useMemo that references them. Earlier draft put growthMetric after
  // dailyTotals useMemo → TDZ ReferenceError at runtime (Cannot access 'b'
  // before initialization — minified var name for growthMetric).
  const [range, setRange] = useState('all');
  const [monthKey, setMonthKey] = useState(null);
  const [activeAdmin, setActiveAdmin] = useState(null); // null = combined view
  const [growthMetric, setGrowthMetric] = useState('postCount'); // postCount | totalLikes | totalComments | totalViews

  const allRows = useMemo(() => {
    const out = [];
    summary.forEach((admin, i) => {
      for (const p of admin.posts) {
        out.push({ ...p, _admin: admin, _adminIndex: i, _key: `${admin.name}-${p._accountSlug}-${p.id}` });
      }
    });
    out.sort((a, b) => postTimestampMs(b) - postTimestampMs(a));
    return out;
  }, [summary]);

  const dailyTotals = useMemo(
    () => buildDailyTotals(allRows, growthMetric, summary.map((a) => a.name)),
    [allRows, growthMetric, summary]
  );

  // Reset monthKey if user switches away from 'month' range
  useEffect(() => {
    if (range !== 'month') setMonthKey(null);
  }, [range]);

  const filteredDaily = useMemo(
    () => filterByRange(dailyTotals.data, range, monthKey),
    [dailyTotals.data, range, monthKey]
  );
  // Komposisi chart always counts posts (not likes/views) — keep separate
  // from metric-aware dailyTotals. Same range filter applied.
  const dailyPosts = useMemo(
    () => buildDailyTotals(allRows, 'postCount', summary.map((a) => a.name)),
    [allRows, summary]
  );
  const filteredDailyPosts = useMemo(
    () => filterByRange(dailyPosts.data, range, monthKey),
    [dailyPosts.data, range, monthKey]
  );
  const monthOptions = useMemo(() => listMonths(dailyTotals.data), [dailyTotals.data]);

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

  // V33.3 — Cross-platform KPI: per-admin breakdown with dedup-aware counts.
  // Month-scoped: crossMonthKey = 'YYYY-MM' or 'all' (default all-time).
  // Distinct from the existing `monthKey` state which scopes the growth chart
  // range (== null when range !== 'month').
  const availableMonths = useMemo(() => listAvailableMonths(summary), [summary]);
  const [crossMonthKey, setCrossMonthKey] = useState('all');
  const crossPlatformKpi = useMemo(
    () => buildCrossPlatformKpi(summary, accounts, crossMonthKey === 'all' ? null : crossMonthKey),
    [summary, accounts, crossMonthKey]
  );
  const [crossSortKey, setCrossSortKey] = useState('unique');
  const sortedCrossKpi = useMemo(() => {
    return [...crossPlatformKpi].sort((a, b) => (b[crossSortKey] ?? 0) - (a[crossSortKey] ?? 0));
  }, [crossPlatformKpi, crossSortKey]);

  // Aggregate totals for header badge
  const crossTotals = useMemo(() => {
    return crossPlatformKpi.reduce(
      (acc, r) => ({
        raw: acc.raw + r.raw,
        unique: acc.unique + r.unique,
        cross: acc.cross + r.crossCount,
        likes: acc.likes + r.totalLikes,
        comments: acc.comments + r.totalComments,
        views: acc.views + r.totalViews
      }),
      { raw: 0, unique: 0, cross: 0, likes: 0, comments: 0, views: 0 }
    );
  }, [crossPlatformKpi]);

  const [crossDetailOpen, setCrossDetailOpen] = useState(false);

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

  // V33.2.1 Komposisi: dynamic Y-max so chart doesn't waste vertical space on
  // sparse days. Add 1 step ceiling to give the topmost bar breathing room.
  const dynamicYMax = useMemo(() => {
    const max = filteredDailyPosts.reduce((m, d) => Math.max(m, d.total || 0), 0);
    if (max <= 0) return 1;
    // Round up to next multiple of 2 (4→4, 5→6, 7→8), +20% padding
    const padded = Math.ceil(max * 1.2);
    return padded <= 4 ? 4 : padded <= 8 ? 8 : padded <= 12 ? 12 : Math.ceil(padded / 4) * 4;
  }, [filteredDailyPosts]);

  // Total posts inside the active range — shown in Komposisi header badge
  const totalPostsInRange = useMemo(
    () => filteredDailyPosts.reduce((s, d) => s + (d.total || 0), 0),
    [filteredDailyPosts]
  );

  // Dynamic 7d target — max(7, ceil(avg per admin × 1.5)) so the bar doesn't
  // forever show 0/7 when reality is sparse. Caps at 14 to keep meaningful.
  const target7d = useMemo(() => {
    if (summary.length === 0) return 7;
    const counts = summary.map((a) => countPostsLast7Days(a.posts));
    const avg = counts.reduce((s, n) => s + n, 0) / counts.length;
    const target = Math.max(7, Math.min(14, Math.ceil(avg * 1.5)));
    return target;
  }, [summary]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        icon={UserCog}
        title="Admin"
        subtitle="Tracker postingan per hashtag & aktivitas komentar admin"
      />

      <PulseBar />

      {/* V34: page-level tab strip — Postingan | Komentar */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-bg-secondary border border-border-subtle w-fit" role="tablist" aria-label="Bagian Admin">
        {[
          { id: 'posts', label: 'Postingan per Hashtag' },
          { id: 'comments', label: 'Komentar Admin' }
        ].map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={pageTab === t.id}
            onClick={() => setPageTab(t.id)}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${
              pageTab === t.id
                ? 'bg-accent-primary text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {pageTab === 'comments' ? (
        <KomentarAdmin />
      ) : (
      <>
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
          if (admin.postCount === 0) {
            return (
              <div key={admin.name} className="relative surface p-4 pt-5 overflow-hidden">
                <div className={`absolute top-0 left-0 right-0 h-0.5 ${accent.bar}`} aria-hidden="true" />
                <div className="flex items-center gap-2.5 mb-3">
                  <div className={`w-10 h-10 rounded-full ring-2 ${accent.ring} bg-bg-tertiary flex items-center justify-center text-sm font-bold ${accent.text}`}>
                    {adminInitials(admin.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-text-primary truncate">{admin.name}</div>
                    <div className="text-[10px] text-text-muted uppercase tracking-wider">7d sparkline</div>
                  </div>
                </div>
                <div className="pt-3 border-t border-border-subtle py-6 flex flex-col items-center gap-3 text-center">
                  <div className="text-xs text-text-muted">Belum ada post untuk hashtag ini bulan ini.</div>
                  <Link
                    to={`/library?q=${encodeURIComponent((admin.hashtag ?? '').replace('#', ''))}`}
                    className={`text-xs font-semibold ${accent.text} underline underline-offset-2 hover:opacity-80`}
                  >
                    Cek di Library
                  </Link>
                </div>
              </div>
            );
          }
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
        {/* Combined daily line — multi-line per admin + drill-down + range/metric toggles.
            V33.2: replaced single total line with per-admin lines so each admin's
            posting trajectory is visible at a glance. Tab strip highlights one
            admin on click. */}
        <div className="surface p-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-accent-primary/10 text-accent-primary">
              <TrendingUp className="w-3.5 h-3.5" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Pertumbuhan Harian</span>
            <span className="ml-auto text-[10px] text-text-muted tabular-nums px-2 py-0.5 rounded-full bg-bg-tertiary">{filteredDaily.length} hari aktif</span>
          </div>

          {/* Tab strip: Gabungan + each admin. Click to drill down. */}
          <div className="flex items-center gap-1 mb-3 flex-wrap">
            <button
              onClick={() => setActiveAdmin(null)}
              className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded transition-colors ${
                activeAdmin === null ? 'bg-accent-primary text-white' : 'bg-bg-tertiary text-text-muted hover:text-text-primary'
              }`}
            >
              Gabungan
            </button>
            {summary.map((admin, i) => {
              const accent = ADMIN_ACCENTS[i % ADMIN_ACCENTS.length];
              const isActive = activeAdmin === admin.name;
              return (
                <button
                  key={admin.name}
                  onClick={() => setActiveAdmin(isActive ? null : admin.name)}
                  className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded transition-colors inline-flex items-center gap-1.5 ${
                    isActive ? 'text-white' : 'text-text-muted hover:text-text-primary'
                  }`}
                  style={isActive ? { backgroundColor: accent.hex } : {}}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: isActive ? '#fff' : accent.hex }}
                  />
                  {admin.name}
                </button>
              );
            })}
          </div>

          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={filteredDaily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
              {summary.map((admin, i) => {
                const accent = ADMIN_ACCENTS[i % ADMIN_ACCENTS.length];
                const isFocus = activeAdmin === admin.name;
                const isFaded = activeAdmin !== null && !isFocus;
                return (
                  <Line
                    key={admin.name}
                    type="monotone"
                    dataKey={admin.name}
                    name={admin.name}
                    stroke={accent.hex}
                    strokeWidth={isFocus ? 3 : 2}
                    strokeOpacity={isFaded ? 0.15 : 1}
                    dot={false}
                    connectNulls
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>

          {/* Range + metric controls */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border-subtle flex-wrap">
            <span className="text-[10px] text-text-muted uppercase tracking-wider">Range:</span>
            <div className="flex gap-1 bg-bg-tertiary rounded p-0.5">
              {Object.keys(RANGES_ADMIN).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`text-[10px] px-2 py-1 rounded font-medium transition-colors ${
                    range === r ? 'bg-accent-primary text-white' : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  {RANGE_LABELS[r]}
                </button>
              ))}
            </div>
            {range === 'month' && (
              <select
                id="admin-growth-month-picker"
                name="adminGrowthMonth"
                value={monthKey ?? ''}
                onChange={(e) => setMonthKey(e.target.value || null)}
                className="bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-[10px] text-text-primary focus:outline-none focus:border-accent-primary"
              >
                <option value="">Pilih bulan</option>
                {monthOptions.map((m) => {
                  const [y, mo] = m.split('-');
                  const label = new Date(`${m}-01T00:00:00Z`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
                  return <option key={m} value={m}>{label}</option>;
                })}
              </select>
            )}
            <span className="text-[10px] text-text-muted uppercase tracking-wider ml-auto">Metrik:</span>
            <div className="flex gap-1 bg-bg-tertiary rounded p-0.5">
              {[
                { k: 'postCount', l: 'Post' },
                { k: 'totalLikes', l: 'Suka' },
                { k: 'totalComments', l: 'Komen' },
                { k: 'totalViews', l: 'Views' }
              ].map((m) => (
                <button
                  key={m.k}
                  onClick={() => setGrowthMetric(m.k)}
                  className={`text-[10px] px-2 py-1 rounded font-medium transition-colors ${
                    growthMetric === m.k ? 'bg-accent-primary text-white' : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  {m.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stacked bar — total posts per admin per day + winner pill row + 7d progress.
            V33.2: switched source to filteredDaily (respects growth range/month picker).
            Added Top Admin badge per day and 7d progress strip below the chart.
            V33.2.1: modernized — dynamic Y-max, custom tooltip, legend with totals,
            animate on mount, empty state, sortable legend. */}
        <div className="surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-accent-instagram/10 text-accent-instagram">
              <BarChart3 className="w-3.5 h-3.5" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Komposisi Post per Admin</span>
            <span className="ml-auto flex items-center gap-1.5 text-[10px] text-text-muted">
              <span className="tabular-nums px-2 py-0.5 rounded-full bg-bg-tertiary">
                <span className="text-text-primary font-semibold">{totalPostsInRange}</span> post
              </span>
              <span className="px-2 py-0.5 rounded-full bg-bg-tertiary">{summary.length} admin</span>
            </span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={filteredDailyPosts} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.4} vertical={false} />
              <XAxis
                dataKey="day"
                stroke="var(--text-muted)"
                tick={{ fontSize: 10 }}
                tickFormatter={(d) => d.slice(5)}
              />
              <YAxis
                stroke="var(--text-muted)"
                tick={{ fontSize: 10 }}
                allowDecimals={false}
                domain={[0, dynamicYMax]}
              />
              <Tooltip
                cursor={{ fill: 'var(--bg-tertiary)', opacity: 0.4 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const day = label ?? '';
                  const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
                  // Stable order: sort by value desc so dominant admin on top
                  const items = [...payload]
                    .filter((p) => (Number(p.value) || 0) > 0)
                    .sort((a, b) => b.value - a.value);
                  return (
                    <div className="bg-bg-elevated border border-border-default rounded-lg shadow-xl p-2.5 text-xs min-w-[180px]">
                      <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">
                        {day}
                      </div>
                      <div className="space-y-1">
                        {items.map((it) => {
                          const idx = summary.findIndex((a) => a.name === it.name);
                          const accent = ADMIN_ACCENTS[idx % ADMIN_ACCENTS.length];
                          return (
                            <div key={it.name} className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-sm flex-shrink-0"
                                style={{ backgroundColor: accent.hex }}
                              />
                              <span className="flex-1 text-text-secondary">{it.name}</span>
                              <span className="tabular-nums text-text-primary font-semibold">
                                {it.value}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-1.5 pt-1.5 border-t border-border-subtle flex items-center justify-between">
                        <span className="text-text-muted">Total</span>
                        <span className="tabular-nums text-text-primary font-bold">{total}</span>
                      </div>
                    </div>
                  );
                }}
              />
              {summary
                .map((admin) => {
                  // Stable accent by ADMIN_HASHTAGS order (NOT summary order, so
                  // colors stay attached to Reni/Rifqi/Reta/Julian even if sort changes)
                  const originalIdx = ADMIN_HASHTAGS.findIndex((h) => h.name === admin.name);
                  const accent = ADMIN_ACCENTS[originalIdx >= 0 ? originalIdx % ADMIN_ACCENTS.length : 0];
                  return (
                    <Bar
                      key={admin.name}
                      dataKey={admin.name}
                      name={admin.name}
                      stackId="a"
                      fill={accent.hex}
                      radius={[2, 2, 0, 0]}
                      isAnimationActive
                      animationDuration={600}
                    />
                  );
                })}
            </BarChart>
          </ResponsiveContainer>

          {/* Legend with per-admin totals (compact, two-tone) */}
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            {summary.map((admin, i) => {
              const accent = ADMIN_ACCENTS[i % ADMIN_ACCENTS.length];
              const total = filteredDailyPosts.reduce((s, d) => s + (d[admin.name] ?? 0), 0);
              return (
                <button
                  key={admin.name}
                  onClick={() => setActiveAdmin(activeAdmin === admin.name ? null : admin.name)}
                  className={`flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                    activeAdmin === admin.name ? 'bg-bg-tertiary' : 'hover:bg-bg-tertiary/50'
                  }`}
                  title={`Klik untuk drill-down ke ${admin.name} di Pertumbuhan`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: accent.hex }}
                  />
                  <span className={activeAdmin === admin.name ? accent.text + ' font-bold' : 'text-text-secondary'}>
                    {admin.name}
                  </span>
                  <span className="tabular-nums text-text-muted">{total}</span>
                </button>
              );
            })}
          </div>

          {/* Top admin per day — modernized: large day + winner + breakdown */}
          <div className="mt-3 pt-3 border-t border-border-subtle">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Trophy className="w-3 h-3 text-accent-warning" />
              Top Admin per Hari
            </div>
            {filteredDailyPosts.filter((d) => d.total > 0).length === 0 ? (
              <div className="text-[11px] text-text-muted py-3 text-center bg-bg-tertiary/30 rounded">
                Tidak ada post dalam rentang ini
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {filteredDailyPosts
                  .filter((d) => d.total > 0)
                  .map((d) => {
                    let topName = '';
                    let topVal = 0;
                    for (const admin of summary) {
                      const v = d[admin.name] ?? 0;
                      if (v > topVal) { topVal = v; topName = admin.name; }
                    }
                    if (!topName) return null;
                    const idx = summary.findIndex((a) => a.name === topName);
                    const accent = ADMIN_ACCENTS[idx % ADMIN_ACCENTS.length];
                    const others = summary.length - 1;
                    return (
                      <div
                        key={d.day}
                        className="relative flex flex-col gap-1 px-2.5 py-1.5 rounded-md bg-bg-tertiary/40 border border-border-subtle hover:bg-bg-tertiary/70 transition-colors"
                        title={`${topName} memimpin pada ${d.day} dengan ${topVal} post`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-text-muted tabular-nums font-medium">
                            {d.day.slice(5)}
                          </span>
                          <Trophy className="w-2.5 h-2.5 text-accent-warning" />
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className={`text-sm font-bold tabular-nums ${accent.text}`}>
                            {topVal}
                          </span>
                          <span className={`text-[10px] font-semibold ${accent.text} truncate`}>
                            {topName}
                          </span>
                        </div>
                        {others > 0 && (
                          <div className="text-[9px] text-text-muted">
                            +{others} admin lain
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* 7d progress strip — target = max(current posts across admins, 4) floor.
              Avoids showing 0/7 when reality is sparse. */}
          <div className="mt-3 pt-3 border-t border-border-subtle">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">
              Progress 7 Hari
              <span className="text-text-primary"> · target {target7d} post</span>
              <span className="ml-1 normal-case tracking-normal text-text-muted">
                ({summary.length > 0 ? Math.round(summary.reduce((s, a) => s + countPostsLast7Days(a.posts), 0) / summary.length * 10) / 10 : 0} avg/admin)
              </span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {summary.map((admin, i) => {
                const accent = ADMIN_ACCENTS[i % ADMIN_ACCENTS.length];
                const count = countPostsLast7Days(admin.posts);
                const pct = target7d > 0 ? Math.min(100, (count / target7d) * 100) : 0;
                const hit = count >= target7d;
                return (
                  <div
                    key={admin.name}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded ${hit ? 'bg-accent-success/5 border border-accent-success/20' : ''}`}
                  >
                    <span className={`text-[10px] font-bold ${accent.text} w-12 truncate`}>{admin.name}</span>
                    <div className="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                      <div
                        className={`h-full ${accent.bar} transition-all duration-300`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={`text-[10px] tabular-nums w-10 text-right ${hit ? 'text-accent-success font-bold' : 'text-text-muted'}`}>
                      {count}/{target7d}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
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
              id="admin-ranking-sort"
              name="adminRankingSort"
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
                <th scope="col" className="py-3 px-4 text-left font-medium">#</th>
                <th scope="col" className="py-3 px-4 text-left font-medium">Admin</th>
                <th scope="col" className="py-3 px-4 text-right font-medium">Post</th>
                <th scope="col" className="py-3 px-4 text-right font-medium">Suka</th>
                <th scope="col" className={`py-3 px-4 text-right font-medium ${COL_RESPONSIVE.md}`}>Komentar</th>
                <th scope="col" className={`py-3 px-4 text-right font-medium ${COL_RESPONSIVE.md}`}>Views</th>
                <th scope="col" className="py-3 px-4 text-right font-medium">Avg Suka</th>
                <th scope="col" className={`py-3 px-4 text-right font-medium ${COL_RESPONSIVE.lg}`}>Avg Komentar</th>
                <th scope="col" className={`py-3 px-4 text-right font-medium ${COL_RESPONSIVE.lg}`}>Avg Views</th>
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

      {/* Cross-Platform KPI — per-admin IG vs TT split with cross-post dedup */}
      <div className="surface overflow-hidden">
        <div className="flex items-center gap-3 p-3 border-b border-border-subtle flex-wrap">
          <Layers size={14} className="text-accent-primary" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">KPI Cross-Platform</span>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {/* Monthly scope picker */}
            <select
              id="admin-cross-platform-month"
              name="adminCrossPlatformMonth"
              value={crossMonthKey}
              onChange={(e) => setCrossMonthKey(e.target.value)}
              className="text-[10px] font-semibold uppercase tracking-wider bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-text-primary cursor-pointer hover:bg-bg-secondary transition-colors"
              aria-label="Pilih bulan untuk KPI Cross-Platform"
            >
              <option value="all">Semua Bulan</option>
              {availableMonths.map((mk) => (
                <option key={mk} value={mk}>{monthLabel(mk)}</option>
              ))}
            </select>
            <span
              className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-accent-primary/15 text-accent-primary"
              title={crossMonthKey === 'all' ? 'Seluruh waktu' : `Bulan ${monthLabel(crossMonthKey)}`}
            >
              {crossTotals.unique.toLocaleString('id-ID')} total post
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-text-muted uppercase border-b border-border-subtle">
                <th scope="col" className="py-3 px-4 text-left font-medium">#</th>
                <th scope="col" className="py-3 px-4 text-left font-medium">Admin</th>
                <th scope="col" className="py-3 px-4 text-right font-medium">IG</th>
                <th scope="col" className="py-3 px-4 text-right font-medium">TT</th>
                <th scope="col" className="py-3 px-4 text-right font-medium">Cross</th>
                <th className="py-3 px-4 text-right font-medium cursor-pointer select-none" onClick={() => setCrossSortKey('unique')} title="Jumlah post unik setelah cross-post IG↔TT dihitung sekali">
                  <span className="inline-flex items-center gap-1.5">
                    Total Post
                    <SortIcon active={crossSortKey === 'unique'} dir="desc" />
                  </span>
                </th>
                <th scope="col" className={`py-3 px-4 text-right font-medium ${COL_RESPONSIVE.md}`}>ER %</th>
                <th scope="col" className={`py-3 px-4 text-right font-medium ${COL_RESPONSIVE.md}`}>Avg Suka</th>
                <th scope="col" className={`py-3 px-4 text-right font-medium ${COL_RESPONSIVE.lg}`}>Avg Views</th>
              </tr>
            </thead>
            <tbody>
              {sortedCrossKpi.map((row) => {
                const accent = ADMIN_ACCENTS[row.index % ADMIN_ACCENTS.length];
                const hashtag = ADMIN_HASHTAGS.find((h) => h.name === row.name);
                return (
                  <tr key={row.name} className="border-b border-border-subtle/50 hover:bg-bg-tertiary/40 transition-colors">
                    <td className="py-3 px-4 text-text-muted">{row.index + 1}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: accent.hex }} />
                        <div className="min-w-0">
                          <div className="font-medium text-text-primary truncate">{row.name}</div>
                          {hashtag && (
                            <div className="text-[10px] text-text-muted truncate">{hashtag.tag}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-accent-instagram  font-medium">
                      {row.igRaw}
                    </td>
                    <td className="py-3 px-4 text-right text-accent-tiktok  font-medium">
                      {row.ttRaw}
                    </td>
                    <td className="py-3 px-4 text-right text-amber-600 dark:text-amber-400">
                      {row.crossCount > 0 ? row.crossCount : '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="font-bold text-accent-primary tabular-nums">
                        {row.unique.toLocaleString('id-ID')}
                      </div>
                      {row.crossCount > 0 ? (
                        <div className="text-[9px] text-text-muted tabular-nums mt-0.5">
                          {row.igRaw}+{row.ttRaw}−{row.crossCount}
                        </div>
                      ) : (
                        <div className="text-[9px] text-text-muted tabular-nums mt-0.5">
                          {row.igRaw}+{row.ttRaw}
                        </div>
                      )}
                    </td>
                    <td className={`py-3 px-4 text-right text-text-secondary ${COL_RESPONSIVE.md}`}>
                      {row.er.toFixed(2)}%
                    </td>
                    <td className={`py-3 px-4 text-right text-text-secondary ${COL_RESPONSIVE.md}`}>
                      {Math.round(row.avgLikes).toLocaleString('id-ID')}
                    </td>
                    <td className={`py-3 px-4 text-right text-text-secondary ${COL_RESPONSIVE.lg}`}>
                      {row.avgViews >= 1000
                        ? `${(row.avgViews / 1000).toFixed(1)}K`
                        : Math.round(row.avgViews).toLocaleString('id-ID')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-border-subtle">
          <button
            onClick={() => setCrossDetailOpen((v) => !v)}
            className="flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            {crossDetailOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Link2 size={12} className="text-amber-500" />
            <span className="font-medium">Detail Cross-Post</span>
            <span className="text-text-muted">
              ({crossTotals.cross} pasangan)
            </span>
          </button>
          {crossDetailOpen && (
            <div className="mt-3 space-y-2 max-h-[480px] overflow-y-auto">
              {sortedCrossKpi.filter((r) => r.pairs.length > 0).map((row) => {
                const accent = ADMIN_ACCENTS[row.index % ADMIN_ACCENTS.length];
                return (
                  <div key={row.name} className="rounded-lg border border-border-subtle bg-bg-secondary/40 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: accent.hex }} />
                      <span className="text-xs font-semibold text-text-primary">{row.name}</span>
                      <span className="text-[10px] text-text-muted">{row.pairs.length} cross-post</span>
                    </div>
                    <div className="space-y-1.5">
                      {row.pairs.slice(0, 8).map((pair, idx) => (
                        <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                          <div className="rounded bg-accent-instagram/5 border border-accent-instagram/20 p-2">
                            <div className="flex items-center gap-1 text-[10px] text-accent-instagram  font-semibold uppercase mb-1">
                              <span>IG</span>
                              <span className="text-text-muted">·</span>
                              <span>{Math.round(pair.score * 100)}% {pair.method}</span>
                            </div>
                            <div className="text-text-secondary line-clamp-2">
                              {(pair.ig.caption ?? pair.ig.desc ?? '').slice(0, 140)}
                            </div>
                            <div className="flex gap-3 mt-1 text-text-muted">
                              <span>♥ {pair.ig.likeCount ?? 0}</span>
                              <span>💬 {pair.ig.commentCount ?? 0}</span>
                              <span>▶ {pair.ig.viewCount ?? 0}</span>
                            </div>
                          </div>
                          <div className="rounded bg-accent-tiktok/5 border border-accent-tiktok/20 p-2">
                            <div className="flex items-center gap-1 text-[10px] text-accent-tiktok  font-semibold uppercase mb-1">
                              <span>TT</span>
                              <span className="text-text-muted">·</span>
                              <span>matched</span>
                            </div>
                            <div className="text-text-secondary line-clamp-2">
                              {(pair.tt.caption ?? pair.tt.desc ?? '').slice(0, 140)}
                            </div>
                            <div className="flex gap-3 mt-1 text-text-muted">
                              <span>♥ {pair.tt.likeCount ?? 0}</span>
                              <span>💬 {pair.tt.commentCount ?? 0}</span>
                              <span>▶ {pair.tt.viewCount ?? 0}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                      {row.pairs.length > 8 && (
                        <div className="text-[10px] text-text-muted text-center pt-1">
                          +{row.pairs.length - 8} cross-post lainnya
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {crossTotals.cross === 0 && (
                <div className="text-xs text-text-muted text-center py-4">
                  Tidak ada cross-post terdeteksi
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Posts table — filter row + posts grid. Consistent with Komentar per Post
          table aesthetic: tabular header, sticky column, hover rows, tabular nums.
          V34.10: moved admin filter chips into a single-row filter table (Akun/Admin
          columns) so the Admin tab filter system looks identical across sections. */}
      <div className="surface overflow-hidden">
        {/* Filter table — single row of Admin chips inside a tabular layout so the
            section header + filter row read as one cohesive table. */}
        <div className="overflow-x-auto border-b border-border-subtle">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-text-muted uppercase border-b border-border-subtle tracking-wider">
                <th className="py-1.5 px-4 text-left font-medium">Filter Admin</th>
                <th className="py-1.5 px-4 text-right font-medium tabular-nums">
                  {filteredRows.length}/{allRows.length} post
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="align-middle">
                <td className="py-2 px-4">
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setAdminFilter('all')}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                        adminFilter === 'all'
                          ? 'bg-accent-primary text-white border-accent-primary'
                          : 'bg-bg-secondary/40 text-text-secondary border-border-subtle hover:border-border-default'
                      }`}
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
                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors inline-flex items-center gap-1.5 ${
                            active
                              ? `${accent.bar} text-white border-transparent`
                              : `${accent.chip} hover:border-border-default`
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${active ? 'bg-white' : ''}`}
                            style={active ? {} : { backgroundColor: accent.hex }}
                          />
                          {admin.name}
                          <span className={`ml-1 px-1.5 text-[10px] font-semibold rounded-full ${active ? 'bg-white/20' : 'bg-bg-primary/40'}`}>
                            {admin.postCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="py-2 px-4 text-right">
                  <div className="flex items-center justify-end gap-2 text-[10px] text-text-muted">
                    <span className="uppercase tracking-wider">Sortir:</span>
                    <span className="text-text-primary font-semibold tabular-nums">
                      {sortKey === 'createTime' ? 'Tanggal' : sortKey === 'likeCount' ? 'Suka' : sortKey === 'commentCount' ? 'Komen' : sortKey === 'viewCount' ? 'Views' : sortKey}
                    </span>
                    <SortIcon active dir={sortDir} />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto">
          <div className="max-h-[520px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-bg-secondary z-10">
                <tr className="text-xs text-text-muted uppercase border-b border-border-subtle">
                  <th scope="col" className="py-3 px-4 text-left font-medium">Admin</th>
                  <th scope="col" className="py-3 px-4 text-left font-medium">Akun</th>
                  <th scope="col" className={`py-3 px-4 text-left font-medium ${COL_RESPONSIVE.md}`}>Platform</th>
                  <th className="py-3 px-4 text-left font-medium cursor-pointer select-none" onClick={() => handleSort('createTime')}>
                    <span className="inline-flex items-center gap-1.5">
                      Tanggal
                      <SortIcon active={sortKey === 'createTime'} dir={sortDir} />
                    </span>
                  </th>
                  <th scope="col" className={`py-3 px-4 text-left font-medium ${COL_RESPONSIVE.lg}`}>Caption</th>
                  <th className="py-3 px-4 text-right font-medium cursor-pointer select-none" onClick={() => handleSort('likeCount')}>
                    <span className="inline-flex items-center gap-1.5">
                      Suka
                      <SortIcon active={sortKey === 'likeCount'} dir={sortDir} />
                    </span>
                  </th>
                  <th scope="col" className={`py-3 px-4 text-right font-medium cursor-pointer select-none ${COL_RESPONSIVE.md}`} onClick={() => handleSort('commentCount')}>
                    <span className="inline-flex items-center gap-1.5">
                      Komen
                      <SortIcon active={sortKey === 'commentCount'} dir={sortDir} />
                    </span>
                  </th>
                  <th scope="col" className={`py-3 px-4 text-right font-medium cursor-pointer select-none ${COL_RESPONSIVE.md}`} onClick={() => handleSort('viewCount')}>
                    <span className="inline-flex items-center gap-1.5">
                      Views
                      <SortIcon active={sortKey === 'viewCount'} dir={sortDir} />
                    </span>
                  </th>
                  <th scope="col" className="py-3 px-4 text-right font-medium">Buka</th>
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

      {/* Komentar Admin — moved to its own "Komentar" page tab (V34) */}
      </>
      )}
    </div>
  );
}
