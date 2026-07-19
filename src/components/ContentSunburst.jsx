// ContentSunburst — concentric donut chart: outer ring = platform, inner = media type
// Custom SVG (no recharts) for full control over animation + lightweight
import { useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import { PlatformIcon, platformLabel } from './icons/PlatformIcon.jsx';
import { formatCompact } from '../lib/format.js';

const PLATFORM_COLORS = {
  instagram: '#E1306C',
  tiktok: '#00f2ea'
};

// V11: professional palette — pink (REEL IG), violet (VIDEO), blue (IMAGE),
// amber (CAROUSEL), slate (OTHER). Less saturated than V10's neon mix.
const MEDIA_COLORS = {
  REEL: '#ec4899',
  VIDEO: '#8b5cf6',
  IMAGE: '#3b82f6',
  CAROUSEL_ALBUM: '#f59e0b',
  OTHER: '#64748b'
};

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

  // V22.1: shrunk to 180x180 so it fits in col-4 bento without bleeding
  // into CombinedHeatmap (which now lives in the same "Konten & Timing"
  // section at col-8). Scale ratio 0.82 of previous (220→180).
  const cx = 90;
  const cy = 90;
  const rOuter = 82;
  const rMiddle = 49;
  const rInner = 23;

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
      color: PLATFORM_COLORS[platform.name] ?? '#6b7280'
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
        color: MEDIA_COLORS[type] ?? '#6b7280'
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
      <div className="flex items-center justify-center gap-4 flex-wrap">
        <div className="relative" style={{ width: 180, height: 180 }}>
          <svg width={180} height={180} viewBox="0 0 180 180" className="overflow-visible">
            {slices.map((s, i) => {
              const isPlatform = s.type === 'platform';
              const path = describeArc(
                cx, cy,
                isPlatform ? rOuter : rMiddle,
                isPlatform ? rMiddle : rInner,
                s.startAngle, s.endAngle
              );
              return (
                <path
                  key={i}
                  d={path}
                  fill={s.color}
                  stroke="var(--bg-secondary)"
                  strokeWidth={1.5}
                  opacity={hover && hover.name !== s.name ? 0.4 : 1}
                  className="transition-opacity cursor-pointer"
                  onMouseEnter={() => setHover(s)}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })}
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="fill-text-primary font-bold" style={{ fontSize: 16 }}>
              {formatCompact(total)}
            </text>
            <text x={cx} y={cy + 14} textAnchor="middle" dominantBaseline="central" className="fill-text-muted" style={{ fontSize: 8 }}>
              TOTAL
            </text>
          </svg>
        </div>
        <div className="flex-1 min-w-0 max-w-xs space-y-3 text-xs">
          {byPlatform.map((platform) => (
            <div key={platform.name}>
              <div className="flex items-center gap-2 mb-1.5">
                <PlatformIcon platform={platform.name} className="w-3.5 h-3.5" />
                <span className="font-semibold text-text-primary uppercase tracking-wider">
                  {platformLabel(platform.name)}
                </span>
                <span className="text-text-muted ml-auto tabular-nums">{formatCompact(platform.count)} ({Math.round(platform.count / total * 100)}%)</span>
              </div>
              <div className="space-y-1 pl-5">
                {[...platform.types.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                  <div key={type} className="flex items-center gap-1.5 text-[11px]">
                    <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: MEDIA_COLORS[type] ?? '#64748b' }} />
                    <span className="text-text-secondary flex-1">{type}</span>
                    <span className="text-text-muted tabular-nums">{formatCompact(count)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {hover && (
            <div className="surface p-2 text-text-secondary">
              <div className="font-semibold text-text-primary">{hover.name}</div>
              <div className="text-[10px] uppercase tracking-wider">
                {formatCompact(hover.count)} posts ({Math.round(hover.count / total * 100)}%)
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
