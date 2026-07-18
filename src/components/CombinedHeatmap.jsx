// CombinedHeatmap — 7×24 heatmap aggregating posts from all 9 accounts
// Hover cell shows count + avg views (if available)
import { useMemo, useState } from 'react';
import { Calendar } from 'lucide-react';

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function buildHeatmap(accounts) {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const views = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const counts = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const acc of accounts) {
    for (const p of acc.posts ?? []) {
      if (p.createTime <= 0) continue;
      const d = new Date(p.createTime * 1000);
      const day = d.getDay();
      const hour = d.getHours();
      grid[day][hour] += p.likeCount + p.commentCount;
      views[day][hour] += p.viewCount ?? 0;
      counts[day][hour] += 1;
    }
  }
  // average per cell
  const flat = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (counts[d][h] > 0) {
        grid[d][h] = grid[d][h] / counts[d][h];
        views[d][h] = views[d][h] / counts[d][h];
        flat.push(grid[d][h]);
      }
    }
  }
  return { grid, views, counts, max: flat.length > 0 ? Math.max(...flat) : 0 };
}

export function CombinedHeatmap({ accounts }) {
  const { grid, counts, max } = useMemo(() => buildHeatmap(accounts), [accounts]);
  const [hover, setHover] = useState(null);

  const cellOpacity = (value) => {
    if (max === 0 || value === 0) return 0.04;
    return Math.max(0.15, value / max);
  };

  return (
    <div className="surface p-5">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-accent-primary" />
        Waktu Posting Terbaik (Gabungan 9 Akun)
      </h3>
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <div className="flex gap-1 mb-1 pl-10">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="w-6 text-center text-[9px] text-text-muted tabular-nums">
                {h % 3 === 0 ? h : ''}
              </div>
            ))}
          </div>
          {DAY_LABELS.map((dayLabel, day) => (
            <div key={day} className="flex gap-1 items-center mb-1">
              <div className="w-10 text-[10px] text-text-muted font-medium uppercase tracking-wider">{dayLabel}</div>
              {Array.from({ length: 24 }, (_, hour) => {
                const value = grid[day][hour];
                const count = counts[day][hour];
                return (
                  <div
                    key={hour}
                    className="w-6 h-6 rounded cursor-pointer transition-transform hover:scale-125"
                    style={{
                      backgroundColor: `rgba(236, 72, 153, ${cellOpacity(value)})`,
                      border: '1px solid var(--border-subtle)'
                    }}
                    onMouseEnter={() => setHover({ day, hour, value, count })}
                    onMouseLeave={() => setHover(null)}
                    title={`${dayLabel} ${hour}:00 — ${count} post, avg ${Math.round(value)} engagement`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {hover && (
        <div className="mt-3 surface p-2 text-xs text-text-secondary inline-block">
          <span className="font-semibold text-text-primary">{DAY_LABELS[hover.day]} {hover.hour.toString().padStart(2, '0')}:00</span>
          <span className="text-text-muted ml-2">{hover.count} post · avg {Math.round(hover.value)} engagement</span>
        </div>
      )}
      <div className="flex items-center gap-2 mt-3 text-[10px] text-text-muted">
        <span>Less</span>
        {[0.15, 0.3, 0.5, 0.7, 0.9].map((o) => (
          <div key={o} className="w-3 h-3 rounded" style={{ backgroundColor: `rgba(236, 72, 153, ${o})` }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
