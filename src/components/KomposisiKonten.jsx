// KomposisiKonten — V27.5 modern diagram + full TABLE view
// Replaces the ContentSunburst donut in Home. Modern horizontal stacked bar
// (single accent per platform + media type inside) + a complete breakdown
// table for users who want the exact numbers.
//
// Design follows V23 hard NO list: no font-bold, no hover:scale, no shadows,
// token-based colors only, surface ladder.
import { useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import { PlatformIcon, platformLabel } from './icons/PlatformIcon.jsx';
import { formatCompact, formatNumber } from '../lib/format.js';

const PLATFORM_COLORS = {
  instagram: 'oklch(0.58 0.22 0)',
  tiktok: 'oklch(0.88 0.18 195)'
};
const MEDIA_COLORS = {
  REEL: 'oklch(0.65 0.22 350)',         // pink
  VIDEO: 'oklch(0.58 0.22 280)',        // violet
  IMAGE: 'oklch(0.65 0.20 250)',        // blue
  CAROUSEL_ALBUM: 'oklch(0.75 0.16 75)',// amber
  OTHER: 'oklch(0.50 0.005 280)'        // slate
};
const MEDIA_LABELS = {
  REEL: 'Reels',
  VIDEO: 'Video',
  IMAGE: 'Foto',
  CAROUSEL_ALBUM: 'Carousel',
  OTHER: 'Lainnya'
};
const FALLBACK = 'oklch(0.50 0.005 280)';

function buildKomposisi(accounts) {
  const rows = [];
  const grandTotal = accounts.reduce((s, a) => s + (a.posts?.length ?? 0), 0);
  for (const acc of accounts) {
    const platform = acc.platform;
    const types = new Map();
    for (const p of acc.posts ?? []) {
      const t = p.mediaType ?? 'OTHER';
      types.set(t, (types.get(t) ?? 0) + 1);
    }
    const accountTotal = [...types.values()].reduce((s, v) => s + v, 0);
    rows.push({
      slug: acc.slug,
      username: acc.username,
      platform,
      types: [...types.entries()].sort((a, b) => b[1] - a[1]),
      total: accountTotal
    });
  }
  rows.sort((a, b) => b.total - a.total);
  return { rows, grandTotal };
}

export function KomposisiKonten({ accounts }) {
  const { rows, grandTotal } = useMemo(() => buildKomposisi(accounts), [accounts]);
  const [view, setView] = useState('chart'); // 'chart' | 'table'

  if (grandTotal === 0) {
    return (
      <div className="surface p-6 text-center text-text-muted text-sm">
        Belum ada data konten.
      </div>
    );
  }

  // Aggregate per platform for the platform-level summary
  const platformAgg = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.platform)) map.set(r.platform, { name: r.platform, count: 0, types: new Map() });
      const entry = map.get(r.platform);
      entry.count += r.total;
      for (const [t, c] of r.types) entry.types.set(t, (entry.types.get(t) ?? 0) + c);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [rows]);

  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Layers className="w-4 h-4 text-accent-primary" />
          Komposisi Konten
        </h3>
        {/* V27.5: tab switcher chart / table */}
        <div className="flex items-center gap-1 surface p-0.5 bg-bg-tertiary/40">
          <ViewTab active={view === 'chart'} onClick={() => setView('chart')} label="Chart" />
          <ViewTab active={view === 'table'} onClick={() => setView('table')} label="Tabel" />
        </div>
      </div>

      {view === 'chart' ? (
        <div className="space-y-4">
          {/* Platform-level stacked bar */}
          <div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Per Platform</div>
            <div className="h-8 bg-bg-tertiary rounded-md overflow-hidden flex">
              {platformAgg.map((p) => {
                const pct = (p.count / grandTotal) * 100;
                if (pct < 0.5) return null;
                return (
                  <div
                    key={p.name}
                    className="h-full flex items-center justify-center text-[10px] font-semibold text-white tabular-nums"
                    style={{ width: `${pct}%`, minWidth: '2.5rem', backgroundColor: PLATFORM_COLORS[p.name] ?? FALLBACK }}
                    title={`${platformLabel(p.name)} · ${formatNumber(p.count)} (${pct.toFixed(1)}%)`}
                  >
                    {pct >= 8 ? `${pct.toFixed(0)}%` : ''}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Per-account horizontal bars (one per account, stacked by media type) */}
          <div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Per Akun (Top {Math.min(rows.length, 9)})</div>
            <div className="space-y-1.5">
              {rows.slice(0, 9).map((r) => (
                <div key={r.slug} className="flex items-center gap-2">
                  <div className="w-24 flex items-center gap-1.5 flex-shrink-0">
                    <PlatformIcon platform={r.platform} className="w-3 h-3 flex-shrink-0" />
                    <span className="text-xs text-text-secondary truncate">@{r.username}</span>
                  </div>
                  <div className="flex-1 h-5 bg-bg-tertiary rounded overflow-hidden flex">
                    {r.types.map(([type, count]) => {
                      const pct = (count / r.total) * 100;
                      if (pct < 1) return null;
                      return (
                        <div
                          key={type}
                          className="h-full flex items-center justify-center text-[9px] font-semibold text-white tabular-nums"
                          style={{ width: `${pct}%`, minWidth: '1.5rem', backgroundColor: MEDIA_COLORS[type] ?? FALLBACK }}
                          title={`${MEDIA_LABELS[type] ?? type} · ${count} (${pct.toFixed(1)}%)`}
                        >
                          {pct >= 12 ? `${pct.toFixed(0)}%` : ''}
                        </div>
                      );
                    })}
                  </div>
                  <span className="text-[10px] text-text-muted tabular-nums w-12 text-right flex-shrink-0">
                    {formatCompact(r.total)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="pt-3 border-t border-border-subtle flex flex-wrap gap-x-3 gap-y-1.5">
            {Object.entries(MEDIA_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center gap-1.5 text-[11px]">
                <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: MEDIA_COLORS[key] ?? FALLBACK }} />
                <span className="text-text-secondary">{label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // V27.5: full TABLE view — exact numbers per account × media type
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="text-text-muted">
                <th className="text-left font-semibold uppercase tracking-wider py-1.5 pr-2">Akun</th>
                <th className="text-left font-semibold uppercase tracking-wider py-1.5 pr-2">Platform</th>
                {Object.entries(MEDIA_LABELS).map(([k, l]) => (
                  <th key={k} className="text-right font-semibold uppercase tracking-wider py-1.5 px-1.5">{l}</th>
                ))}
                <th className="text-right font-semibold uppercase tracking-wider py-1.5 pl-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.slug} className="border-t border-border-subtle">
                  <td className="py-1.5 pr-2 text-text-primary font-medium">@{r.username}</td>
                  <td className="py-1.5 pr-2">
                    <span className="inline-flex items-center gap-1 text-text-secondary">
                      <PlatformIcon platform={r.platform} className="w-3 h-3" />
                      {platformLabel(r.platform)}
                    </span>
                  </td>
                  {Object.keys(MEDIA_LABELS).map((k) => {
                    const v = r.types.find(([t]) => t === k)?.[1] ?? 0;
                    const pct = r.total > 0 ? (v / r.total) * 100 : 0;
                    return (
                      <td key={k} className="py-1.5 px-1.5 text-right">
                        {v > 0 ? (
                          <span className="text-text-primary">{v} <span className="text-text-muted">({pct.toFixed(0)}%)</span></span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-1.5 pl-2 text-right font-semibold text-text-primary">{r.total}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border-default">
                <td className="py-2 pr-2 font-semibold text-text-primary" colSpan={2}>Total Lintas Akun</td>
                {Object.keys(MEDIA_LABELS).map((k) => {
                  const total = rows.reduce((s, r) => s + (r.types.find(([t]) => t === k)?.[1] ?? 0), 0);
                  const pct = grandTotal > 0 ? (total / grandTotal) * 100 : 0;
                  return (
                    <td key={k} className="py-2 px-1.5 text-right font-semibold text-text-primary">
                      {formatNumber(total)} <span className="text-text-muted font-normal">({pct.toFixed(0)}%)</span>
                    </td>
                  );
                })}
                <td className="py-2 pl-2 text-right font-semibold text-accent-primary">{formatNumber(grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ViewTab({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider rounded transition-colors ${
        active
          ? 'bg-bg-primary text-text-primary'
          : 'text-text-muted hover:text-text-primary'
      }`}
    >
      {label}
    </button>
  );
}
