// CombinedHeatmap — V22.1 reverted to landscape 7×24 (day rows × hour cols).
// flex-1 cells auto-distribute across container width. Placed in dedicated
// "Konten & Timing" section (col-8) so 24 hour cells have ~22-44px width.
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
    <div className="surface p-5">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-accent-primary" />
        Waktu Posting Terbaik <span className="text-text-muted normal-case font-normal">· Gabungan 9 Akun</span>
      </h3>

      <div>
        {/* Hour labels (top row) */}
        <div className="flex gap-1 mb-1 pl-10">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="flex-1 text-center text-[9px] text-text-muted tabular-nums">
              {h % 3 === 0 ? h : ''}
            </div>
          ))}
        </div>

        {/* Day rows × hour cells */}
        {DAY_LABELS.map((dayLabel, day) => (
          <div key={day} className="flex gap-1 items-center mb-1">
            <div className="w-10 text-[10px] text-text-muted font-medium uppercase tracking-wider flex-shrink-0">{dayLabel}</div>
            {Array.from({ length: 24 }, (_, hour) => {
              const value = grid[day][hour];
              const count = counts[day][hour];
              const isTop = topWindows.some((w) => w.d === day && w.h === hour);
              return (
                <div
                  key={hour}
                  className="flex-1 h-5 rounded-sm cursor-pointer transition-transform hover:scale-125"
                  style={{
                    backgroundColor: `rgba(236, 72, 153, ${cellOpacity(value)})`,
                    border: isTop ? '1.5px solid rgb(236, 72, 153)' : '1px solid var(--border-subtle)'
                  }}
                  onMouseEnter={() => setHover({ day, hour, value, count })}
                  onMouseLeave={() => setHover(null)}
                  title={`${dayLabel} ${hour.toString().padStart(2, '0')}:00 — ${count} post, avg ${Math.round(value)} engagement`}
                  aria-label={`${dayLabel} ${hour}:00, ${count} post`}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border-subtle flex-wrap gap-2">
        {topWindows.length > 0 ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-text-muted uppercase tracking-wider">Top 3:</span>
            {topWindows.map((w) => (
              <div key={`${w.d}-${w.h}`} className="text-[10px] px-1.5 py-0.5 rounded bg-accent-primary/10 text-accent-primary border border-accent-primary/30">
                {DAY_LABELS[w.d]} {String(w.h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
        ) : <div />}

        {hover && (
          <div className="text-xs text-text-secondary">
            <span className="font-semibold text-text-primary">{DAY_LABELS[hover.day]} {hover.hour.toString().padStart(2, '0')}:00</span>
            <span className="text-text-muted ml-1.5">{hover.count} post · avg {Math.round(hover.value)}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-[10px] text-text-muted ml-auto">
          <span>Less</span>
          {[0.15, 0.3, 0.5, 0.7, 0.9].map((o) => (
            <div key={o} className="w-2.5 h-2.5 rounded" style={{ backgroundColor: `rgba(236, 72, 153, ${o})` }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
