// CombinedHeatmap — 7×24 heatmap aggregating posts from all 9 accounts
// V22: rotated to vertical (24 rows × 7 columns) so it fits in narrow bento
// cards (col-4 ~300-400px wide). Day names are column headers, hour labels
// are row labels, and the time-of-day flows top-to-bottom — natural reading
// direction for "best hour" scan.
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

  // Find top 3 windows to highlight as recommendations
  const topWindows = useMemo(() => {
    const all = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        if (counts[d][h] >= 2 && grid[d][h] > 0) {
          all.push({ d, h, v: grid[d][h], c: counts[d][h] });
        }
      }
    }
    return all.sort((a, b) => b.v - a.v).slice(0, 3);
  }, [grid, counts]);

  return (
    <div className="surface p-4">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-accent-primary" />
        Waktu Posting Terbaik
      </h3>

      <div className="flex gap-1.5">
        {/* Hour labels (left column) */}
        <div className="flex flex-col gap-1 pt-4 flex-shrink-0">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="h-3.5 text-[9px] text-text-muted tabular-nums text-right pr-0.5 leading-none">
              {h % 3 === 0 ? h : ''}
            </div>
          ))}
        </div>

        {/* Grid: 7 day-columns, 24 hour-rows */}
        <div className="flex-1 min-w-0">
          {/* Day column headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAY_LABELS.map((d) => (
              <div key={d} className="text-center text-[10px] text-text-muted font-medium uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {/* Hour rows × day cells */}
          <div className="flex flex-col gap-1">
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} className="grid grid-cols-7 gap-1">
                {DAY_LABELS.map((_, day) => {
                  const value = grid[day][hour];
                  const count = counts[day][hour];
                  const isTop = topWindows.some((w) => w.d === day && w.h === hour);
                  return (
                    <div
                      key={day}
                      className="h-3.5 rounded-sm cursor-pointer transition-transform hover:scale-125"
                      style={{
                        backgroundColor: `rgba(236, 72, 153, ${cellOpacity(value)})`,
                        border: isTop ? '1px solid rgb(236, 72, 153)' : '1px solid var(--border-subtle)'
                      }}
                      onMouseEnter={() => setHover({ day, hour, value, count })}
                      onMouseLeave={() => setHover(null)}
                      title={`${DAY_LABELS[day]} ${hour.toString().padStart(2, '0')}:00 — ${count} post, avg ${Math.round(value)} engagement`}
                      aria-label={`${DAY_LABELS[day]} ${hour}:00, ${count} post`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {hover && (
        <div className="mt-3 surface p-2 text-xs text-text-secondary inline-block">
          <span className="font-semibold text-text-primary">{DAY_LABELS[hover.day]} {hover.hour.toString().padStart(2, '0')}:00</span>
          <span className="text-text-muted ml-2">{hover.count} post · avg {Math.round(hover.value)} engagement</span>
        </div>
      )}

      {topWindows.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border-subtle">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Top 3 window</div>
          <div className="flex flex-wrap gap-1.5">
            {topWindows.map((w) => (
              <div key={`${w.d}-${w.h}`} className="text-[10px] px-1.5 py-0.5 rounded bg-accent-primary/10 text-accent-primary border border-accent-primary/30">
                {DAY_LABELS[w.d]} {String(w.h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
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
