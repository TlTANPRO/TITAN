// V21.1: Account Detail — tab shell wrapping 5 modular subcomponents.
// Tabs: Overview (default), Content, Patterns, Insights, Benchmark.
// URL: /account/:slug?tab=patterns (deep-linkable).
import { useMemo, useEffect, useRef, lazy, Suspense } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Calendar, Lightbulb, Globe2, ChevronRight, ArrowLeft
} from 'lucide-react';
import { useAccount, useAccountInsights } from '../hooks/useAccount.js';
import SkeletonCard, { Skeleton } from '../components/SkeletonCard.jsx';
import SkeletonChart from '../components/SkeletonChart.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import { SectionLabel } from '../components/ui/SectionLabel.jsx';
import { AccountOverview } from '../components/account/AccountOverview.jsx';
import { AccountContent } from '../components/account/AccountContent.jsx';
import { AccountPatterns } from '../components/account/AccountPatterns.jsx';

// V37 perf: Insights/Benchmark tabs (pull recharts, ~420KB vendor) lazy-loaded
// so first paint of /account/:slug doesn't pay for charts the user may never open.
const AccountInsights = lazy(() => import('../components/account/AccountInsights.jsx').then(m => ({ default: m.AccountInsights })));
const AccountBenchmark = lazy(() => import('../components/account/AccountBenchmark.jsx').then(m => ({ default: m.AccountBenchmark })));

const TAB_KEYS = ['overview', 'content', 'patterns', 'insights', 'benchmark'];
const DEFAULT_TAB = 'overview';

// V24.3: each tab gets a numbered SectionLabel matching Home bento pattern (01-08).
// Accent: cyan for live data, pink for content, accent for primary, purple for insights.
const TAB_LABELS = {
  overview: { number: '01', title: 'Ringkasan Akun', accent: 'accent' },
  content: { number: '02', title: 'Konten', accent: 'pink' },
  patterns: { number: '03', title: 'Pola & Waktu', accent: 'cyan' },
  insights: { number: '04', title: 'Insight & Rekomendasi', accent: 'purple' },
  benchmark: { number: '05', title: 'Benchmark Industri', accent: 'emerald' }
};

export default function AccountPage() {
  const { slug } = useParams();
  const account = useAccount(slug);
  const insights = useAccountInsights(slug);
  const [searchParams, setSearchParams] = useSearchParams();

  // Resolve active tab from URL, fallback to default
  const rawTab = searchParams.get('tab') ?? DEFAULT_TAB;
  const activeTab = useMemo(() => (TAB_KEYS.includes(rawTab) ? rawTab : DEFAULT_TAB), [rawTab]);

  // ST5: scroll-to-top on tab change so user sees fresh panel header.
  const tabSectionRef = useRef(null);
  useEffect(() => {
    if (tabSectionRef.current) {
      tabSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeTab]);

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

  const recCount = insights.marketInsightsExtended?.recommendations?.length ?? 0;
  const postCount = account.posts?.length ?? 0;
  const tabItems = [
    { value: 'overview', label: 'Overview', icon: LayoutDashboard },
    { value: 'content', label: 'Content', icon: FileText, badge: postCount || null, badgeLabel: `${postCount} post` },
    { value: 'patterns', label: 'Patterns', icon: Calendar },
    { value: 'insights', label: 'Insights', icon: Lightbulb, badge: recCount || null, badgeLabel: `${recCount} rekomendasi` },
    { value: 'benchmark', label: 'Benchmark', icon: Globe2 }
  ];

  return (
    <div className="space-y-4" ref={tabSectionRef}>
      {/* Breadcrumb: TITAN / Akun / @username */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs flex-wrap">
        <Link
          to="/account"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-bg-tertiary border border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-default transition-colors mr-1"
          aria-label="Kembali ke daftar akun"
        >
          <ArrowLeft className="w-3 h-3" />
          Kembali
        </Link>
        <Link to="/" className="text-text-muted hover:text-text-primary transition-colors">TITAN</Link>
        <ChevronRight className="w-3 h-3 text-text-muted/50" />
        <Link to="/account" className="text-text-muted hover:text-text-primary transition-colors">Akun</Link>
        <ChevronRight className="w-3 h-3 text-text-muted/50" />
        <span className="text-text-primary font-semibold truncate">@{account.username}</span>
      </nav>

      <h1 className="sr-only">@{account.username} — Detail Akun</h1>

      <Tabs value={activeTab} onChange={handleTabChange} items={tabItems} />

      <SectionLabel {...TAB_LABELS[activeTab]} />

      <div role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        {activeTab === 'overview' && <AccountOverview account={account} insights={insights} />}
        {activeTab === 'content' && <AccountContent account={account} insights={insights} />}
        {activeTab === 'patterns' && <AccountPatterns insights={insights} />}
        {activeTab === 'insights' && <Suspense fallback={<SkeletonChart />}><AccountInsights account={account} insights={insights} /></Suspense>}
        {activeTab === 'benchmark' && <Suspense fallback={<SkeletonChart />}><AccountBenchmark account={account} insights={insights} /></Suspense>}
      </div>
    </div>
  );
}
