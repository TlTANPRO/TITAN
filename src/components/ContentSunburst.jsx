// ContentSunburst — concentric donut chart: outer ring = platform, inner = media type
// Custom SVG (no recharts) for full control over animation + lightweight
import { useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import { PlatformIcon, platformLabel } from './icons/PlatformIcon.jsx';
import { formatCompact } from '../lib/format.js';

// V24.2: OKLCH colors via CSS custom properties (theme-aware).
// Falls back to oklch() at component level if var() not available.
const PLATFORM_COLORS = {
  instagram: 'oklch(0.58 0.22 0)',
  tiktok: 'oklch(0.88 0.18 195)'
};

// V24.2: oklch() perceptual palette (V11 visual = OKLCH conversion of same hues)
const MEDIA_COLORS = {
  REEL: 'oklch(0.65 0.22 350)',         // pink
  VIDEO: 'oklch(0.58 0.22 280)',        // violet
  IMAGE: 'oklch(0.65 0.20 250)',        // blue
  CAROUSEL_ALBUM: 'oklch(0.75 0.16 75)',// amber
  OTHER: 'oklch(0.50 0.005 280)'        // slate
};
const FALLBACK = 'oklch(0.50 0.005 280)';

function buildSunburstData(accounts) {
  const byPlatform = new Map();
  for (const acc of accounts) {
    const platform = acc.platform;
    if (!byPlatform.has(platform)) byPlatform.set(platform, { name: platform, count: 0, types: new Map() });
    const platformEntry = byPlatform.get(platform);
    for (const p of acc.posts ?? []) {
      const t = p.mediaType ?? 'OTHER';
      platformEntry.count++;
      platformEntry.types.set(t, (platformEntry.types.get(t) ?? 0) + 1);
    }
  }
  const total = [...byPlatform.values()].reduce((s, p) => s + p.count, 0);
  return { byPlatform: [...byPlatform.values()], total };
}

function polar(cx, cy, r, angleRad) {
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeArc(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const start = polar(cx, cy, rOuter, startAngle);
  const end = polar(cx, cy, rOuter, endAngle);
  const startInner = polar(cx, cy, rInner, endAngle);
  const endInner = polar(cx, cy, rInner, startAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    'M', start.x, start.y,
    'A', rOuter, rOuter, 0, largeArc, 1, end.x, end.y,
    'L', startInner.x, startInner.y,
    'A', rInner, rInner, 0, largeArc, 0, endInner.x, endInner.y,
    'Z'
  ].join(' ');
}

export function ContentSunburst({ accounts }) {
  const { byPlatform, total } = useMemo(() => buildSunburstData(accounts), [accounts]);
  const [hover, setHover] = useState(null);

  if (total === 0) {
    return (
      <div className="surface p-6 text-center text-text-muted text-sm">
        Belum ada data konten.
      </div>
    );
  }

  // V25.9: donut layout — 60% inner radius, strokeless segments
  // (V23 no-shadow rule applied to chart borders too), center label
  // shows total + dominant platform (V23 display-md pattern).
  const cx = 90;
  const cy = 90;
  const rOuter = 84;
  const rInner = 50;   // 60% ratio → true donut
  const donutHole = 32;

  // Find dominant platform for center label
  const dominant = byPlatform.reduce((a, b) => (b.count > a.count ? b : a), byPlatform[0]);
  const dominantLabel = dominant ? platformLabel(dominant.name) : '—';
  const dominantPct = dominant ? Math.round((dominant.count / total) * 100) : 0;

  // Calculate angles
  let accAngle = -Math.PI / 2; // start at 12 o'clock
  const slices = [];
  for (const platform of byPlatform) {
    const platformStart = accAngle;
    const platformArc = (platform.count / total) * Math.PI * 2;
    const platformEnd = platformStart + platformArc;
    slices.push({
      type: 'platform',
      name: platform.name,
      count: platform.count,
      startAngle: platformStart,
      endAngle: platformEnd,
      color: PLATFORM_COLORS[platform.name] ?? FALLBACK
    });
    // Inner: media type breakdown within platform
    let typeAcc = platformStart;
    const platformTotal = platform.count;
    const sortedTypes = [...platform.types.entries()].sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sortedTypes) {
      const typeArc = (count / platformTotal) * platformArc;
      slices.push({
        type: 'media',
        platform: platform.name,
        name: type,
        count,
        startAngle: typeAcc,
        endAngle: typeAcc + typeArc,
        color: MEDIA_COLORS[type] ?? FALLBACK
      });
      typeAcc += typeArc;
    }
    accAngle = platformEnd;
  }

  return (
    <div className="surface p-5">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4 flex items-center gap-2">
        <Layers className="w-4 h-4 text-accent-primary" />
        Komposisi Konten
      </h3>
      <div className="flex flex-col items-center gap-4">
        <div className="relative" style={{ width: 180, height: 180 }}>
          <svg width={180} height={180} viewBox="0 0 180 180">
            {slices.map((s, i) => {
              const isPlatform = s.type === 'platform';
              const path = describeArc(
                cx, cy,
                isPlatform ? rOuter : rInner,
                isPlatform ? rInner : donutHole,
                s.startAngle, s.endAngle
              );
              const isHover = hover?.name === s.name;
              return (
                <path
                  key={i}
                  d={path}
                  fill={s.color}
                  fillOpacity={hover ? (isHover ? 0.95 : 0.5) : 0.85}
                  className="cursor-pointer"
                  style={{ transition: 'fill-opacity 120ms ease-out' }}
                  onMouseEnter={() => setHover(s)}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })}
            {/* V25.9: center label — total + dominant platform (V23 display-md) */}
            <text
              x={cx} y={cy - 4}
              textAnchor="middle" dominantBaseline="central"
              className="fill-text-primary tabular-nums"
              style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}
            >
              {formatCompact(total)}
            </text>
            <text
              x={cx} y={cy + 14}
              textAnchor="middle" dominantBaseline="central"
              className="fill-text-muted"
              style={{ fontSize: 8, letterSpacing: '0.08em' }}
            >
              {hover
                ? `${hover.name} · ${Math.round((hover.count / total) * 100)}%`
                : `${dominantLabel} ${dominantPct}%`
              }
            </text>
          </svg>
        </div>
        {/* V25.9: legend below the chart — more compact on mobile, no side bleed */}
        <div className="w-full space-y-2 text-xs">
          {byPlatform.map((platform) => (
            <div key={platform.name}>
              <div className="flex items-center gap-2 mb-1">
                <PlatformIcon platform={platform.name} className="w-3.5 h-3.5" />
                <span className="font-semibold text-text-primary uppercase tracking-wider">
                  {platformLabel(platform.name)}
                </span>
                <span className="text-text-muted ml-auto tabular-nums">
                  {formatCompact(platform.count)} ({Math.round(platform.count / total * 100)}%)
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 pl-5">
                {[...platform.types.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                  <div key={type} className="flex items-center gap-1.5 text-[11px]">
                    <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: MEDIA_COLORS[type] ?? FALLBACK }} />
                    <span className="text-text-secondary">{type}</span>
                    <span className="text-text-muted tabular-nums">{formatCompact(count)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
