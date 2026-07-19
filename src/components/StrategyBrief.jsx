// StrategyBrief — 1-page summary (SWOT + 10+ Action Plan)
// V11: drop "AI Strategy Brief" label (use platform-anchored), expand action
// plan to 10+ actionable items from multiple primitives.
// V25.7: removed Bot icon (AI symbol), font-bold → font-semibold, SWOT colors
// migrated from raw Tailwind (emerald/rose/sky/amber) to semantic tokens.
import { useMemo } from 'react';
import { FileText, ArrowUp, ArrowDown, Plus, AlertTriangle, Target, Sparkles } from 'lucide-react';
import { formatPercent, formatNumber } from '../lib/format.js';
import { accountHealthScore, timeSinceLastViral, outlierPosts } from '../lib/analytics.js';
import { getInsight } from '../lib/insights.js';
import { platformLabel } from './icons/PlatformIcon.jsx';

function buildSwot(account, insights) {
  const posts = account?.posts ?? [];
  const platform = account?.platform ?? 'instagram';
  const health = accountHealthScore(account);
  const lastViral = timeSinceLastViral(posts);
  const outliers = outlierPosts(posts);

  // Strengths
  const strengths = [];
  if (insights?.aggregates?.engagementRate > 3) {
    strengths.push(`ER ${formatPercent(insights.aggregates.engagementRate)} — di atas rata-rata industri (3%)`);
  }
  if (outliers.length > 0) {
    strengths.push(`${outliers.length} post outlier (>2σ) — formula konten yang terbukti berhasil`);
  }
  if (insights?.postingCadence?.score >= 70) {
    strengths.push(`Konsistensi posting tinggi (skor ${insights.postingCadence.score}/100)`);
  }
  if (account?.followerCount > 5000) {
    strengths.push(`${formatNumber(account.followerCount)} pengikut — basis audiens solid`);
  }
  if (strengths.length === 0) strengths.push('Memiliki akun aktif dengan portofolio posting');

  // Weaknesses
  const weaknesses = [];
  if (insights?.aggregates?.engagementRate < 2) {
    weaknesses.push(`ER ${formatPercent(insights.aggregates.engagementRate)} — di bawah benchmark industri (3%)`);
  }
  if (health.breakdown?.consistency < 50) {
    weaknesses.push('Pola posting tidak konsisten (jeda antar post bervariasi)');
  }
  if (insights?.availability && !insights.availability.likes) {
    weaknesses.push('Data like/komentar tidak tersedia — perlu enrichment IG untuk analisis lengkap');
  }
  if (weaknesses.length === 0) weaknesses.push('Tidak ada kelemahan utama terdeteksi');

  // Opportunities
  const opportunities = [];
  if (lastViral?.days != null && lastViral.days > 14) {
    opportunities.push(`Sudah ${lastViral.days} hari sejak post viral terakhir — buat konten breakout dalam 1-2 minggu ke depan`);
  }
  if (insights?.contentMix?.counts) {
    const sorted = Object.entries(insights.contentMix.counts).sort((a, b) => b[1] - a[1]);
    if (sorted.length >= 2 && sorted[0][1] / sorted[1][1] > 3) {
      opportunities.push(`Diversifikasi format — saat ini ${sorted[0][0]} dominan ${Math.round(sorted[0][1] / (posts.length || 1) * 100)}%, coba campur ${sorted[1][0]}`);
    }
  }
  if (insights?.bestTimeOfDay?.topHour != null) {
    opportunities.push(`Eksploitasi jam prime time ${insights.bestTimeOfDay.topHour}:00 WIB — konsistensi di slot ini terbukti performa terbaik`);
  }
  if (opportunities.length === 0) opportunities.push('Ekspansi ke platform sekunder (jika hanya IG, coba TT)');

  // Threats
  const threats = [];
  if (health.breakdown?.growth < 40) {
    threats.push('Tren pertumbuhan flat/down — perlu strategi re-engagement');
  }
  if (posts.length < 50) {
    threats.push('Jumlah post rendah — algoritma kurang signal, tambah volume posting');
  }
  if (platform === 'instagram' && insights?.availability && !insights.availability.likes) {
    threats.push('Tanpa enrichment IG, ER tidak bisa dihitung akurat — kompetitor mungkin punya data lebih');
  }
  if (threats.length === 0) threats.push('Tidak ada ancaman kritis terdeteksi');

  return { strengths, weaknesses, opportunities, threats, health, lastViral, outliers };
}

