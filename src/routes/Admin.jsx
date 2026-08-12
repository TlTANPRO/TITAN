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
  TrendingUp, Trophy, BarChart3, Layers, ChevronDown, ChevronRight, Link2
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import { useAccounts } from '../hooks/useAccount.js';
import { ProxiedAvatar } from '../components/ProxiedAvatar.jsx';
import { PlatformIcon, platformLabel } from '../components/icons/PlatformIcon.jsx';
import { getAdminSummary, ADMIN_HASHTAGS } from '../lib/adminHashtags.js';
import { formatNumber, formatDate } from '../lib/format.js';
import { KomentarAdmin } from '../components/admin/KomentarAdmin.jsx';

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

// Range selector for daily growth chart. Mirrors CrossAccountTimeline.RANGES
// pattern. `month` is sentinel — caller derives month list from data.
const RANGES_ADMIN = {
  '7d': 7 * 86400,
  '30d': 30 * 86400,
  '90d': 90 * 86400,
  all: null,
  month: 'month'
};
const RANGE_LABELS = { '7d': '7H', '30d': '30H', '90d': '90H', all: 'Semua', month: 'Bulan' };

// Per-day aggregates across all admin posts (combined timeline).
// Returns sorted array of { day: 'YYYY-MM-DD', total: N, perAdmin: { name: N } }.
// `metricKey` selects which numeric field per post to sum — postCount default
// counts rows, others sum likeCount/commentCount/viewCount (the per-post fields;
// admin aggregate fields totalLikes/totalComments/totalViews do NOT exist on
// individual posts — use the per-post field name).
const METRIC_TO_POST_FIELD = {
  postCount: null, // count rows
  totalLikes: 'likeCount',
  totalComments: 'commentCount',
  totalViews: 'viewCount'
};

// Normalize post timestamp to milliseconds. IG scraper writes `timestamp`
// in SECONDS (matching `createTime`), TT writes it in MILLISECONDS. Anything
// < 1e12 = sec (year ≤ 2001 in ms is impossible for real posts), multiply.
function postTimestampMs(p) {
  const ts = p.timestamp ?? null;
  const ct = p.createTime ?? null;
  if (ts != null && ts > 0) return ts < 1e12 ? ts * 1000 : ts;
  if (ct != null && ct > 0) return ct * 1000;
  return 0;
}

// Build daily totals across all admin posts.
//
// Guarantees every admin in `adminNames` (the full roster passed in) gets a
// numeric field on EVERY row, even days with zero posts for that admin. This
// keeps the recharts <Line> series flat at 0 (visible) instead of dropping
// silently — user sees every admin's curve regardless of activity.
function buildDailyTotals(rows, metricKey = 'postCount', adminNames = []) {
  const postField = METRIC_TO_POST_FIELD[metricKey] ?? null;
  const byDay = new Map();
  for (const p of rows) {
    const tsMs = postTimestampMs(p);
    if (!tsMs) continue;
    const day = new Date(tsMs).toISOString().slice(0, 10);
    if (!byDay.has(day)) {
      const empty = { day, total: 0 };
      for (const n of adminNames) empty[n] = 0;
      byDay.set(day, empty);
    }
    const slot = byDay.get(day);
    if (postField === null) {
      slot.total += 1;
      slot[p._admin.name] = (slot[p._admin.name] ?? 0) + 1;
    } else {
      const v = Number(p[postField]) || 0;
      slot.total += v;
      slot[p._admin.name] = (slot[p._admin.name] ?? 0) + v;
    }
  }
  // Always return all admin fields on every row, even if no post landed on
  // that day. Defensive — keeps series shape stable.
  const data = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  for (const row of data) {
    for (const n of adminNames) if (row[n] == null) row[n] = 0;
  }
  return {
    data,
    adminNames: [...adminNames]
  };
}

