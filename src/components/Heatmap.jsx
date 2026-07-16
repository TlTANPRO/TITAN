const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Heatmap({ bestTime }) {
  if (!bestTime) return null;
  const { heatmap, topWindows } = bestTime;
  // heatmap is flat array: 7*24 = 168 cells
  const max = Math.max(...heatmap.map((c) => c.avgLikes), 1);
  const grid = Array.from({ length: 7 }, (_, d) =>
    heatmap.filter((c) => c.day === d).sort((a, b) => a.hour - b.hour)
  );

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
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <div className="flex mb-1">
            <div className="w-12 flex-shrink-0" />
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="flex-1 text-center text-[10px] text-text-muted">{h}</div>
            ))}
          </div>
          {grid.map((row, d) => (
            <div key={d} className="flex items-center mb-1">
              <div className="w-12 flex-shrink-0 text-[10px] text-text-muted font-medium">{DAY_NAMES[d]}</div>
              {row.map((cell) => (
                <div
                  key={cell.hour}
                  title={`${DAY_NAMES[d]} ${cell.hour}:00 — ${cell.postCount} post, avg ${Math.round(cell.avgLikes)} likes`}
                  className={`flex-1 h-6 mx-px rounded-sm ${intensity(cell.avgLikes)} transition-all hover:ring-1 hover:ring-white/30 cursor-default`}
                />
              ))}
            </div>
          ))}
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