function buildActionPlan(account, insights, swot) {
  const actions = [];
  const cadence = insights?.postingCadence;
  const mix = insights?.contentMix;
  const hooks = insights?.hookClassification ?? {};
  const pillars = insights?.contentPillars ?? [];
  const outliers = insights?.outlierPosts ?? swot.outliers;
  const lastViral = insights?.lastViral ?? swot.lastViral;
  const velocity = insights?.growthVelocity;
  const bench = insights?.benchmark;
  const platform = account?.platform ?? 'instagram';

  // 1. Best time
  if (insights?.bestTimeOfDay?.topHour != null) {
    actions.push(`Post 3×/minggu di jam ${insights.bestTimeOfDay.topHour}:00 WIB (${insights.bestTimeOfDay.topDayName ?? 'hari terbaik'})`);
  }
  // 2. Replicate outliers
  if (outliers.length > 0) {
    actions.push(`Replikasi formula ${outliers.length} post outlier — cek "Resep Post Viral" untuk detail`);
  }
  // 3. Maintain dominant format
  if (mix?.counts) {
    const sorted = Object.entries(mix.counts).sort((a, b) => b[1] - a[1]);
    if (sorted[0]) actions.push(`Pertahankan format ${sorted[0][0]} sebagai andalan, tambahkan variasi caption`);
  }
  // 4. Cadence
  if (cadence?.avgGapDays > 7) {
    actions.push(`Tingkatkan frekuensi ke 3-4 post/minggu — saat ini jeda rata-rata ${cadence.avgGapDays.toFixed(1)} hari`);
  }
  // 5. IG enrichment
  if (account?.platform === 'instagram' && insights?.availability && !insights.availability.likes) {
    actions.push('Jalankan ulang scraper setelah token reset untuk enrich data like/comment');
  }
  // 6. Diversify format
  const mixTypes = mix?.counts ? Object.keys(mix.counts).filter((k) => mix.counts[k] > 0).length : 0;
  if (mixTypes < 3) {
    actions.push('Diversifikasi format: tambah Reels/carousel untuk jangkau audiens baru');
  }
  // 7. Caption with question
  if ((hooks.question ?? 0) === 0) {
    actions.push('Sisipkan 1 pertanyaan di setiap caption — picu komentar & DM');
  }
  // 8. CTA
  if ((hooks.cta ?? 0) === 0) {
    actions.push('Tambah call-to-action (save/share/comment) di tiap post');
  }
  // 9. Top pillar
  if (pillars[0]) {
    actions.push(`Perdalam pillar "${pillars[0].pillar}" — eksplorasi istilah turunan ${(pillars[0].relatedTerms ?? []).slice(0, 2).join(', ')}`);
  }
  // 10. Last viral reactivation
  if (lastViral?.days != null && lastViral.days > 14) {
    actions.push('Replikasi formula post viral terakhir untuk akuisisi momentum baru');
  }
  // 11. Growth velocity
  if (velocity?.trend === 'down') {
    actions.push('Reset strategi: eksperimen 3 format baru selama 2 minggu, ukur ER');
  }
  // 12. Top hashtag combo
  if (insights?.topHashtags?.[0]) {
    const tags = insights.topHashtags.slice(0, 3).map((t) => `#${t.tag}`).join(' ');
    actions.push(`Gunakan combo hashtag konsisten: ${tags}`);
  }
  // 13. Cross-platform
  if (platform === 'instagram') {
    actions.push('Cross-post 1 konten terbaik ke TikTok untuk jangkau audiens baru');
  }
  // 14. Reply to comments
  if ((insights?.aggregates?.avgCommentCount ?? 0) > 0) {
    actions.push('Balas komentar dalam 1 jam pertama — sinyal kuat untuk algoritma');
  }
  // 15. Benchmark
  if (bench?.engagementRateComparison === 'below') {
    actions.push('Audit 10 post terakhir — cari pola yang bisa di-replikasi untuk naik ke benchmark');
  }

  // Pad to 10+ if shorter
  if (actions.length < 10) {
    const padding = [
      'Monitor performa mingguan dan adjust strategi berdasarkan tren ER',
      'A/B test 2 hook berbeda di post berikutnya',
      'Cross-promote antara Instagram dan TikTok untuk sinergi audiens',
      'Coba 1 kolaborasi dengan akun sejenis bulan ini',
      'Tambahkan emoji + hashtag niche di caption untuk discoverability'
    ];
    for (const p of padding) {
      if (actions.length >= 12) break;
      if (!actions.includes(p)) actions.push(p);
    }
  }

  return actions.slice(0, 12);
}