// Filter daily totals by selected range. `monthKey` is 'YYYY-MM' (e.g. '2026-08').
function filterByRange(data, rangeKey, monthKey) {
  if (rangeKey === 'all') return data;
  if (rangeKey === 'month') {
    if (!monthKey) return data;
    return data.filter((d) => d.day.startsWith(monthKey));
  }
  const seconds = RANGES_ADMIN[rangeKey];
  if (!seconds) return data;
  const cutoff = new Date(Date.now() - seconds * 1000).toISOString().slice(0, 10);
  return data.filter((d) => d.day >= cutoff);
}

// Distinct months (desc) across the full data, for the month picker.
function listMonths(data) {
  const set = new Set();
  for (const d of data) set.add(d.day.slice(0, 7));
  return [...set].sort().reverse();
}

// Posts in the last 7 days for one admin — used by the 7d progress bar strip.
function countPostsLast7Days(posts) {
  const cutoffMs = Date.now() - 7 * 86400 * 1000;
  let n = 0;
  for (const p of posts) {
    const tsMs = postTimestampMs(p);
    if (tsMs && tsMs >= cutoffMs) n += 1;
  }
  return n;
}

// V33.3 — Cross-platform KPI helpers.
//
// Normalize caption for fuzzy matching: strip URLs, hashtags, mentions,
// extra whitespace, lowercase. Keep first 80 chars. Two captions that
// differ only in hashtags/URLs/emoji are still considered the same post.
function normalizeCaption(c) {
  if (!c) return '';
  return String(c)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '') // strip URLs
    .replace(/[@#]\w+/g, '')         // strip hashtags + mentions
    .replace(/[^\w\s]/g, ' ')         // strip punctuation
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim()
    .slice(0, 80);
}

// Detect cross-posts across IG ↔ TT for one admin's post list.
//
// Two-layer detection (defense-in-depth):
//   Layer 1 (primary): exact normalized-caption match
//   Layer 2 (fallback): same admin, posts within 6h window, caption length
//                       similarity > 60% (catches edited captions)
//
// Returns {
//   crossIds: Set<string>   — all post IDs (across both platforms) participating in cross-posts
//   pairs: [{ ig, tt, score, method }] — for cross-detail UI
// }
function detectCrossPosts(posts) {
  const ig = [];
  const tt = [];
  for (const p of posts) {
    // Admin posts come from getAdminPosts which exposes _accountPlatform, not
    // .platform. Fall back gracefully for robustness.
    const platform = p._accountPlatform ?? p.platform ?? p._platform ?? null;
    const tsMs = postTimestampMs(p);
    if (!platform || !tsMs) continue;
    if (platform === 'instagram') ig.push({ p, tsMs, platform });
    else if (platform === 'tiktok') tt.push({ p, tsMs, platform });
  }

  // Layer 1: caption-bucket by normalized caption
  const capBuckets = new Map(); // normCap → [{p, tsMs, platform}]
  for (const { p, tsMs, platform } of [...ig, ...tt]) {
    const cap = normalizeCaption(p.caption ?? p.desc ?? '');
    if (cap.length < 25) continue; // too short to be a unique signal
    if (!capBuckets.has(cap)) capBuckets.set(cap, []);
    capBuckets.get(cap).push({ p, tsMs, platform });
  }

  const pairs = [];
  const crossIds = new Set();

  for (const [cap, items] of capBuckets) {
    const igs = items.filter((i) => i.platform === 'instagram');
    const tts = items.filter((i) => i.platform === 'tiktok');
    if (igs.length === 0 || tts.length === 0) continue;
    // Greedy match: each TT used once. Sort by IG count desc, pair each IG
    // with the closest still-available TT (closest by timestamp delta).
    const availableTts = [...tts];
    const sortedIgs = [...igs].sort((a, b) => a.tsMs - b.tsMs);
    for (const igItem of sortedIgs) {
      let best = null;
      let bestDelta = Infinity;
      for (const ttItem of availableTts) {
        const delta = Math.abs(igItem.tsMs - ttItem.tsMs);
        if (delta < bestDelta) {
          best = ttItem;
          bestDelta = delta;
        }
      }
      if (best) {
        pairs.push({ ig: igItem.p, tt: best.p, score: 1.0, method: 'caption' });
        crossIds.add(igItem.p.id);
        crossIds.add(best.p.id);
        const idx = availableTts.indexOf(best);
        if (idx >= 0) availableTts.splice(idx, 1);
      }
      if (availableTts.length === 0) break;
    }
  }

  // Layer 2: timestamp proximity for unmatched posts (caption differs)
  const unmatchedIg = ig.filter((i) => !crossIds.has(i.p.id));
  const unmatchedTt = tt.filter((i) => !crossIds.has(i.p.id));
  const PROXIMITY_MS = 6 * 3600 * 1000; // 6 hours

  // Greedy 1-TT-per-IG matching for layer 2 also.
  const sortedUnmatchedIg = [...unmatchedIg].sort((a, b) => a.tsMs - b.tsMs);
  for (const igItem of sortedUnmatchedIg) {
    const igCap = normalizeCaption(igItem.p.caption ?? igItem.p.desc ?? '');
    if (igCap.length === 0) continue;
    let best = null;
    let bestDelta = Infinity;
    for (const ttItem of unmatchedTt) {
      const delta = Math.abs(igItem.tsMs - ttItem.tsMs);
      if (delta > PROXIMITY_MS) continue;
      const ttCap = normalizeCaption(ttItem.p.caption ?? ttItem.p.desc ?? '');
      if (ttCap.length === 0) continue;
      const minLen = Math.min(igCap.length, ttCap.length);
      const prefixMatch = igCap.slice(0, minLen) === ttCap.slice(0, minLen);
      const overlap = Math.min(igCap.length, ttCap.length) / Math.max(igCap.length, ttCap.length);
      if (!prefixMatch && overlap < 0.5) continue;
      if (delta < bestDelta) {
        best = ttItem;
        bestDelta = delta;
      }
    }
    if (best) {
      pairs.push({ ig: igItem.p, tt: best.p, score: 0.5, method: 'timestamp' });
      crossIds.add(igItem.p.id);
      crossIds.add(best.p.id);
      const idx = unmatchedTt.indexOf(best);
      if (idx >= 0) unmatchedTt.splice(idx, 1);
    }
    if (unmatchedTt.length === 0) break;
  }

  return { crossIds, pairs };
}

// Build per-admin cross-platform KPI rows.
function buildCrossPlatformKpi(summary, accounts, monthKey = null) {
  // monthKey: 'YYYY-MM' string or null = all-time. Posts are filtered to that
  // month before cross-detection so the unique count is month-scoped.
  return summary.map((admin, i) => {
    const monthFiltered = monthKey
      ? admin.posts.filter((p) => {
          const tsMs = postTimestampMs(p);
          if (!tsMs) return false;
          return new Date(tsMs).toISOString().slice(0, 7) === monthKey;
        })
      : admin.posts;
    const tagged = monthFiltered.map((post) => ({
      ...post,
      _accountPlatform: post._accountPlatform ?? post.platform ?? null
    }));
    const { crossIds, pairs } = detectCrossPosts(tagged);

    let igRaw = 0, ttRaw = 0;
    let totalLikes = 0, totalComments = 0, totalViews = 0;
    for (const post of monthFiltered) {
      const platform = post._accountPlatform ?? post.platform ?? null;
      totalLikes += Number(post.likeCount) || 0;
      totalComments += Number(post.commentCount) || 0;
      totalViews += Number(post.viewCount) || 0;
      if (platform === 'instagram') igRaw += 1;
      else if (platform === 'tiktok') ttRaw += 1;
    }
    const crossCount = pairs.length;
    const unique = igRaw + ttRaw - crossCount;

    const totalFollowers = accounts.reduce(
      (s, a) => s + (a.account?.followerCount ?? a.followerCount ?? 0),
      0
    );
    const er = totalFollowers > 0 ? ((totalLikes + totalComments) / totalFollowers) * 100 : 0;

    return {
      index: i,
      name: admin.name,
      igRaw,
      ttRaw,
      crossCount,
      raw: igRaw + ttRaw,
      unique,
      totalLikes,
      totalComments,
      totalViews,
      avgLikes: unique > 0 ? totalLikes / unique : 0,
      avgComments: unique > 0 ? totalComments / unique : 0,
      avgViews: unique > 0 ? totalViews / unique : 0,
      er,
      pairs
    };
  });
}

// List of 'YYYY-MM' keys with at least one admin-tagged post, desc by recency.
// Used to populate the monthly KPI picker.
function listAvailableMonths(summary) {
  const set = new Set();
  for (const admin of summary) {
    for (const p of admin.posts ?? []) {
      const tsMs = postTimestampMs(p);
      if (!tsMs) continue;
      set.add(new Date(tsMs).toISOString().slice(0, 7));
    }
  }
  return [...set].sort().reverse();
}

// Format 'YYYY-MM' → 'Agustus 2026' (Indonesian month names).
const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];
function monthLabel(key) {
  if (!key || key === 'all') return 'Semua Bulan';
  const [y, m] = key.split('-');
  return `${MONTH_NAMES_ID[Number(m) - 1]} ${y}`;
}

