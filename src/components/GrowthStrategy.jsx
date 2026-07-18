// GrowthStrategy — projection chart + 10+ tactical recommendations + AI insight
// V11: 10+ recs, AI prefix replaced with platform-anchored label, Y-axis
// domain auto for chart stability when ER has wide range.
import { useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine
} from 'recharts';
import { TrendingUp, Target, CheckCircle2, Bot } from 'lucide-react';
import { formatPercent } from '../lib/format.js';
import { performanceByMonth } from '../lib/analytics.js';
import { getInsight } from '../lib/insights.js';
import { platformLabel } from './icons/PlatformIcon.jsx';

function projectER(posts, followerCount, months = 6) {
  const monthly = performanceByMonth(posts, followerCount);
  if (monthly.length < 3) return [];
  // Take last 3 months as basis. Coerce each er to finite number —
  // null/undefined/NaN would propagate as <polyline points="0,NaN">
  const recent = monthly.slice(-3).map((m) => Number.isFinite(m.er) ? m.er : 0);
  const avg = recent.reduce((s, v) => s + v, 0) / recent.length;
  const slope = recent.length >= 2 && Number.isFinite(recent[recent.length - 1] - recent[0])
    ? (recent[recent.length - 1] - recent[0]) / (recent.length - 1)
    : 0;
  const safeAvg = Number.isFinite(avg) ? avg : 0;
  const safeSlope = Number.isFinite(slope) ? slope : 0;
  const projection = [];
  let current = safeAvg;
  for (let i = 1; i <= months; i++) {
    current = Math.max(0, current + safeSlope);
    projection.push({ month: `+${i}mo`, projected: Math.round(current * 100) / 100, baseline: Math.round(safeAvg * 100) / 100 });
  }
  return projection;
}

