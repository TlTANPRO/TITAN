// V21: /calendar — Content calendar (monthly heatmap of post frequency).
// V34.12 CR-1: multi-hue — Instagram = pink, TikTok = cyan. Cell picks dominant
// platform per day. Hover splits IG/TT counts.
// Click day to see posts.
import { useState, useMemo } from 'react';
import { useAccounts } from '../hooks/useAccount.js';
import { ChevronLeft, ChevronRight, Calendar as CalIcon } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { PulseBar } from '../components/ui/PulseBar.jsx';
import { ProxiedAvatar } from '../components/ProxiedAvatar.jsx';
import { PlatformIcon } from '../components/icons/PlatformIcon.jsx';
import { formatCompact } from '../lib/format.js';
import { MONTH_NAMES_ID, DAY_NAMES_SHORT } from '../lib/titan-tokens.js';

// V34.12: per-platform hue. IG = accent.instagram (#E1306C), TT = accent.tiktok (#00f2ea).
// Both tokens already defined in tailwind.config.js — no new palette entries.
const PLATFORM_HUE = {
  instagram: {
    name: 'Instagram',
    // V37.1: teks eksplisit per-shade agar kontras ≥4.5 di semua intensitas
    shades: ['bg-accent-instagram/15 text-text-primary', 'bg-accent-instagram/40 text-text-primary', 'bg-accent-instagram/65 text-white', 'bg-accent-instagram/90 text-white']
  },
  tiktok: {
    name: 'TikTok',
    shades: ['bg-accent-tiktok/15 text-text-primary', 'bg-accent-tiktok/40 text-text-primary', 'bg-accent-tiktok/65 text-text-primary', 'bg-accent-tiktok/90 text-text-primary']
  }
};

function dominantPlatform(byPlatform) {
  // Return the platform with higher count, ties go to instagram first.
  if ((byPlatform.instagram ?? 0) >= (byPlatform.tiktok ?? 0)) return 'instagram';
  return 'tiktok';
}

export default function Calendar() {
  const accounts = useAccounts();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(null);

  // Build per-day map { yyyy-mm-dd: { count, byPlatform:{instagram,tiktok}, posts[] } }
  const postsByDay = useMemo(() => {
    const map = new Map();
    for (const a of accounts) {
      for (const p of a.posts ?? []) {
        const t = Number(p.createTime ?? 0);
        if (t <= 0) continue;
        const d = new Date(t > 1e12 ? t : t * 1000);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!map.has(key)) {
          map.set(key, { count: 0, byPlatform: { instagram: 0, tiktok: 0 }, posts: [] });
        }
        const entry = map.get(key);
        entry.count++;
        entry.posts.push({ ...p, _account: a });
        if (a.platform === 'instagram' || a.platform === 'tiktok') {
          entry.byPlatform[a.platform] = (entry.byPlatform[a.platform] ?? 0) + 1;
        }
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

  // Max per-platform, used to scale intensity.
  const maxByPlatform = useMemo(() => {
    const m = { instagram: 0, tiktok: 0 };
    for (const v of postsByDay.values()) {
      m.instagram = Math.max(m.instagram, v.byPlatform.instagram ?? 0);
      m.tiktok = Math.max(m.tiktok, v.byPlatform.tiktok ?? 0);
    }
    return m;
  }, [postsByDay]);

  const cellColor = (entry) => {
    if (!entry || entry.count === 0) return 'bg-bg-tertiary/30';
    const platform = dominantPlatform(entry.byPlatform);
    const hue = PLATFORM_HUE[platform];
    const platformCount = entry.byPlatform[platform] ?? 0;
    const platformMax = Math.max(1, maxByPlatform[platform]);
    const intensity = Math.min(1, platformCount / platformMax);
    if (intensity > 0.7) return hue.shades[3];
    if (intensity > 0.4) return hue.shades[2];
    if (intensity > 0.15) return hue.shades[1];
    return hue.shades[0];
  };

  const formatKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const selectedPosts = selectedDay ? postsByDay.get(formatKey(selectedDay))?.posts ?? [] : [];

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <PageHeader
        icon={CalIcon}
        title="Kalender Konten"
        subtitle="Heatmap post bulanan lintas 9 akun"
      />

      <PulseBar />

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
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { setCursor(new Date()); setSelectedDay(null); }}
              className="btn-ghost !px-2.5 !py-1 text-[11px]"
              aria-label="Hari ini — Kembali ke bulan ini"
            >
              Hari ini
            </button>
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              aria-label="Bulan berikutnya"
              className="btn-secondary !p-2">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_NAMES_SHORT.map((d) => (
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
                aria-label={`${date.getDate()} ${date.toLocaleDateString('id-ID')} · ${count} post`}
                className={`
                  aspect-square rounded text-[10px] font-semibold tabular-nums
                  flex flex-col items-center justify-center
                  transition-colors
                  ${cellColor(entry)}
                  ${current ? '' : 'opacity-60'}
                  ${isToday ? 'ring-1 ring-accent-primary' : ''}
                  ${isSelected ? 'ring-2 ring-accent-primary' : ''}
                  ${count > 0 ? 'cursor-pointer' : 'cursor-default'}
                `}
              >
                <span>{date.getDate()}</span>
                {count > 0 && <span className="text-[8px] mt-0.5 font-semibold">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Legend — V34.12 multi-hue per platform */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 text-[10px] text-text-muted">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-accent-instagram">IG</span>
            <div className="flex gap-0.5">
              <div className="w-3 h-3 rounded bg-accent-instagram/15" />
              <div className="w-3 h-3 rounded bg-accent-instagram/40" />
              <div className="w-3 h-3 rounded bg-accent-instagram/65" />
              <div className="w-3 h-3 rounded bg-accent-instagram/90" />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-accent-tiktok">TT</span>
            <div className="flex gap-0.5">
              <div className="w-3 h-3 rounded bg-accent-tiktok/15" />
              <div className="w-3 h-3 rounded bg-accent-tiktok/40" />
              <div className="w-3 h-3 rounded bg-accent-tiktok/65" />
              <div className="w-3 h-3 rounded bg-accent-tiktok/90" />
            </div>
          </div>
          <span className="opacity-100">Sedikit ← → Banyak</span>
        </div>
      </div>

      {/* Selected day panel */}
      {selectedDay && (
        <div className="surface p-4">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-sm font-semibold text-text-primary">
                {selectedDay.toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
              </h3>
              {postsByDay.get(formatKey(selectedDay))?.byPlatform && (
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-semibold bg-accent-instagram/15 text-accent-instagram border border-accent-instagram/30">
                    IG {postsByDay.get(formatKey(selectedDay)).byPlatform.instagram ?? 0}
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-semibold bg-accent-tiktok/15 text-accent-tiktok border border-accent-tiktok/30">
                    TT {postsByDay.get(formatKey(selectedDay)).byPlatform.tiktok ?? 0}
                  </span>
                </div>
              )}
            </div>
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