// Build a sparkline series for one admin — last `days` days of post counts.
// Empty days left as null so recharts skips the dot instead of showing zero.
function buildSparkline(posts, days = 7) {
  const nowMs = Date.now();
  const cutoffMs = nowMs - days * 86400 * 1000;
  // Bucket 0..days-1 from oldest to newest.
  const counts = new Array(days).fill(0);
  for (const p of posts) {
    const tsMs = postTimestampMs(p);
    if (!tsMs) continue;
    const ageMs = nowMs - tsMs;
    if (ageMs < 0 || ageMs > days * 86400 * 1000) continue;
    const idx = days - 1 - Math.floor(ageMs / 86400 / 1000);
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

      {/* Cross-Platform KPI — per-admin IG vs TT split with cross-post dedup */}
      <div className="surface overflow-hidden">
        <div className="flex items-center gap-3 p-3 border-b border-border-subtle flex-wrap">
          <Layers size={14} className="text-accent-primary" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">KPI Cross-Platform</span>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {/* Monthly scope picker */}
            <select
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
                <th className="py-3 px-4 text-left font-medium">#</th>
                <th className="py-3 px-4 text-left font-medium">Admin</th>
                <th className="py-3 px-4 text-right font-medium">IG</th>
                <th className="py-3 px-4 text-right font-medium">TT</th>
                <th className="py-3 px-4 text-right font-medium">Cross</th>
                <th className="py-3 px-4 text-right font-medium cursor-pointer select-none" onClick={() => setCrossSortKey('unique')} title="Jumlah post unik setelah cross-post IG↔TT dihitung sekali">
                  <span className="inline-flex items-center gap-1.5">
                    Total Post
                    <SortIcon active={crossSortKey === 'unique'} dir="desc" />
                  </span>
                </th>
                <th className={`py-3 px-4 text-right font-medium ${COL_RESPONSIVE.md}`}>ER %</th>
                <th className={`py-3 px-4 text-right font-medium ${COL_RESPONSIVE.md}`}>Avg Suka</th>
                <th className={`py-3 px-4 text-right font-medium ${COL_RESPONSIVE.lg}`}>Avg Views</th>
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
                    <td className="py-3 px-4 text-right text-pink-600 dark:text-pink-400 font-medium">
                      {row.igRaw}
                    </td>
                    <td className="py-3 px-4 text-right text-cyan-600 dark:text-cyan-400 font-medium">
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
                          <div className="rounded bg-pink-500/5 border border-pink-500/20 p-2">
                            <div className="flex items-center gap-1 text-[10px] text-pink-600 dark:text-pink-400 font-semibold uppercase mb-1">
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
                          <div className="rounded bg-cyan-500/5 border border-cyan-500/20 p-2">
                            <div className="flex items-center gap-1 text-[10px] text-cyan-600 dark:text-cyan-400 font-semibold uppercase mb-1">
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

      {/* Komentar Admin — own-account comments tagged with admin markers
          (`-Rf`/`-Rm`/`-Re`/`-Ju`). Per-admin + monthly KPIs + per-post
          comment samples. Dry-run preview, pending scraper wiring. */}
      <KomentarAdmin />
    </div>
  );
}
