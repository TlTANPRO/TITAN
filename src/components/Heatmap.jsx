// Heatmap — per-account 7×24 best-time heatmap.
// V22: rotated to vertical (24 hour-rows × 7 day-columns) for consistency
// with CombinedHeatmap. Each cell shows post count + avg likes on hover.
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LABELS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export default function Heatmap({ bestTime }) {
  if (!bestTime) return null;
  const { heatmap, topWindows } = bestTime;
  const max = Math.max(...heatmap.map((c) => c.avgLikes), 1);
  // Build lookup by [day][hour] for transposed render
  const cell = (d, h) => heatmap.find((c) => c.day === d && c.hour === h) || { avgLikes: 0, postCount: 0 };

  const intensity = (val) => {
    if (val === 0) return 'bg-bg-tertiary';
    const pct = val / max;
    if (pct >= 0.75) return 'bg-accent-success';
    if (pct >= 0.5) return 'bg-accent-success/60';
    if (pct >= 0.3) return 'bg-accent-success/30';
    if (pct >= 0.1) return 'bg-accent-success/15';
    return 'bg-accent-success/5';
  };

  return (
    <div className="surface p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-1">Best Time to Post</h3>
      <p className="text-xs text-text-muted mb-4">Heatmap 7×24 — semakin hijau, semakin tinggi rata-rata likes</p>

      <div className="flex gap-1.5">
        {/* Hour labels (left column) */}
        <div className="flex flex-col gap-1 pt-5 flex-shrink-0">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="h-3.5 text-[9px] text-text-muted tabular-nums text-right pr-0.5 leading-none">
              {h % 3 === 0 ? h : ''}
            </div>
          ))}
        </div>

        {/* Day columns × hour rows */}
        <div className="flex-1 min-w-0">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAY_LABELS_ID.map((d) => (
              <div key={d} className="text-center text-[10px] text-text-muted font-medium uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1">
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} className="grid grid-cols-7 gap-1">
                {Array.from({ length: 7 }, (_, day) => {
                  const c = cell(day, hour);
                  return (
                    <div
                      key={day}
                      title={`${DAY_NAMES[day]} ${hour}:00 — ${c.postCount} post, avg ${Math.round(c.avgLikes)} likes`}
                      className={`h-3.5 rounded-sm ${intensity(c.avgLikes)} transition-all hover:ring-1 hover:ring-white/30 cursor-default`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {topWindows?.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border-subtle">
          <div className="text-xs text-text-muted uppercase tracking-wider mb-2">Top 3 posting windows</div>
          <div className="flex flex-wrap gap-2">
            {topWindows.map((w, i) => (
              <div key={i} className="chip bg-accent-success/10 text-accent-success">
                {w.dayName} {String(w.hour).padStart(2, '0')}:00 · {Math.round(w.avgLikes)} avg likes
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
