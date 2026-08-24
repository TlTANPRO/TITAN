// V36: admin-helpers — pure functions extracted from Admin.jsx monolith.
// No React — pure computation, testable.
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Line } from 'recharts';
import { formatNumber } from './format.js';

export function adminInitials(name) {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function SortIcon({ active, dir }) {
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

export function KpiTile({ icon, label, value, accent = 'primary' }) {
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
export function Sparkline({ data, color, width = 80, height = 24 }) {
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
export function postTimestampMs(p) {
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
export function buildDailyTotals(rows, metricKey = 'postCount', adminNames = []) {
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
export function filterByRange(data, rangeKey, monthKey) {
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
export function listMonths(data) {
  const set = new Set();
  for (const d of data) set.add(d.day.slice(0, 7));
  return [...set].sort().reverse();
}

// Posts in the last 7 days for one admin — used by the 7d progress bar strip.
export function countPostsLast7Days(posts) {
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
export function normalizeCaption(c) {
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
export function detectCrossPosts(posts) {
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
export function buildCrossPlatformKpi(summary, accounts, monthKey = null) {
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
export function listAvailableMonths(summary) {
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

// monthLabel dipindah ke lib/titan-tokens.js (SSOT).

// Build a sparkline series for one admin — last `days` days of post counts.
// Empty days left as null so recharts skips the dot instead of showing zero.
export function buildSparkline(posts, days = 7) {
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
