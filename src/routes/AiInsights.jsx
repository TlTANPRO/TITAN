// V21: /ai — Global Insight & Rekomendasi view (ViralRecipe, GrowthStrategy, StrategyBrief, WeeklyBriefing).
// Tabbed view across all 9 accounts. Shows pre-cached text from ai-insights.json.
// V25.7: removed Bot icon, removed "Pre-cached" chip + "AI" language, font-bold → font-semibold.
// ST5: custom tab strip → shared <Tabs>, tambah staleness indicator (age days),
// contextual badge aria-label di tab content count.
import { useState, useEffect } from 'react';
import { Lightbulb, Sparkles, TrendingUp, FileText, Calendar, AlertCircle } from 'lucide-react';
import { useAccounts } from '../hooks/useAccount.js';
import { ProxiedAvatar } from '../components/ProxiedAvatar.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { PlatformIcon } from '../components/icons/PlatformIcon.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import { getInsight, getInsightsMeta, getWeeklyBriefing } from '../lib/insights.js';

const TABS = [
  { value: 'strategy', label: 'Strategy Brief', icon: FileText },
  { value: 'viral', label: 'Viral Recipe', icon: Sparkles },
  { value: 'growth', label: 'Growth Strategy', icon: TrendingUp },
  { value: 'weekly', label: 'Weekly Briefing', icon: Calendar }
];

// ST5: stale kalau > 7 hari. UI kasih chip warning biar user aware.
const STALE_THRESHOLD_MS = 7 * 24 * 3600 * 1000;

function ageDays(ms) {
  if (!ms) return null;
  return Math.floor((Date.now() - ms) / (24 * 3600 * 1000));
}

export default function AiInsights() {
  const accounts = useAccounts();
  const [activeTab, setActiveTab] = useState('strategy');
  const [activeSlug, setActiveSlug] = useState(() => accounts[0]?.slug ?? '');
  const [meta, setMeta] = useState({ generatedAt: null, accountCount: 0, hasErrors: false });

  useEffect(() => {
    setMeta(getInsightsMeta());
  }, []);

  // Sync activeSlug if currently empty
  useEffect(() => {
    if (!activeSlug && accounts.length > 0) {
      setActiveSlug(accounts[0].slug);
    }
  }, [accounts, activeSlug]);

  const tabKey = activeTab === 'strategy' ? 'strategyBrief'
    : activeTab === 'viral' ? 'viralRecipe'
    : activeTab === 'growth' ? 'growthStrategy'
    : null;

  const activeText = tabKey && activeSlug ? getInsight(activeSlug, tabKey) : null;
  const weeklyText = activeTab === 'weekly' ? getWeeklyBriefing() : null;

  const age = ageDays(meta.generatedAt);
  const isStale = age != null && age > 7;

  // Map ke shared Tabs API: { value, label, icon, badge, badgeLabel }
  const tabItems = TABS.map((t) => {
    if (t.value === 'weekly') {
      return { ...t, badge: weeklyText ? 'Siap' : null, badgeLabel: weeklyText ? 'Briefing tersedia' : null };
    }
    return t;
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <PageHeader
        icon={Lightbulb}
        title="Insight & Rekomendasi"
        subtitle={meta.generatedAt
          ? `Tersimpan lokal · ${new Date(meta.generatedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })} · ${meta.accountCount} akun`
          : 'Belum ada insight yang tersimpan'}
      />
      {isStale && (
        <p className="text-xs text-accent-warning -mt-2">
          Insight sudah {age} hari. Jalankan `pnpm insights:generate` untuk refresh.
        </p>
      )}

      {/* Tabs (shared, ARIA-compliant) */}
      <Tabs value={activeTab} onChange={setActiveTab} items={tabItems} />

      {/* Account selector (hidden for weekly briefing) */}
      {activeTab !== 'weekly' && (
        <div className="surface p-3">
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Pilih Akun</div>
          <div className="flex flex-wrap gap-1.5">
            {accounts.map((a) => (
              <button
                key={a.slug}
                onClick={() => setActiveSlug(a.slug)}
                aria-pressed={activeSlug === a.slug}
                className={`
                  flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary
                  ${activeSlug === a.slug
                    ? 'bg-accent-primary/10 border-accent-primary/40 text-accent-primary'
                    : 'bg-bg-tertiary border-border-subtle text-text-secondary hover:border-border-default'
                  }
                `}
              >
                <ProxiedAvatar account={a} size={18} />
                @{a.username}
                <PlatformIcon platform={a.platform} className="w-3 h-3 opacity-50" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content panel */}
      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="surface p-5"
      >
        {activeTab === 'weekly' ? (
          weeklyText ? (
            // V34.12 AI-3: prose prose-invert no-op (plugin not installed).
            // Manual typography — text-base + leading-relaxed + text-text-primary.
            // Weekly briefing = pre-formatted text dari insights generator,
            // whitespace-pre-wrap agar newline dari generator tetap preserved.
            <div className="titan-prose titan-prose-invert max-w-none">
              <pre className="whitespace-pre-wrap text-sm text-text-primary font-sans leading-relaxed">
                {weeklyText}
              </pre>
            </div>
          ) : (
            <EmptyState
              title="Weekly Briefing belum tersedia"
              description="Jalankan `pnpm insights:briefing` di terminal untuk generate. Sambil menunggu, cek Weekly Recap di Home untuk ringkasan otomatis."
            />
          )
        ) : activeText ? (
          <div>
            <div className="flex items-center gap-2 mb-3 text-xs text-accent-primary">
              <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="font-semibold uppercase tracking-wider">Rekomendasi</span>
            </div>
            <div className="text-sm text-text-primary leading-relaxed whitespace-pre-line">
              {activeText}
            </div>
          </div>
        ) : (
          <EmptyState
            title="Insight belum tersedia"
            description={`Belum ada insight untuk @${activeSlug.replace(/^[^-]+-/, '')} - ${TABS.find(t => t.value === activeTab)?.label}. Jalankan \`pnpm insights:generate\` untuk generate.`}
          />
        )}
      </div>
    </div>
  );
}
