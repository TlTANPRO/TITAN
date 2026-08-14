// Komentar Admin — tracks comments our admin accounts leave on posts (own and
// others'). Tag format is DASH-prefix (`-Rf` / `-Rm` / `-Re` / `-Ju`), different
// from the post-caption `#agustusXX` rule. Populated from
// src/data/admin-comments.json — manual until a free IG/TT comment scraper is
// wired. SSOT for marker detection + KPI aggregates lives in lib/adminComments.js.
import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, ExternalLink, BarChart3, ChevronDown, ChevronRight, TrendingUp, CalendarDays, Instagram, Music2 } from 'lucide-react';
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, Legend
} from 'recharts';
import {
  loadAdminComments,
  buildAdminKpi,
  buildMonthlyKpi,
  listCommentMonths,
  groupByPost,
  previewCommentText,
  ADMIN_ORDER
} from '../../lib/adminComments.js';
import { formatNumber } from '../../lib/format.js';

// 4 distinct accents — mirrors Admin.jsx palette so admin chips stay in sync.
const ADMIN_ACCENTS = [
  { text: 'text-accent-primary',   bar: 'bg-accent-primary',   hex: '#3b82f6', chip: 'bg-accent-primary/10 text-accent-primary border-accent-primary/30' },
  { text: 'text-accent-success',   bar: 'bg-accent-success',   hex: '#10b981', chip: 'bg-accent-success/10 text-accent-success border-accent-success/30' },
  { text: 'text-accent-warning',   bar: 'bg-accent-warning',   hex: '#f59e0b', chip: 'bg-accent-warning/10 text-accent-warning border-accent-warning/30' },
  { text: 'text-accent-instagram', bar: 'bg-accent-instagram', hex: '#E1306C', chip: 'bg-accent-instagram/10 text-accent-instagram border-accent-instagram/30' }
];

// Latest comments shown collapsed per post. Scrollable list caps at this
// number per post — user can scroll OR expand.
const SAMPLES_PER_POST = 10;

function accentForAdmin(name) {
  const idx = ADMIN_ORDER.indexOf(name);
  if (idx >= 0) return ADMIN_ACCENTS[idx % ADMIN_ACCENTS.length];
  // Defensive fallback: unknown admin name — first palette entry. Avoids
  // "Cannot read .hex of undefined" if a row's admin isn't in ADMIN_ORDER
  // (e.g. legacy data, capitalization drift, future admin added).
  return ADMIN_ACCENTS[0];
}

function monthLabel(key) {
  // 'YYYY-MM' → 'Agustus 2026' (Indonesian, full month name). Simple cache.
  const [y, m] = key.split('-').map(Number);
  const names = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${names[m - 1] ?? '?'} ${y}`;
}

function shortDate(ms) {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function shortTime(ms) {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function PlatformBadge({ platform }) {
  const isIG = platform === 'instagram';
  const Icon = isIG ? Instagram : Music2;
  const label = isIG ? 'Instagram' : 'TikTok';
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider ${
      isIG ? 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/30' : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30'
    }`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

// Build daily comment count per admin. Mirrors Admin.jsx buildDailyTotals():
// densify timeline from min → max day so the line chart stays continuous (no
// dropped dots when an admin skips a day), and pre-fill every admin field
// with 0 so recharts never sees `undefined` for an admin that didn't comment.
// Returns sorted [{ day, Reni, Rifqi, Reta, Julian, total }].
function buildCommentDaily(comments) {
  if (!comments.length) return [];
  const dayKey = (ms) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  };
  const counts = new Map();
  let minMs = Infinity, maxMs = -Infinity;
  for (const c of comments) {
    const k = dayKey(c.timestampMs);
    if (!counts.has(k)) counts.set(k, { day: k, total: 0 });
    const row = counts.get(k);
    row[c.admin] = (row[c.admin] ?? 0) + 1;
    row.total += 1;
    if (c.timestampMs < minMs) minMs = c.timestampMs;
    if (c.timestampMs > maxMs) maxMs = c.timestampMs;
  }
  // Densify: emit one row per calendar day from min → max, fill missing admin
  // fields with 0. Without this, days with zero comments across all admins are
  // absent from the x-axis → lines look disconnected.
  const out = [];
  const start = new Date(minMs);
  const end = new Date(maxMs);
  // Clamp to UTC midnight so each iteration advances exactly one day.
  start.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(0, 0, 0, 0);
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const k = dayKey(t);
    const row = { day: k, total: 0 };
    for (const name of ADMIN_ORDER) row[name] = 0;
    const observed = counts.get(k);
    if (observed) {
      row.total = observed.total;
      for (const name of ADMIN_ORDER) {
        if (observed[name] != null) row[name] = observed[name];
      }
    }
    out.push(row);
  }
  return out;
}

