// V22.1: Home — Grafana-style bento dashboard with dedicated "Konten & Timing"
// section. V22 had CombinedHeatmap + ContentSunburst + Content Mix squeezed
// into a 3×col-4 row, which caused Sunburst legend to bleed into the
// heatmap. V22.1 moves heatmap to a wider col-8 within its own section,
// and shrinks Sunburst to 180×180 so both panels sit comfortably side-by-side.
// V25.3: Top Engagement Rate empty state, token-based rank colors, font-bold → font-semibold,
// Bot icon removed, TopPerformersCard icon colors migrated to tokens.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, TrendingUp, Activity, Sparkles, Heart, MessageCircle, Eye, ArrowRight } from 'lucide-react';
import { useAccounts, useCrossAccountComparison } from '../hooks/useAccount.js';
import { getLatestPosts } from '../lib/dataStore.js';
import { Hero } from '../components/Hero.jsx';
import { AccountHealthGrid } from '../components/AccountHealthGrid.jsx';
import { LiveActivityFeed } from '../components/LiveActivityFeed.jsx';
import { CrossAccountTimeline } from '../components/CrossAccountTimeline.jsx';
import { ContentSunburst } from '../components/ContentSunburst.jsx';
import { WeeklyBriefing } from '../components/WeeklyBriefing.jsx';
import { CombinedHeatmap } from '../components/CombinedHeatmap.jsx';
import { EnhancedTable } from '../components/EnhancedTable.jsx';
import { ViralPostCard } from '../components/ViralPostCard.jsx';
import { ProxiedAvatar } from '../components/ProxiedAvatar.jsx';
import { BentoGrid, BentoItem } from '../components/ui/BentoGrid.jsx';
import { SectionLabel } from '../components/ui/SectionLabel.jsx';
import { formatNumber, formatPercent, formatCompact } from '../lib/format.js';
import { dataAvailability } from '../lib/analytics.js';
import { weeklyTopViral } from '../lib/weeklyRecap.js';

function withAvailability(account) {
  if (!account) return account;
  const availability = dataAvailability(account.posts ?? [], account.platform);
  return { ...account, availability };
}

// V25.3: token-based rank palette (V23: no raw Tailwind colors)
const RANK_COLORS = ['bg-accent-warning/20 text-accent-warning border-accent-warning/30',
                     'bg-bg-hover text-text-secondary border-border-default',
                     'bg-accent-secondary/20 text-accent-secondary border-accent-secondary/30'];

