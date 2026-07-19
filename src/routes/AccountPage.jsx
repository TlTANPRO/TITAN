// V21.1: Account Detail — tab shell wrapping 5 modular subcomponents.
// Tabs: Overview (default), Content, Patterns, Insights, Benchmark.
// URL: /account/:slug?tab=patterns (deep-linkable).
import { useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Calendar, Lightbulb, Globe2, ChevronRight, ArrowLeft
} from 'lucide-react';
import { useAccount, useAccountInsights } from '../hooks/useAccount.js';
import SkeletonCard, { Skeleton } from '../components/SkeletonCard.jsx';
import SkeletonChart from '../components/SkeletonChart.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import { AccountOverview } from '../components/account/AccountOverview.jsx';
import { AccountContent } from '../components/account/AccountContent.jsx';
import { AccountPatterns } from '../components/account/AccountPatterns.jsx';
import { AccountInsights } from '../components/account/AccountInsights.jsx';
import { AccountBenchmark } from '../components/account/AccountBenchmark.jsx';

const TAB_KEYS = ['overview', 'content', 'patterns', 'insights', 'benchmark'];
const DEFAULT_TAB = 'overview';

export default function AccountPage() {
  const { slug } = useParams();
  const account = useAccount(slug);
  const insights = useAccountInsights(slug);
  const [searchParams, setSearchParams] = useSearchParams();

  // Resolve active tab from URL, fallback to default
  const rawTab = searchParams.get('tab') ?? DEFAULT_TAB;
  const activeTab = useMemo(() => (TAB_KEYS.includes(rawTab) ? rawTab : DEFAULT_TAB), [rawTab]);

  const handleTabChange = (next) => {
    if (next === DEFAULT_TAB) {
      // Keep URL clean for default tab
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: next }, { replace: true });
    }
  };

  if (!account) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-text-secondary">
        <div>
          Akun tidak ditemukan.{' '}
          <Link to="/account" className="text-accent-primary hover:underline">Lihat daftar akun</Link>
        </div>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="w-16 h-16 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
          <SkeletonCard height={200} />
          <SkeletonCard height={200} />
          <SkeletonCard height={200} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart height={220} />
          <SkeletonChart height={220} />
        </div>
      </div>
    );
  }

  const tabItems = [
    { value: 'overview', label: 'Overview', icon: LayoutDashboard },
    { value: 'content', label: 'Content', icon: FileText, badge: account.posts?.length ?? null },
    { value: 'patterns', label: 'Patterns', icon: Calendar },
    { value: 'insights', label: 'Insights', icon: Lightbulb, badge: insights.marketInsightsExtended?.recommendations?.length ?? null },
    { value: 'benchmark', label: 'Benchmark', icon: Globe2 }
  ];

  return (
    <div className="space-y-4">
      {/* Breadcrumb: TITAN / Akun / @username */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs">
        <Link to="/" className="text-text-muted hover:text-text-primary transition-colors">TITAN</Link>
        <ChevronRight className="w-3 h-3 text-text-muted/50" />
        <Link to="/account" className="text-text-muted hover:text-text-primary transition-colors">Akun</Link>
        <ChevronRight className="w-3 h-3 text-text-muted/50" />
        <span className="text-text-primary font-semibold truncate">@{account.username}</span>
      </nav>

      <Tabs value={activeTab} onChange={handleTabChange} items={tabItems} />

      <div role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        {activeTab === 'overview' && <AccountOverview account={account} insights={insights} />}
        {activeTab === 'content' && <AccountContent account={account} insights={insights} />}
        {activeTab === 'patterns' && <AccountPatterns insights={insights} />}
        {activeTab === 'insights' && <AccountInsights account={account} insights={insights} />}
        {activeTab === 'benchmark' && <AccountBenchmark account={account} insights={insights} />}
      </div>
    </div>
  );
}
