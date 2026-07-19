// V21: /calendar — Content calendar (monthly heatmap of post frequency).
// Color-coded by post count per day. Click day to see posts.
import { useState, useMemo } from 'react';
import { useAccounts } from '../hooks/useAccount.js';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { ProxiedAvatar } from '../components/ProxiedAvatar.jsx';
import { PlatformIcon } from '../components/icons/PlatformIcon.jsx';
import { formatCompact } from '../lib/format.js';

const MONTH_NAMES_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const DAY_NAMES_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export default function Calendar() {
  const accounts = useAccounts();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(null);

  // Build per-day map { yyyy-mm-dd: { count, posts[] } }
  const postsByDay = useMemo(() => {
    const map = new Map();
    for (const a of accounts) {
      for (const p of a.posts ?? []) {
        const t = Number(p.createTime ?? 0);
        if (t <= 0) continue;
        const d = new Date(t > 1e12 ? t : t * 1000);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!map.has(key)) map.set(key, { count: 0, posts: [] });
        const entry = map.get(key);
        entry.count++;
        entry.posts.push({ ...p, _account: a });
      }
    }
    return map;
  }, [accounts]);

  const grid = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay(); // 0=Sun
    const days = [];
    // Pad start with prev-month days
    for (let i = 0; i < startDow; i++) {
      const d = new Date(year, month, -startDow + i + 1);
      days.push({ date: d, current: false });
    }
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), current: true });
    }
    // Pad end to fill 6 weeks
    while (days.length < 42) {
      const last = days[days.length - 1].date;
      const d = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
      days.push({ date: d, current: false });
    }
    return days;
  }, [cursor]);

  const maxCount = useMemo(() => {
    let max = 0;
    for (const v of postsByDay.values()) max = Math.max(max, v.count);
    return max;
  }, [postsByDay]);

  const cellColor = (count) => {
    if (count === 0) return 'bg-bg-tertiary/30';
    const intensity = Math.min(1, count / Math.max(1, maxCount));
    if (intensity > 0.7) return 'bg-accent-primary/80 text-white';
    if (intensity > 0.4) return 'bg-accent-primary/50';
    if (intensity > 0.15) return 'bg-accent-primary/30';
    return 'bg-accent-primary/15';
  };

  const formatKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const selectedPosts = selectedDay ? postsByDay.get(formatKey(selectedDay))?.posts ?? [] : [];

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Kalender Konten</h1>
        <p className="text-sm text-text-muted mt-0.5">Heatmap post bulanan lintas 9 akun</p>
      </div>

      <div className="surface p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            aria-label="Bulan sebelumnya"
            className="btn-secondary !p-2">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-lg font-bold text-text-primary">
            {MONTH_NAMES_ID[cursor.getMonth()]} {cursor.getFullYear()}
          </h2>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            aria-label="Bulan berikutnya"
            className="btn-secondary !p-2">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_NAMES_ID.map((d) => (
            <div key={d} className="text-[10px] font-semibold text-text-muted uppercase tracking-wider text-center py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-1">
          {grid.map(({ date, current }, i) => {
            const key = formatKey(date);
            const entry = postsByDay.get(key);
            const count = entry?.count ?? 0;
            const isToday = new Date().toDateString() === date.toDateString();
            const isSelected = selectedDay && formatKey(selectedDay) === key;
            return (
              <button
                key={i}
                onClick={() => count > 0 && setSelectedDay(date)}
                disabled={count === 0}
                aria-label={`${date.toLocaleDateString('id-ID')} · ${count} post`}
                className={`
                  aspect-square rounded text-[10px] font-semibold tabular-nums
                  flex flex-col items-center justify-center
                  transition-colors
                  ${cellColor(count)}
                  ${current ? 'text-text-primary' : 'text-text-muted/40'}
                  ${isToday ? 'ring-1 ring-accent-primary' : ''}
                  ${isSelected ? 'ring-2 ring-accent-primary' : ''}
                  ${count > 0 ? 'hover:bg-accent-primary/30 cursor-pointer' : 'cursor-default'}
                `}
              >
                <span>{date.getDate()}</span>
                {count > 0 && <span className="text-[8px] opacity-80 mt-0.5">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 mt-3 text-[10px] text-text-muted">
          <span>Sedikit</span>
          <div className="flex gap-0.5">
            <div className="w-3 h-3 rounded bg-accent-primary/15" />
            <div className="w-3 h-3 rounded bg-accent-primary/30" />
            <div className="w-3 h-3 rounded bg-accent-primary/50" />
            <div className="w-3 h-3 rounded bg-accent-primary/80" />
          </div>
          <span>Banyak</span>
        </div>
      </div>

      {/* Selected day panel */}
      {selectedDay && (
        <div className="surface p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">
              {selectedDay.toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            </h3>
            <button onClick={() => setSelectedDay(null)} aria-label="Tutup" className="text-text-muted hover:text-text-primary">
              ✕
            </button>
          </div>
          {selectedPosts.length === 0 ? (
            <EmptyState title="Tidak ada post" />
          ) : (
            <div className="space-y-2">
              {selectedPosts.map((p) => (
                <div key={p.id} className="flex items-start gap-3 p-2 rounded hover:bg-bg-tertiary/40">
                  <ProxiedAvatar account={p._account} size={28} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-xs text-text-muted">
                      <span className="font-semibold text-text-secondary">@{p._accountUsername}</span>
                      <PlatformIcon platform={p._accountPlatform} className="w-3 h-3" />
                    </div>
                    <p className="text-sm text-text-primary line-clamp-1 mt-0.5">{p.caption || '(tanpa caption)'}</p>
                    <div className="text-[10px] text-text-muted mt-0.5">
                      {formatCompact(p.likeCount)} likes · {formatCompact(p.viewCount)} views
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
