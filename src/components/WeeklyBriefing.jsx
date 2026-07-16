// WeeklyBriefing — V11: 4-section rich recap (Highlight, Pola, Rekomendasi, Industri).
// Uses AI text from ai-insights.json if cached, otherwise the analytics-only
// fallback from weeklyRecap.js. Both paths share the same 4-section layout
// so the panel never feels empty.
import { useMemo } from 'react';
import { Sparkles, Lightbulb, Target, BarChart3, Factory } from 'lucide-react';
import { getWeeklyBriefing } from '../lib/insights.js';
import { buildWeeklyRecap, weeklyTopViral } from '../lib/weeklyRecap.js';
import { computeAggregates } from '../lib/analytics.js';
import { formatNumber, formatPercent } from '../lib/format.js';

// Attach `aggregates` to each account so weeklyRecap can read avgER/avgLikes/...
function attachAggregates(accounts) {
  return accounts.map((a) => ({
    ...a,
    aggregates: computeAggregates(a.posts ?? [], a.followerCount ?? 0, a.platform)
  }));
}

export function WeeklyBriefing({ accounts }) {
  const enriched = useMemo(() => attachAggregates(accounts ?? []), [accounts]);
  const recap = useMemo(() => buildWeeklyRecap(enriched), [enriched]);
  const topViral = useMemo(() => weeklyTopViral(enriched, 7, 5), [enriched]);
  const aiText = getWeeklyBriefing();
  const hasAi = Boolean(aiText);

  const igCount = accounts?.filter((a) => a.platform === 'instagram').length ?? 0;
  const ttCount = accounts?.filter((a) => a.platform === 'tiktok').length ?? 0;
  const totalAcc = accounts?.length ?? 0;

  if (totalAcc === 0) {
    return (
      <div className="surface p-6 text-center text-text-muted text-sm">
        Belum ada akun yang dimuat.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent-primary" />
          Ringkasan Mingguan
        </h2>
        <span className="text-[10px] text-text-muted uppercase tracking-wider">
          7 hari terakhir · {igCount} IG + {ttCount} TT
        </span>
      </div>

      {hasAi && (
        <div className="surface p-5 bg-gradient-to-br from-accent-primary/5 to-accent-secondary/5">
          <div className="text-sm text-text-primary leading-relaxed whitespace-pre-line">{aiText}</div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* HIGHLIGHT */}
        <section className="surface p-4">
          <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider flex items-center gap-2 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-accent-primary" />
            Highlight Mingguan
          </h3>
          <ul className="space-y-2 text-sm text-text-secondary">
            {recap.highlight.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent-primary mt-0.5">▸</span>
                <span className="leading-relaxed">{line}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* POLA */}
        <section className="surface p-4">
          <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider flex items-center gap-2 mb-3">
            <BarChart3 className="w-3.5 h-3.5 text-accent-secondary" />
            5 Pola Teridentifikasi
          </h3>
          <ul className="space-y-2 text-sm text-text-secondary">
            {recap.patterns.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent-secondary mt-0.5 font-bold tabular-nums">{i + 1}.</span>
                <span className="leading-relaxed">{line}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* REKOMENDASI */}
        <section className="surface p-4">
          <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider flex items-center gap-2 mb-3">
            <Lightbulb className="w-3.5 h-3.5 text-accent-warning" />
            5 Rekomendasi Minggu Depan
          </h3>
          <ul className="space-y-2 text-sm text-text-secondary">
            {recap.recommendations.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent-warning mt-0.5 font-bold tabular-nums">{i + 1}.</span>
                <span className="leading-relaxed">{line}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* INDUSTRI */}
        <section className="surface p-4">
          <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider flex items-center gap-2 mb-3">
            <Factory className="w-3.5 h-3.5 text-accent-success" />
            Ringkasan Industri
          </h3>
          <ul className="space-y-2 text-sm text-text-secondary">
            {recap.industry.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent-success mt-0.5">▸</span>
                <span className="leading-relaxed">{line}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {topViral.length > 0 && (
        <div className="surface p-4">
          <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider flex items-center gap-2 mb-3">
            <Target className="w-3.5 h-3.5 text-accent-danger" />
            Top 5 Post Viral Mingguan
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {topViral.map((p, i) => (
              <a
                key={p.id}
                href={`/account/${p.slug}`}
                className="surface p-2 hover:border-accent-primary transition-colors"
              >
                <div className="flex items-center justify-between text-[10px] text-text-muted mb-1">
                  <span className="font-bold text-accent-warning">#{i + 1}</span>
                  <span className="truncate">@{p.username}</span>
                </div>
                <div className="text-[11px] text-text-secondary line-clamp-2 min-h-[2.2em]">
                  {p.caption?.slice(0, 60) ?? '(tanpa caption)'}
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[10px] tabular-nums text-text-muted">
                  <span>👁 {formatNumber(p.viewCount)}</span>
                  <span>♥ {formatNumber(p.likeCount)}</span>
                  <span>💬 {formatNumber(p.commentCount)}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
