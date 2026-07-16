import { useMemo } from 'react';
import { useAccounts, useCrossAccountComparison } from '../hooks/useAccount.js';
import { getLatestPosts } from '../lib/dataStore.js';
import AccountCard from '../components/AccountCard.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { Hero } from '../components/Hero.jsx';
import { AccountHealthGrid } from '../components/AccountHealthGrid.jsx';
import { LiveActivityFeed } from '../components/LiveActivityFeed.jsx';
import { CrossAccountTimeline } from '../components/CrossAccountTimeline.jsx';
import { ContentSunburst } from '../components/ContentSunburst.jsx';
import { WeeklyBriefing } from '../components/WeeklyBriefing.jsx';
import { CombinedHeatmap } from '../components/CombinedHeatmap.jsx';
import { EnhancedTable } from '../components/EnhancedTable.jsx';
import { Trophy, TrendingUp, AlertTriangle, Activity } from 'lucide-react';
import { formatNumber, formatPercent } from '../lib/format.js';
import { dataAvailability } from '../lib/analytics.js';

function withAvailability(account) {
  if (!account) return account;
  const availability = dataAvailability(account.posts ?? [], account.platform);
  return { ...account, availability };
}

export default function Home() {
  const rawAccounts = useAccounts();
  const comparison = useCrossAccountComparison();
  const accounts = useMemo(() => rawAccounts.map(withAvailability), [rawAccounts]);
  const allPosts = useMemo(() => getLatestPosts(10), [rawAccounts]);
  // Need re-fetch when rawAccounts changes (getLatestPosts reads from module cache)
  const latestPosts = useMemo(() => {
    if (!rawAccounts || rawAccounts.length === 0) return [];
    return getLatestPosts(10);
  }, [rawAccounts]);
  const topER = comparison.filter((a) => a.hasER).slice(0, 3);
  const limitedCount = accounts.filter((a) => a.availability && !a.availability.hasRealData).length;

  return (
    <div className="min-h-screen bg-bg-primary">
      <header className="border-b border-border-subtle bg-bg-secondary/50 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">TITAN</h1>
            <p className="text-xs text-text-muted">Social Media Marketing Intelligence · V10</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-muted flex-wrap justify-end">
            {limitedCount > 0 && (
              <span className="chip bg-accent-warning/10 text-accent-warning" title="Akun dengan data terbatas (perlu enrichment)">
                <AlertTriangle className="w-3 h-3" />
                {limitedCount} akun perlu enrichment
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="max-w-7xl mx-auto px-6 py-8 space-y-8 pb-32 md:pb-8">
        {/* 1. HERO */}
        <Hero accounts={accounts} allPosts={latestPosts} />

        {/* 2. WEEKLY BRIEFING */}
        <WeeklyBriefing accounts={accounts} />

        {/* 3. ACCOUNT HEALTH GRID (9 cards) */}
        <section>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-accent-warning" />
            Account Health Score
          </h2>
          <AccountHealthGrid accounts={accounts} comparison={comparison} />
        </section>

        {/* 4. LIVE ACTIVITY FEED */}
        <section>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-accent-success animate-pulse" />
            Live Activity (10 Postingan Terbaru)
          </h2>
          <LiveActivityFeed posts={latestPosts} />
        </section>

        {/* 5. CROSS-ACCOUNT TREND TIMELINE */}
        <section>
          <CrossAccountTimeline accounts={accounts} />
        </section>

        {/* 6. CONTENT SUNBURST + HEATMAP 2-col */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ContentSunburst accounts={accounts} />
          <CombinedHeatmap accounts={accounts} />
        </div>

        {/* 7. TOP BY ER (legacy) */}
        {topER.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-accent-warning" />
              Top 3 Engagement Rate
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {topER.map((a, i) => (
                <div key={a.slug} className="surface p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${i === 0 ? 'bg-yellow-500/20 text-yellow-500' : i === 1 ? 'bg-zinc-400/20 text-zinc-400' : 'bg-orange-700/20 text-orange-700'}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-text-primary truncate">@{a.username}</div>
                    <div className="text-xs text-text-muted">
                      {a.platform === 'instagram' ? 'IG' : 'TT'} · {formatNumber(a.followerCount)} pengikut
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-accent-success tabular-nums">{formatPercent(a.engagementRate)}</div>
                    <div className="text-[10px] text-text-muted uppercase">ER</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 8. ENHANCED TABLE (sortable + filterable) */}
        <section>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-accent-primary" />
            Perbandingan Lintas Akun
          </h2>
          <EnhancedTable comparison={comparison} />
        </section>
      </main>
    </div>
  );
}
