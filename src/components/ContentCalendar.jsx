// ContentCalendar — 4-week calendar grid with recommended posting slots
import { useMemo } from 'react';
import { Calendar, Sparkles, MapPin } from 'lucide-react';
import { contentCalendarRecommendation } from '../lib/analytics.js';

const DAY_LABELS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

// Type color map
const TYPE_COLORS = {
  REEL: 'bg-pink-500/20 text-pink-500 border-pink-500/30',
  VIDEO: 'bg-purple-500/20 text-purple-500 border-purple-500/30',
  IMAGE: 'bg-blue-500/20 text-blue-500 border-blue-500/30',
  CAROUSEL_ALBUM: 'bg-amber-500/20 text-amber-500 border-amber-500/30'
};

function build4WeekCalendar(recommendation, startDate = new Date()) {
  if (!recommendation?.slots || recommendation.slots.length === 0) {
    return { weeks: [], hasData: false };
  }
  // Use top 3 slots for highlighting
  const topSlots = recommendation.slots;

  const weeks = [];
  for (let w = 0; w < 4; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + (w * 7) + d);
      // Find matching recommended slot
      const slot = topSlots.find((s) => s.day === d);
      week.push({
        date,
        day: d,
        recommended: !!slot,
        hour: slot?.hour ?? null,
        mediaType: slot ? recommendation.mix?.dominant : null,
        dayName: DAY_LABELS_ID[d]
      });
    }
    weeks.push(week);
  }
  return { weeks, hasData: true, slots: topSlots, mix: recommendation.mix, frequency: recommendation.frequency };
}

export function ContentCalendar({ account, insights }) {
  const posts = account?.posts ?? [];
  const platform = account?.platform ?? 'instagram';
  const rec = useMemo(() => contentCalendarRecommendation(posts, platform), [posts, platform]);
  const calendar = useMemo(() => build4WeekCalendar(rec), [rec]);

  if (!calendar.hasData) {
    return (
      <div className="surface p-5">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-accent-primary" />
          Rekomendasi Kalender Konten
        </h3>
        <p className="text-sm text-text-muted">Belum cukup data historis untuk rekomendasi (perlu minimal 10 post).</p>
      </div>
    );
  }

  return (
    <div className="surface p-5">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-accent-primary" />
        Rekomendasi Kalender Konten (4 Minggu ke Depan)
      </h3>

      <div className="flex items-center gap-2 mb-3 text-xs text-text-muted flex-wrap">
        <span>Slot terbaik:</span>
        {calendar.slots.map((s, i) => (
          <span key={i} className="chip bg-accent-primary/10 text-accent-primary">
            {s.dayName} {s.hour}:00
          </span>
        ))}
        <span className="ml-auto">Target: <span className="font-semibold text-text-primary">{calendar.frequency} post/minggu</span></span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {calendar.weeks.map((week, wi) => (
          <div key={wi} className="surface p-2 bg-bg-tertiary/30">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Minggu {wi + 1}</div>
            <div className="space-y-1">
              {week.map((day) => (
                <div
                  key={day.day}
                  className={`flex items-center gap-1.5 text-[11px] p-1.5 rounded border ${
                    day.recommended
                      ? 'bg-accent-primary/10 border-accent-primary/30'
                      : 'bg-bg-primary/30 border-border-subtle'
                  }`}
                >
                  <div className="w-7 text-center text-text-muted font-semibold">{day.dayName}</div>
                  <div className="flex-1 text-text-secondary">{day.date.getDate()}</div>
                  {day.recommended ? (
                    <div className="flex items-center gap-1">
                      <span className={`chip text-[9px] px-1 py-0 border ${TYPE_COLORS[day.mediaType] ?? ''}`}>{day.mediaType?.slice(0, 3)}</span>
                      <span className="text-accent-primary font-semibold text-[10px]">{day.hour}:00</span>
                    </div>
                  ) : (
                    <span className="text-text-muted text-[9px]">—</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {calendar.mix?.dominant && (
        <div className="mt-3 surface p-2 bg-bg-tertiary/30 text-xs text-text-secondary flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-accent-warning" />
          Format dominan: <span className="font-semibold text-text-primary">{calendar.mix.dominant}</span>
          {' '}— fokuskan slot rekomendasi ke format ini
        </div>
      )}
    </div>
  );
}