function TopPerformersCard({ title, icon, accounts, metricKey, suffix }) {
  const top = accounts
    .filter((a) => Number.isFinite(a[metricKey]) && a[metricKey] > 0)
    .sort((a, b) => (b[metricKey] ?? 0) - (a[metricKey] ?? 0))
    .slice(0, 3);
  if (top.length === 0) {
    return (
      <BentoItem colSpan="col-6" padding="p-4" className="min-h-[140px]">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
          {icon}
          {title}
        </h3>
        <div className="text-xs text-text-muted text-center py-4">Data tidak tersedia</div>
      </BentoItem>
    );
  }
  return (
    <BentoItem colSpan="col-3" padding="p-4" className="min-h-[140px]">
      <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
        {icon}
        {title}
      </h3>
      <ol className="space-y-2">
        {top.map((a, i) => (
          <li key={a.slug} className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-semibold border flex-shrink-0 ${RANK_COLORS[i] ?? RANK_COLORS[2]}`}>
              {i + 1}
            </span>
            <ProxiedAvatar account={a} size={24} className="flex-shrink-0" />
            <Link
              to={`/account/${a.slug}`}
              className="text-sm font-medium text-text-primary hover:text-accent-primary truncate flex-1"
            >
              @{a.username}
            </Link>
            <span className="text-sm font-semibold text-accent-primary tabular-nums flex-shrink-0">
              {metricKey === 'engagementRate' ? formatPercent(a[metricKey]) : formatNumber(a[metricKey])}
            </span>
            {suffix ? <span className="text-[10px] text-text-muted flex-shrink-0">{suffix}</span> : null}
          </li>
        ))}
      </ol>
    </BentoItem>
  );
}

export default function Home() {
  const rawAccounts = useAccounts();
  const comparison = useCrossAccountComparison();
  const accounts = useMemo(() => rawAccounts.map(withAvailability), [rawAccounts]);
  const latestPosts = useMemo(() => {
    if (!rawAccounts || rawAccounts.length === 0) return [];
    return getLatestPosts(10);
  }, [rawAccounts]);
  const topViral = useMemo(() => {
    if (!rawAccounts || rawAccounts.length === 0) return [];
    return weeklyTopViral(rawAccounts, 7, 5);
  }, [rawAccounts]);

  // Content mix stat (Foto/Reel/Video/Carousel breakdown)
  // V25.3: token-based colors (use chart-1/chart-4/chart-5/chart-3 from tokens.css)
  const contentMix = useMemo(() => {
    const mix = { IMAGE: 0, REEL: 0, VIDEO: 0, CAROUSEL_ALBUM: 0, OTHER: 0 };
    for (const a of accounts) {
      for (const p of a.posts ?? []) {
        const mt = p.mediaType ?? 'IMAGE';
        mix[mt] = (mix[mt] ?? 0) + 1;
      }
    }
    const total = Object.values(mix).reduce((s, v) => s + v, 0) || 1;
    return {
      breakdown: [
        { key: 'IMAGE', label: 'Foto', count: mix.IMAGE, color: 'bg-accent-primary' },
        { key: 'REEL', label: 'Reels', count: mix.REEL, color: 'bg-accent-secondary' },
        { key: 'VIDEO', label: 'Video', count: mix.VIDEO, color: 'bg-chart-5' },
        { key: 'CAROUSEL_ALBUM', label: 'Carousel', count: mix.CAROUSEL_ALBUM, color: 'bg-accent-warning' }
      ].filter((x) => x.count > 0),
      total
    };
  }, [accounts]);

  return (
    <div className="bg-bg-primary">
      <main id="main-content" tabIndex={-1} className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 pb-32 md:pb-8 space-y-6">

        {/* ===== ROW 1: Hero KPI strip (full width) ===== */}
        <Hero accounts={accounts} allPosts={latestPosts} />

        {/* ===== ROW 2: Top Viral (5) + Live Activity (7) ===== */}
        {topViral.length > 0 && (
          <BentoGrid>
            <BentoItem colSpan="col-5" padding="p-4" className="overflow-hidden">
              <SectionLabel number="01" title="Top 5 Viral (7 Hari)" accent="pink" className="mb-3" />
              <div className="grid grid-cols-2 gap-2">
                {topViral.slice(0, 4).map((p, i) => (
                  <ViralPostCard key={p.id} post={p} rank={i + 1} />
                ))}
              </div>
              {topViral.length > 4 && (
                <div className="mt-2 text-center">
                  <Link
                    to="/library?sortBy=viewCount"
                    className="text-[10px] text-accent-primary hover:underline inline-flex items-center gap-1"
                  >
                    +{topViral.length - 4} lainnya <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              )}
            </BentoItem>

            <BentoItem colSpan="col-7" padding="p-4">
              <SectionLabel number="02" title="Live Activity" accent="cyan" className="mb-3" />
              <LiveActivityFeed posts={latestPosts} />
            </BentoItem>
          </BentoGrid>
        )}

        {/* ===== ROW 3: Account Health (12) ===== */}
        <BentoGrid>
          <BentoItem colSpan="col-12" padding="p-4">
            <SectionLabel number="03" title="Account Health Score" accent="warning" className="mb-3" />
            <AccountHealthGrid accounts={accounts} comparison={comparison} />
          </BentoItem>
        </BentoGrid>

        {/* ===== ROW 4: Weekly Briefing (8) + Top ER (4) ===== */}
        <BentoGrid>
          <BentoItem colSpan="col-8" padding="p-4">
            <SectionLabel number="04" title="Weekly Recap" accent="accent" className="mb-3" />
            <WeeklyBriefing accounts={accounts} />
          </BentoItem>

          <BentoItem colSpan="col-4" padding="p-4">
            <SectionLabel number="05" title="Top Engagement Rate" accent="pink" className="mb-3" />
            {(() => {
              const ranked = comparison
                .filter((a) => Number.isFinite(a.engagementRate) && a.engagementRate > 0)
                .sort((a, b) => b.engagementRate - a.engagementRate)
                .slice(0, 3);
              if (ranked.length === 0) {
                return (
                  <div className="text-xs text-text-muted text-center py-6 leading-relaxed">
                    Data ER belum tersedia.
                    <br />
                    Enrich IG via <code className="bg-bg-tertiary px-1 rounded text-[10px]">/media/info</code> untuk 9 akun.
                  </div>
                );
              }
              return (
                <ol className="space-y-2">
                  {ranked.map((a, i) => (
                    <li key={a.slug}>
                      <Link
                        to={`/account/${a.slug}`}
                        className="flex items-center gap-2 p-1.5 -m-1.5 rounded hover:bg-bg-tertiary/40 transition-colors"
                      >
                        <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-semibold border flex-shrink-0 ${RANK_COLORS[i] ?? RANK_COLORS[2]}`}>
                          {i + 1}
                        </span>
                        <ProxiedAvatar account={a} size={20} className="flex-shrink-0" />
                        <span className="text-xs font-medium text-text-primary truncate flex-1">
                          @{a.username}
                        </span>
                        <span className="text-sm font-semibold text-accent-primary tabular-nums flex-shrink-0">
                          {formatPercent(a.engagementRate)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              );
            })()}
          </BentoItem>
        </BentoGrid>

        {/* ===== ROW 5: 4 Top Performer tiles ===== */}
        <BentoGrid>
          <TopPerformersCard
            title="Top Views"
            icon={<Eye className="w-3.5 h-3.5 text-chart-6" />}
            accounts={comparison}
            metricKey="avgViews"
          />
          <TopPerformersCard
            title="Top Likes"
            icon={<Heart className="w-3.5 h-3.5 text-chart-4" />}
            accounts={comparison}
            metricKey="avgLikes"
          />
          <TopPerformersCard
            title="Top Comments"
            icon={<MessageCircle className="w-3.5 h-3.5 text-accent-secondary" />}
            accounts={comparison}
            metricKey="avgComments"
          />
          <TopPerformersCard
            title="Top Posts/Minggu"
            icon={<Sparkles className="w-3.5 h-3.5 text-accent-primary" />}
            accounts={comparison}
            metricKey="postsPerWeek"
            suffix="post"
          />
        </BentoGrid>

        {/* ===== ROW 6: Konten & Timing — Sunburst (4) + Heatmap (8) ===== */}
        <BentoGrid>
          <BentoItem colSpan="col-4" padding="p-4">
            <ContentSunburst accounts={accounts} />
          </BentoItem>

          <BentoItem colSpan="col-8" padding="p-4">
            <CombinedHeatmap accounts={accounts} />
          </BentoItem>
        </BentoGrid>

        {/* ===== ROW 7: Content Mix bars (full width) ===== */}
        <BentoGrid>
          <BentoItem colSpan="col-12" padding="p-4">
            <SectionLabel number="07" title="Content Mix" accent="accent-secondary" className="mb-3" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {contentMix.breakdown.map((b) => {
                const pct = (b.count / contentMix.total) * 100;
                return (
                  <div key={b.key}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-text-secondary font-medium">{b.label}</span>
                      <span className="text-text-muted tabular-nums">
                        {formatCompact(b.count)} <span className="opacity-60">({pct.toFixed(1)}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                      <div
                        className={`h-full ${b.color} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="pt-2 mt-3 border-t border-border-subtle text-[10px] text-text-muted">
              Total {formatNumber(contentMix.total)} post lintas 9 akun
            </div>
          </BentoItem>
        </BentoGrid>

        {/* ===== ROW 7: Cross-Account Timeline (full) ===== */}
        <BentoGrid>
          <BentoItem colSpan="col-12" padding="p-4">
            <CrossAccountTimeline accounts={accounts} />
          </BentoItem>
        </BentoGrid>

        {/* ===== ROW 8: Enhanced Table + Recommendation link ===== */}
        <BentoGrid>
          <BentoItem colSpan="col-12" padding="p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <SectionLabel number="08" title="Perbandingan Lintas Akun" accent="accent" />
              <Link
                to="/ai"
                className="text-[10px] text-accent-primary hover:underline inline-flex items-center gap-1"
              >
                Lihat Rekomendasi
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <EnhancedTable comparison={comparison} />
          </BentoItem>
        </BentoGrid>
      </main>
    </div>
  );
}
