// StrategyBrief — 1-page AI summary (SWOT + Action Plan)
// Falls back to pure analytics SWOT when no AI insight is cached.
import { useMemo } from 'react';
import { FileText, ArrowUp, ArrowDown, Plus, AlertTriangle, Target, Bot } from 'lucide-react';
import { formatPercent, formatNumber } from '../lib/format.js';
import { accountHealthScore, timeSinceLastViral, outlierPosts } from '../lib/analytics.js';
import { getInsight } from '../lib/insights.js';

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
  if (insights?.bestTimeOfDay?.topHour != null) {
    actions.push(`Post 3×/minggu di jam ${insights.bestTimeOfDay.topHour}:00 WIB (${insights.bestTimeOfDay.topDayName ?? 'hari terbaik'})`);
  }
  if (swot.outliers.length > 0) {
    actions.push(`Replikasi formula ${swot.outliers.length} post outlier — cek "Resep Post Viral" untuk detail`);
  }
  if (insights?.contentMix?.counts) {
    const sorted = Object.entries(insights.contentMix.counts).sort((a, b) => b[1] - a[1]);
    if (sorted[0]) actions.push(`Pertahankan format ${sorted[0][0]} sebagai andalan, tambahkan variasi caption`);
  }
  if (account?.platform === 'instagram' && insights?.availability && !insights.availability.likes) {
    actions.push(`Jalankan ulang scraper setelah token reset untuk enrich data like/comment`);
  }
  if (actions.length < 3) actions.push('Monitor performa mingguan dan adjust strategi berdasarkan tren ER');
  return actions.slice(0, 5);
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
              <Bot className="w-3 h-3 text-accent-primary" />
              AI-generated · pre-cached di ai-insights.json
            </>
          ) : (
            'Auto-generated (analytics-only) · run `pnpm insights:generate` untuk AI generatif'
          )}
        </span>
      </div>

      {hasAi ? (
        // AI mode — show AI text + action plan from analytics
        <div className="space-y-4">
          <div className="surface p-4 bg-bg-primary/50 border border-accent-primary/30">
            <div className="text-xs text-accent-primary uppercase tracking-wider font-semibold mb-2 flex items-center gap-2">
              <Bot className="w-3.5 h-3.5" />
              AI Strategy Brief
            </div>
            <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">{aiText}</p>
          </div>
          <div className="surface p-4 bg-bg-primary/50">
            <div className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-2 flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-accent-primary" />
              Action Plan (30 Hari ke Depan)
            </div>
            <ol className="space-y-1.5 text-sm text-text-primary">
              {actions.map((a, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-accent-primary text-white text-[10px] font-bold flex items-center justify-center mt-0.5">
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
            <SwotBox type="strength" title="Strengths" items={swot.strengths} color="emerald" />
            <SwotBox type="weakness" title="Weaknesses" items={swot.weaknesses} color="rose" />
            <SwotBox type="opportunity" title="Opportunities" items={swot.opportunities} color="sky" />
            <SwotBox type="threat" title="Threats" items={swot.threats} color="amber" />
          </div>

          <div className="surface p-4 bg-bg-primary/50">
            <div className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-2 flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-accent-primary" />
              Action Plan (30 Hari ke Depan)
            </div>
            <ol className="space-y-1.5 text-sm text-text-primary">
              {actions.map((a, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-accent-primary text-white text-[10px] font-bold flex items-center justify-center mt-0.5">
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

const COLOR_MAP = {
  emerald: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', text: 'text-emerald-500' },
  rose: { border: 'border-rose-500/30', bg: 'bg-rose-500/5', text: 'text-rose-500' },
  sky: { border: 'border-sky-500/30', bg: 'bg-sky-500/5', text: 'text-sky-500' },
  amber: { border: 'border-amber-500/30', bg: 'bg-amber-500/5', text: 'text-amber-500' }
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