export function StrategyBrief({ account, insights }) {
  const swot = useMemo(() => buildSwot(account, insights), [account, insights]);
  const actions = useMemo(() => buildActionPlan(account, insights, swot), [account, insights, swot]);
  const slug = account?.slug ?? account?.account?.slug;
  const aiText = slug ? getInsight(slug, 'strategyBrief') : null;
  const hasAi = Boolean(aiText);

  return (
    <div className="surface p-5 bg-gradient-to-br from-bg-secondary to-bg-tertiary">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <FileText className="w-4 h-4 text-accent-primary" />
          Strategy Brief — @{account?.username}
        </h3>
        <span className="text-[10px] text-text-muted flex items-center gap-1">
          {hasAi ? (
            <>
              <Sparkles className="w-3 h-3 text-accent-primary" />
              Pre-generated insight (tersimpan lokal)
            </>
          ) : (
            'Auto-generated (analytics-only) · lihat detail per-akun di tab Pola & Waktu'
          )}
        </span>
      </div>

      {hasAi ? (
        // Pre-generated text mode — show insight text + action plan from analytics
        <div className="space-y-4">
          <div className="surface p-4 bg-bg-primary/50 border border-accent-primary/30">
            <div className="text-xs text-accent-primary uppercase tracking-wider font-semibold mb-2 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              {platformLabel(account?.platform)} Insight — Strategy Brief
            </div>
            <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">{aiText}</p>
          </div>
          <div className="surface p-4 bg-bg-primary/50">
            <div className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-2 flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-accent-primary" />
              {actions.length} Action Plan (30 Hari ke Depan)
            </div>
            <ol className="space-y-1.5 text-sm text-text-primary">
              {actions.map((a, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-accent-primary text-white text-[10px] font-semibold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-text-secondary">{a}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : (
        // Analytics-only mode — show auto-SWOT grid
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <SwotBox type="strength" title="Strengths" items={swot.strengths} color="success" />
            <SwotBox type="weakness" title="Weaknesses" items={swot.weaknesses} color="danger" />
            <SwotBox type="opportunity" title="Opportunities" items={swot.opportunities} color="info" />
            <SwotBox type="threat" title="Threats" items={swot.threats} color="warning" />
          </div>

          <div className="surface p-4 bg-bg-primary/50">
            <div className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-2 flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-accent-primary" />
              {actions.length} Action Plan (30 Hari ke Depan)
            </div>
            <ol className="space-y-1.5 text-sm text-text-primary">
              {actions.map((a, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-accent-primary text-white text-[10px] font-semibold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-text-secondary">{a}</span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}

// V25.7: token-based SWOT color palette (V23: no raw Tailwind)
const COLOR_MAP = {
  success: { border: 'border-accent-success/30', bg: 'bg-accent-success/5', text: 'text-accent-success' },
  danger: { border: 'border-accent-danger/30', bg: 'bg-accent-danger/5', text: 'text-accent-danger' },
  info: { border: 'border-accent-primary/30', bg: 'bg-accent-primary/5', text: 'text-accent-primary' },
  warning: { border: 'border-accent-warning/30', bg: 'bg-accent-warning/5', text: 'text-accent-warning' }
};

const ICON_MAP = {
  strength: ArrowUp,
  weakness: ArrowDown,
  opportunity: Plus,
  threat: AlertTriangle
};

function SwotBox({ type, title, items, color }) {
  const Icon = ICON_MAP[type];
  const c = COLOR_MAP[color];
  return (
    <div className={`surface p-3 border ${c.border} ${c.bg}`}>
      <div className={`text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${c.text}`}>
        <Icon className="w-3.5 h-3.5" />
        {title}
      </div>
      <ul className="space-y-1 text-xs text-text-secondary">
        {items.map((item, i) => (
          <li key={i} className="leading-relaxed">• {item}</li>
        ))}
      </ul>
    </div>
  );
}