export function KomentarAdmin() {
  const [raw, setRaw] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [activeAdmin, setActiveAdmin] = useState('all');
  const [activeAccount, setActiveAccount] = useState('all'); // 'all' | 'majangmejeng' | 'other'
  const [activePlatform, setActivePlatform] = useState('all'); // 'all' | 'instagram' | 'tiktok'
  const [activeMonth, setActiveMonth] = useState('all');
  const [activeGrowthAdmin, setActiveGrowthAdmin] = useState(null); // null = Gabungan
  const [expandedPosts, setExpandedPosts] = useState(new Set());

  // Fetch admin-comments.json once. Vite prebuild hook copies src/data/* to
  // public/data/* (see scripts/copy-data-to-public.mjs); deploy.mjs then lifts
  // the same files to the repo root for GH Pages.
  useEffect(() => {
    let cancelled = false;
    fetch(import.meta.env.BASE_URL + 'admin-comments.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setRaw(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Gagal memuat');
      });
    return () => { cancelled = true; };
  }, []);

  // Normalize + filter + sort. Single source of truth via lib helper.
  const comments = useMemo(() => (raw ? loadAdminComments(raw) : []), [raw]);

  // Per-admin totals (canonical 4-admin order).
  const adminKpi = useMemo(() => buildAdminKpi(comments), [comments]);

  // Monthly KPI rows, sorted month DESC then admin order.
  const monthlyKpi = useMemo(() => buildMonthlyKpi(comments), [comments]);

  // Distinct months (DESC) for the monthly KPI picker.
  const months = useMemo(() => listCommentMonths(comments), [comments]);

  // Daily-per-admin series for the growth chart (cumulative, no range filter —
  // comments dataset is small enough to always render full timeline).
  const dailySeries = useMemo(() => buildCommentDaily(comments), [comments]);

  // Filter comments for the per-post list. Posts section respects activeAdmin +
  // activeAccount + activePlatform + activeMonth filter; KPI tiles and monthly
  // table stay unfiltered (overview) unless the user explicitly clicks a chip.
  const filteredComments = useMemo(() => {
    return comments.filter((c) => {
      if (activeAdmin !== 'all' && c.admin !== activeAdmin) return false;
      if (activeAccount !== 'all') {
        const isMM = (c.accountSlug ?? '').toLowerCase().includes('majangmejeng');
        if (activeAccount === 'majangmejeng' && !isMM) return false;
        if (activeAccount === 'other' && isMM) return false;
      }
      if (activePlatform !== 'all' && c.platform !== activePlatform) return false;
      if (activeMonth !== 'all') {
        const d = new Date(c.timestampMs);
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        if (key !== activeMonth) return false;
      }
      return true;
    });
  }, [comments, activeAdmin, activeAccount, activePlatform, activeMonth]);

  // Group by post URL for the per-post list. Each entry capped to 10 samples.
  const postsByUrl = useMemo(() => groupByPost(filteredComments), [filteredComments]);
  const postList = useMemo(() => [...postsByUrl.entries()].sort((a, b) => {
    const aMax = Math.max(...a[1].map((c) => c.timestampMs));
    const bMax = Math.max(...b[1].map((c) => c.timestampMs));
    return bMax - aMax;
  }), [postsByUrl]);

  // Bar chart data: per-admin total comment count. `row.admin` (NOT `row.name`)
  // — earlier draft used `row.name` and the field was always undefined, which
  // bubbled to accentForAdmin(undefined) → ADMIN_ACCENTS[-1] → .hex crash.
  // REMOVED in V34.8: replaced with stacked "Komposisi Komentar per Admin"
  // using dailySeries directly (per-admin per-day breakdown).

  // Monthly KPI rows scoped to the selected month (or all if 'all').
  const monthlyKpiFiltered = useMemo(() => {
    if (activeMonth === 'all') return monthlyKpi;
    return monthlyKpi.filter((r) => r.monthKey === activeMonth);
  }, [monthlyKpi, activeMonth]);

  // Hero KPI strip values.
  const totalComments = adminKpi.reduce((s, r) => s + r.commentCount, 0);
  const ownPostCount = adminKpi.reduce((s, r) => s + r.ownPostCount, 0);
  const externalPostCount = adminKpi.reduce((s, r) => s + r.externalPostCount, 0);
  const activeAdminCount = adminKpi.filter((r) => r.commentCount > 0).length;

  function togglePostExpanded(url) {
    setExpandedPosts((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  // Loading + empty states.
  if (loadError) {
    return (
      <div className="surface p-4">
        <div className="flex items-center gap-2 mb-2">
          <MessageCircle className="w-3.5 h-3.5 text-accent-warning" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Komentar Admin</span>
        </div>
        <p className="text-sm text-text-muted">Gagal memuat data komentar: {loadError}</p>
      </div>
    );
  }

  if (!raw) {
    return (
      <div className="surface p-4">
        <div className="flex items-center gap-2 mb-2">
          <MessageCircle className="w-3.5 h-3.5 text-accent-warning" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Komentar Admin</span>
        </div>
        <p className="text-sm text-text-muted">Memuat data komentar...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Top strip — hero KPIs */}
      <div className="surface p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-accent-warning/10 text-accent-warning">
            <MessageCircle className="w-3.5 h-3.5" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Komentar Admin</span>
          <span className="ml-auto text-[10px] text-text-muted px-2 py-0.5 rounded-full bg-bg-tertiary">{comments.length} komentar</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-lg border border-border-subtle p-3 bg-bg-secondary/40">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Total Komentar</div>
            <div className="text-2xl font-bold text-text-primary tabular-nums">{formatNumber(totalComments)}</div>
          </div>
          <div className="rounded-lg border border-border-subtle p-3 bg-bg-secondary/40">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Post Sendiri</div>
            <div className="text-2xl font-bold text-accent-primary tabular-nums">{formatNumber(ownPostCount)}</div>
          </div>
          <div className="rounded-lg border border-border-subtle p-3 bg-bg-secondary/40">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Post Orang Lain</div>
            <div className="text-2xl font-bold text-accent-success tabular-nums">{formatNumber(externalPostCount)}</div>
          </div>
          <div className="rounded-lg border border-border-subtle p-3 bg-bg-secondary/40">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Admin Aktif</div>
            <div className="text-2xl font-bold text-accent-instagram tabular-nums">{activeAdminCount}/4</div>
          </div>
        </div>
      </div>

      {/* Per-admin KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {adminKpi.map((row) => {
          const accent = accentForAdmin(row.admin);
          return (
            <div key={row.admin} className="relative surface p-4 pt-5 overflow-hidden">
              <div className={`absolute top-0 left-0 right-0 h-0.5 ${accent.bar}`} aria-hidden="true" />
              <div className="flex items-center justify-between mb-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-text-primary truncate">{row.admin}</div>
                </div>
                <div className={`text-[10px] px-1.5 py-0.5 rounded border ${accent.chip}`}>
                  {row.commentCount > 0 ? 'Aktif' : 'Belum'}
                </div>
              </div>
              <div className="text-3xl font-bold text-text-primary tabular-nums mb-2">{formatNumber(row.commentCount)}</div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border-subtle text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-text-muted">Sendiri</div>
                  <div className="text-sm font-semibold text-text-primary tabular-nums">{row.ownPostCount}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-text-muted">Orang</div>
                  <div className="text-sm font-semibold text-text-primary tabular-nums">{row.externalPostCount}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Komposisi chart + Monthly KPI table (with month picker) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Stacked bar — Komposisi Komentar per Admin per hari. Mirrors
            Admin.jsx "Komposisi Post per Admin" pattern: stackId per admin,
            light custom tooltip, sortable legend with per-admin totals. */}
        <div className="surface p-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-accent-instagram/10 text-accent-instagram">
              <BarChart3 className="w-3.5 h-3.5" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Komposisi Komentar per Admin</span>
            <span className="ml-auto flex items-center gap-1.5 text-[10px] text-text-muted">
              <span className="tabular-nums px-2 py-0.5 rounded-full bg-bg-tertiary">
                <span className="text-text-primary font-semibold">{totalComments}</span> komentar
              </span>
              <span className="px-2 py-0.5 rounded-full bg-bg-tertiary">{dailySeries.length} hari</span>
            </span>
          </div>
          {dailySeries.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-text-muted">
              Belum ada data harian
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dailySeries} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
                    domain={[0, 'auto']}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--bg-tertiary)', opacity: 0.4 }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const day = label ?? '';
                      const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
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
                              const idx = ADMIN_ORDER.indexOf(it.name);
                              const accent = ADMIN_ACCENTS[idx >= 0 ? idx % ADMIN_ACCENTS.length : 0];
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
                  {ADMIN_ORDER.map((name, i) => {
                    const accent = ADMIN_ACCENTS[i % ADMIN_ACCENTS.length];
                    return (
                      <Bar
                        key={name}
                        dataKey={name}
                        name={name}
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

              {/* Legend + per-admin totals (matches Admin.jsx "Komposisi Post") */}
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                {ADMIN_ORDER.map((name, i) => {
                  const accent = ADMIN_ACCENTS[i % ADMIN_ACCENTS.length];
                  const total = adminKpi.find((r) => r.admin === name)?.commentCount ?? 0;
                  return (
                    <div key={name} className="inline-flex items-center gap-1.5 text-xs">
                      <span
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: accent.hex }}
                      />
                      <span className="text-text-secondary">{name}</span>
                      <span className="tabular-nums font-semibold text-text-primary">{total}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Monthly KPI table — mirrors Cross-Platform KPI table style */}
        <div className="surface p-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-accent-success/10 text-accent-success">
              <CalendarDays className="w-3.5 h-3.5" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">KPI Bulanan</span>
            {months.length > 0 && (
              <label className="ml-auto flex items-center gap-1.5">
                <span className="text-[10px] text-text-muted uppercase tracking-wider">Bulan:</span>
                <select
                  id="komentar-month-picker"
                  name="komentarMonth"
                  value={activeMonth}
                  onChange={(e) => setActiveMonth(e.target.value)}
                  className="bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-[10px] text-text-primary focus:outline-none focus:border-accent-primary"
                >
                  <option value="all">Semua</option>
                  {months.map((key) => (
                    <option key={key} value={key}>{monthLabel(key)}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-text-muted uppercase border-b border-border-subtle">
                  <th className="py-2 px-3 text-left font-medium">Bulan</th>
                  <th className="py-2 px-3 text-left font-medium">Admin</th>
                  <th className="py-2 px-3 text-right font-medium">Total</th>
                  <th className="py-2 px-3 text-right font-medium">Sendiri</th>
                  <th className="py-2 px-3 text-right font-medium">Orang</th>
                </tr>
              </thead>
              <tbody>
                {monthlyKpiFiltered.length === 0 ? (
                  <tr><td colSpan={5} className="py-3 px-3 text-center text-text-muted">Belum ada data</td></tr>
                ) : monthlyKpiFiltered.map((row) => {
                  const accent = accentForAdmin(row.admin);
                  return (
                    <tr key={`${row.monthKey}-${row.admin}`} className="border-b border-border-subtle/50 hover:bg-bg-tertiary/40 transition-colors">
                      <td className="py-2 px-3 text-text-secondary">{monthLabel(row.monthKey)}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accent.hex }} />
                          <span className="font-medium text-text-primary">{row.admin}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-accent-primary tabular-nums">{row.commentCount}</td>
                      <td className="py-2 px-3 text-right text-text-secondary tabular-nums">{row.ownPostCount}</td>
                      <td className="py-2 px-3 text-right text-text-secondary tabular-nums">{row.externalPostCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pertumbuhan chart — per-admin multi-line over time (mirrors Admin.jsx) */}
      <div className="surface p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-accent-primary/10 text-accent-primary">
            <TrendingUp className="w-3.5 h-3.5" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Pertumbuhan Harian</span>
          <span className="ml-auto text-[10px] text-text-muted tabular-nums px-2 py-0.5 rounded-full bg-bg-tertiary">{dailySeries.length} hari aktif</span>
        </div>

        {/* Tab strip: Gabungan + each admin. Click to drill down. */}
        <div className="flex items-center gap-1 mb-3 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveGrowthAdmin(null)}
            className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded transition-colors ${
              activeGrowthAdmin === null ? 'bg-accent-primary text-white' : 'bg-bg-tertiary text-text-muted hover:text-text-primary'
            }`}
          >
            Gabungan
          </button>
          {ADMIN_ORDER.map((name, i) => {
            const accent = ADMIN_ACCENTS[i % ADMIN_ACCENTS.length];
            const isActive = activeGrowthAdmin === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setActiveGrowthAdmin(isActive ? null : name)}
                className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded transition-colors inline-flex items-center gap-1.5 ${
                  isActive ? 'text-white' : 'text-text-muted hover:text-text-primary'
                }`}
                style={isActive ? { backgroundColor: accent.hex } : {}}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: isActive ? '#fff' : accent.hex }}
                />
                {name}
              </button>
            );
          })}
        </div>

        {dailySeries.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-sm text-text-muted">
            Belum ada data harian
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailySeries} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
              {ADMIN_ORDER.map((name, i) => {
                const accent = ADMIN_ACCENTS[i % ADMIN_ACCENTS.length];
                const isFocus = activeGrowthAdmin === name;
                const isFaded = activeGrowthAdmin !== null && !isFocus;
                return (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    name={name}
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
        )}
      </div>

      {/* Filters + per-post list */}
      <div className="surface p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Komentar per Post</span>
          <span className="text-[10px] text-text-muted">{postList.length} post • {filteredComments.length} komentar</span>
        </div>

        {/* Account filter — majangmejeng only vs all (admin marker per user 12 Aug: tracking
            from majangmejeng accounts specifically) */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          <button
            type="button"
            onClick={() => setActiveAccount('all')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
              activeAccount === 'all'
                ? 'bg-accent-primary text-white border-accent-primary'
                : 'bg-bg-secondary/40 text-text-secondary border-border-subtle hover:border-border-default'
            }`}
          >
            Semua Akun
          </button>
          <button
            type="button"
            onClick={() => setActiveAccount('majangmejeng')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
              activeAccount === 'majangmejeng'
                ? 'bg-accent-instagram text-white border-accent-instagram'
                : 'bg-accent-instagram/10 text-accent-instagram border-accent-instagram/30 hover:border-accent-instagram'
            }`}
          >
            Majangmejeng
          </button>
          <button
            type="button"
            onClick={() => setActiveAccount('other')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
              activeAccount === 'other'
                ? 'bg-bg-tertiary text-text-primary border-border-default'
                : 'bg-bg-secondary/40 text-text-secondary border-border-subtle hover:border-border-default'
            }`}
          >
            Akun Lain
          </button>
        </div>

        {/* Platform filter (TikTok / Instagram). Helps break down the
            majangmejeng admin-comment activity per social platform. */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          <button
            type="button"
            onClick={() => setActivePlatform('all')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
              activePlatform === 'all'
                ? 'bg-accent-primary text-white border-accent-primary'
                : 'bg-bg-secondary/40 text-text-secondary border-border-subtle hover:border-border-default'
            }`}
          >
            Semua Platform
          </button>
          <button
            type="button"
            onClick={() => setActivePlatform('instagram')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors inline-flex items-center gap-1.5 ${
              activePlatform === 'instagram'
                ? 'bg-pink-500 text-white border-pink-500'
                : 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/30 hover:border-pink-500'
            }`}
          >
            <Instagram className="w-3 h-3" />
            Instagram
          </button>
          <button
            type="button"
            onClick={() => setActivePlatform('tiktok')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors inline-flex items-center gap-1.5 ${
              activePlatform === 'tiktok'
                ? 'bg-cyan-500 text-white border-cyan-500'
                : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30 hover:border-cyan-500'
            }`}
          >
            <Music2 className="w-3 h-3" />
            TikTok
          </button>
        </div>

        {/* Admin filter tabs */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          <button
            type="button"
            onClick={() => setActiveAdmin('all')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
              activeAdmin === 'all'
                ? 'bg-accent-primary text-white border-accent-primary'
                : 'bg-bg-secondary/40 text-text-secondary border-border-subtle hover:border-border-default'
            }`}
          >
            Semua
          </button>
          {ADMIN_ORDER.map((name) => {
            const accent = accentForAdmin(name);
            const active = activeAdmin === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setActiveAdmin(name)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                  active ? `${accent.bar} text-white border-transparent` : `${accent.chip} hover:border-border-default`
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>

        {/* Month filter */}
        {months.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            <button
              type="button"
              onClick={() => setActiveMonth('all')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                activeMonth === 'all'
                  ? 'bg-bg-tertiary text-text-primary border-border-default'
                  : 'bg-bg-secondary/40 text-text-secondary border-border-subtle hover:border-border-default'
              }`}
            >
              Semua Bulan
            </button>
            {months.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveMonth(key)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                  activeMonth === key
                    ? 'bg-bg-tertiary text-text-primary border-border-default'
                    : 'bg-bg-secondary/40 text-text-secondary border-border-subtle hover:border-border-default'
                }`}
              >
                {monthLabel(key)}
              </button>
            ))}
          </div>
        )}

        {/* Post list */}
        {postList.length === 0 ? (
          <div className="py-8 text-center text-sm text-text-muted">
            Belum ada komentar dengan filter ini
          </div>
        ) : (
          <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
            {postList.map(([url, list]) => {
              const expanded = expandedPosts.has(url);
              const shown = expanded ? list : list.slice(0, SAMPLES_PER_POST);
              const latest = list[0];
              const ownCount = list.filter((c) => c.isOwnPost).length;
              const extCount = list.length - ownCount;
              return (
                <div key={url} className="rounded-lg border border-border-subtle bg-bg-secondary/40 p-3">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <PlatformBadge platform={latest.platform} />
                    <span className="text-[10px] text-text-muted">
                      {latest.postOwner ? `@${latest.postOwner}` : '—'}
                    </span>
                    <span className="text-xs font-medium text-text-primary tabular-nums">
                      {list.length} komentar
                    </span>
                    <span className="text-[10px] text-text-muted">
                      ({ownCount} sendiri, {extCount} orang lain)
                    </span>
                    <span className="text-[10px] text-text-muted ml-auto tabular-nums">
                      {shortDate(latest.timestampMs)} {shortTime(latest.timestampMs)} UTC
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {shown.map((c) => {
                      const accent = accentForAdmin(c.admin);
                      const preview = previewCommentText(c.commentText, 140);
                      return (
                        <div key={c.id} className="flex items-start gap-2 text-xs">
                          <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${accent.text}`}>
                            {c.admin}
                          </span>
                          <span className="text-text-primary break-words leading-relaxed">{preview}</span>
                        </div>
                      );
                    })}
                  </div>
                  {list.length > SAMPLES_PER_POST && (
                    <button
                      type="button"
                      onClick={() => togglePostExpanded(url)}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] text-accent-primary hover:underline"
                    >
                      {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      {expanded ? 'Sembunyikan' : `Lihat semua (${list.length})`}
                    </button>
                  )}
                  {url && (
                    <div className="mt-2">
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-accent-primary hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Buka post
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}