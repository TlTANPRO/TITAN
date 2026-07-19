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
import { Trophy, TrendingUp, Activity, Sparkles, Heart, MessageCircle, Eye } from 'lucide-react';
import { formatNumber, formatPercent } from '../lib/format.js';
import { dataAvailability, topByMetric } from '../lib/analytics.js';
import { weeklyTopViral } from '../lib/weeklyRecap.js';

function withAvailability(account) {
  if (!account) return account;
  const availability = dataAvailability(account.posts ?? [], account.platform);
  return { ...account, availability };
}

const RANK_COLORS = ['bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
                     'bg-zinc-400/20 text-zinc-400 border-zinc-400/30',
                     'bg-orange-700/20 text-orange-700 border-orange-700/30'];

function TopPerformersCard({ title, icon, accounts, metricKey, suffix }) {
  const top = accounts
    .filter((a) => Number.isFinite(a[metricKey]) && a[metricKey] > 0)
    .sort((a, b) => (b[metricKey] ?? 0) - (a[metricKey] ?? 0))
    .slice(0, 3);
  if (top.length === 0) {
    return (
      <div className="surface p-4">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
          {icon}
          {title}
        </h3>
        <div className="text-xs text-text-muted text-center py-4">Data tidak tersedia</div>
      </div>
    );
  }
  return (
    <div className="surface p-4">
      <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
        {icon}
        {title}
      </h3>
      <ol className="space-y-2">
        {top.map((a, i) => (
          <li key={a.slug} className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold border ${RANK_COLORS[i] ?? RANK_COLORS[2]}`}>
              {i + 1}
            </span>
            <ProxiedAvatar account={a} size={28} className="" />
            <a href={`/account/${a.slug}`} className="text-sm font-medium text-text-primary hover:text-accent-primary truncate flex-1">
              @{a.username}
            </a>
            <span className="text-sm font-bold text-accent-primary tabular-nums">
              {metricKey === 'engagementRate' ? formatPercent(a[metricKey]) : formatNumber(a[metricKey])}
            </span>
            {suffix ? <span className="text-[10px] text-text-muted">{suffix}</span> : null}
          </li>
        ))}
      </ol>
    </div>
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

  return (
    <div className="bg-bg-primary">
      <main id="main-content" tabIndex={-1} className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-8 pb-32 md:pb-8">
        {/* 1. HERO */}
        <Hero accounts={accounts} allPosts={latestPosts} />

        {/* 2. WEEKLY BRIEFING (4 sections) */}
        <WeeklyBriefing accounts={accounts} />

        {/* 3. TOP 5 VIRAL POSTS (mingguan) */}
        {topViral.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-accent-danger" />
              Top 5 Viral Posts (7 Hari)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {topViral.map((p, i) => (
                <ViralPostCard key={p.id} post={p} rank={i + 1} />
              ))}
            </div>
          </section>
        )}

        {/* 4. ACCOUNT HEALTH GRID (grouped IG/TT) */}
        <section>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-accent-warning" />
            Account Health Score
          </h2>
          <AccountHealthGrid accounts={accounts} comparison={comparison} />
        </section>

        {/* 5. LIVE ACTIVITY FEED */}
        <section>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-accent-success animate-pulse" />
            Live Activity (10 Postingan Terbaru)
          </h2>
          <LiveActivityFeed posts={latestPosts} />
        </section>

        {/* 6. CROSS-ACCOUNT TREND TIMELINE */}
        <section>
          <CrossAccountTimeline accounts={accounts} />
        </section>

        {/* 7. CONTENT SUNBURST + HEATMAP 2-col */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ContentSunburst accounts={accounts} />
          <CombinedHeatmap accounts={accounts} />
        </div>

        {/* 8. TOP PERFORMERS — ER / Views / Comments / Likes */}
        <section>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent-primary" />
            Top Performers
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <TopPerformersCard
              title="Top Engagement Rate"
              icon={<Trophy className="w-3.5 h-3.5 text-accent-warning" />}
              accounts={comparison}
              metricKey="engagementRate"
            />
            <TopPerformersCard
              title="Top Views"
              icon={<Eye className="w-3.5 h-3.5 text-cyan-500" />}
              accounts={comparison}
              metricKey="avgViews"
            />
            <TopPerformersCard
              title="Top Comments"
              icon={<MessageCircle className="w-3.5 h-3.5 text-accent-secondary" />}
              accounts={comparison}
              metricKey="avgComments"
            />
            <TopPerformersCard
              title="Top Likes"
              icon={<Heart className="w-3.5 h-3.5 text-pink-500" />}
              accounts={comparison}
              metricKey="avgLikes"
            />
          </div>
        </section>

        {/* 9. ENHANCED TABLE (sortable + filterable) */}
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