function generateRecommendations(insights, account) {
  const recs = [];
  const platform = account?.platform ?? 'instagram';
  const cadence = insights?.postingCadence;
  const mix = insights?.contentMix;
  const hooks = insights?.hookClassification ?? {};
  const pillars = insights?.contentPillars ?? [];
  const outliers = insights?.outlierPosts ?? [];
  const lastViral = insights?.lastViral;
  const velocity = insights?.growthVelocity;
  const bench = insights?.benchmark;

  // 1. Posting frequency
  if (cadence) {
    if (cadence.avgGapDays > 7) {
      recs.push({
        title: 'Tingkatkan frekuensi posting',
        detail: `Saat ini rata-rata jeda ${cadence.avgGapDays.toFixed(1)} hari. Target ideal untuk ${platformLabel(platform)}: 3-4 posting per minggu (jeda 2-3 hari).`
      });
    } else if (cadence.avgGapDays < 1) {
      recs.push({
        title: 'Kurangi frekuensi, fokus kualitas',
        detail: `Rata-rata jeda ${cadence.avgGapDays.toFixed(2)} hari (sangat sering). Pastikan setiap post punya value kuat — hindari burnout algoritma.`
      });
    } else {
      recs.push({
        title: 'Pertahankan ritme posting',
        detail: `Jeda rata-rata ${cadence.avgGapDays.toFixed(1)} hari sudah sehat. Tingkatkan sedikit ke 2-3 hari untuk maintain momentum.`
      });
    }
  }

  // 2. Best time
  const bestTime = insights?.bestTimeOfDay;
  if (bestTime?.topHour != null) {
    const dayName = bestTime.topDayName ?? 'hari tertentu';
    recs.push({
      title: `Post di jam ${bestTime.topHour}:00 WIB pada ${dayName}`,
      detail: `Waktu posting dengan rata-rata performa tertinggi. Kombinasikan dengan kalender konten mingguan.`
    });
  }

  // 3. Content mix
  if (mix?.counts) {
    const topType = Object.entries(mix.counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (topType) {
      recs.push({
        title: `Pertahankan dominasi ${topType}`,
        detail: `Format ini paling banyak dipublikasi dan punya engagement terbaik untuk akun Anda.`
      });
    }
  }

  // 4. Engagement gap
  if (bench?.erGap != null && bench.erGap < 0) {
    recs.push({
      title: 'Tingkatkan engagement rate',
      detail: `ER Anda di bawah benchmark (${formatPercent(Math.abs(bench.erGap))} gap). Coba caption dengan pertanyaan, hook 3 detik pertama, dan CTA yang jelas.`
    });
  }

  // 5. Outliers
  if (outliers.length > 0) {
    recs.push({
      title: `Duplikasi pola ${outliers.length} post outlier`,
      detail: `Post dengan performa > 2σ di atas rata-rata punya formula yang bisa direplikasi — cek "Resep Post Viral" section untuk detail.`
    });
  }

  // 6. Diversifikasi format
  const mixTypes = mix?.counts ? Object.keys(mix.counts).filter((k) => mix.counts[k] > 0).length : 0;
  if (mixTypes < 3) {
    recs.push({
      title: 'Diversifikasi format konten',
      detail: `Saat ini baru ${mixTypes} format. Tambah 1-2 format lain (misal Reel/foto/carousel) untuk hindari audience fatigue.`
    });
  }

  // 7. Caption with question
  if ((hooks.question ?? 0) === 0) {
    recs.push({
      title: 'Tambah pertanyaan di caption',
      detail: 'Caption tanpa pertanyaan dapat 30-50% lebih sedikit komentar. Sisipkan 1 pertanyaan ringan di tiap post.'
    });
  }

  // 8. Last viral age
  if (lastViral?.days != null && lastViral.days > 14) {
    recs.push({
      title: 'Buat post breakout dalam 1-2 minggu',
      detail: `${lastViral.days} hari sejak post viral terakhir — momentum sedang turun. Replikasi formula outlier untuk akuisisi reach organik baru.`
    });
  }

  // 9. Cadence score
  if ((cadence?.score ?? 0) < 50) {
    recs.push({
      title: 'Stabilkan jadwal posting',
      detail: `Skor konsistensi ${cadence?.score ?? 0}/100. Pilih 2-3 hari tetap per minggu (misal Senin-Kamis-Sabtu) supaya audiens antisipasi.`
    });
  }

  // 10. Platform-specific
  if (platform === 'tiktok') {
    recs.push({
      title: 'TikTok: 1 post/hari selama 2 minggu',
      detail: 'Algoritma TT rewarding posting harian — coba 1×/hari selama 2 minggu, ukur dampaknya ke viewCount & like.'
    });
  } else if (platform === 'instagram') {
    const reelPct = mix?.counts?.REEL && mix?.percentages?.REEL ? mix.percentages.REEL : 0;
    if (reelPct < 30) {
      recs.push({
        title: 'Naikkan proporsi Reel ke ≥30%',
        detail: `Reel sekarang ${Math.round(reelPct)}%. IG 2026 memberi reach 2-3× lebih besar ke Reel vs foto.`
      });
    }
  }

  // 11. Top pillar
  if (pillars[0]) {
    recs.push({
      title: `Perdalam pillar "${pillars[0].pillar}"`,
      detail: `Pillar TF-IDF terkuat. Eksplorasi istilah turunan: ${(pillars[0].relatedTerms ?? []).slice(0, 3).join(', ') || 'variasi tema'}.`
    });
  }

  // 12. Growth velocity
  if (velocity?.trend === 'down') {
    recs.push({
      title: 'Reset strategi pertumbuhan',
      detail: `Tren ER turun (slope ${(velocity.slope ?? 0).toFixed(3)}). Eksperimen 3 format/hook baru selama 2 minggu, ukur, double-down yang terbaik.`
    });
  } else if (velocity?.trend === 'up') {
    recs.push({
      title: 'Momentum naik — pertahankan',
      detail: `Tren ER naik (slope ${(velocity.slope ?? 0).toFixed(3)}). Jangan ubah strategi signifikan, cukup optimize jam & caption.`
    });
  }

  // Fallback
  if (recs.length === 0) {
    recs.push({
      title: 'Pertahankan momentum',
      detail: 'Pertahankan konsistensi posting dan monitor tren mingguan.'
    });
  }

  return recs.slice(0, 12);
}

export function GrowthStrategy({ insights, account }) {
  const projection = useMemo(() => projectER(account?.posts ?? [], account?.followerCount ?? 0, 6), [account]);
  const recs = useMemo(() => generateRecommendations(insights, account), [insights, account]);
  const velocity = insights?.growthVelocity;
  const slug = account?.slug ?? account?.account?.slug;
  const aiText = slug ? getInsight(slug, 'growthStrategy') : null;

  if (projection.length === 0) {
    return (
      <div className="surface p-5">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-accent-success" />
          Strategi Pertumbuhan
        </h3>
        <p className="text-sm text-text-muted">Diperlukan minimal 3 bulan data historis untuk proyeksi.</p>
      </div>
    );
  }

  return (
    <div className="surface p-5">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-accent-success" />
        Strategi Pertumbuhan (3-6 Bulan)
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Projection chart — V11: domain auto so wide ER ranges don't crush low values */}
        <div>
          <div className="text-xs text-text-muted mb-2 flex items-center gap-2">
            <Target className="w-3.5 h-3.5" />
            Proyeksi ER — 6 bulan ke depan (linear extrapolation)
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={projection} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.4} />
              <XAxis dataKey="month" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
              <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} domain={['auto', 'auto']} allowDataOverflow={false} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'var(--text-primary)' }}
                formatter={(v) => formatPercent(v, 2)}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <ReferenceLine y={projection[0]?.baseline} stroke="var(--text-muted)" strokeDasharray="3 3" label={{ value: 'Baseline', fontSize: 9, position: 'insideTopRight', fill: 'var(--text-muted)' }} />
              <Line type="monotone" dataKey="projected" name="Proyeksi ER" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="baseline" name="Baseline" stroke="#6b7280" strokeWidth={1} strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
          {velocity?.trend && (
            <div className="text-[10px] text-text-muted text-center mt-1">
              Tren saat ini: {velocity.trend === 'up' ? '↑ Naik' : velocity.trend === 'down' ? '↓ Turun' : '→ Stabil'} · slope {velocity.slope?.toFixed(3) ?? 0}/bulan
            </div>
          )}
        </div>

        {/* Recommendations */}
        <div>
          <div className="text-xs text-text-muted mb-2 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {recs.length} Rekomendasi Taktis (Next 90 Hari)
          </div>
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {recs.map((r, i) => (
              <div key={i} className="surface p-3 bg-bg-tertiary/40">
                <div className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-accent-primary text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  {r.title}
                </div>
                <div className="text-xs text-text-secondary leading-relaxed">{r.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI insight (pre-generated) */}
      {aiText && (
        <div className="surface p-3 mt-4 border border-accent-primary/30 bg-accent-primary/5">
          <div className="flex items-center gap-2 text-xs font-semibold text-accent-primary uppercase tracking-wider mb-2">
            <Bot className="w-3.5 h-3.5" />
            {platformLabel(account?.platform)} Insight — Proyeksi & Taktik 3-6 Bulan
          </div>
          <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">{aiText}</p>
        </div>
      )}
    </div>
  );
}
