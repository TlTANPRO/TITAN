// V21: /ai — Global Insight & Rekomendasi view (ViralRecipe, GrowthStrategy, StrategyBrief, WeeklyBriefing).
// Tabbed view across all 9 accounts. Shows pre-cached text from ai-insights.json.
// V25.7: removed Bot icon, removed "Pre-cached" chip + "AI" language, font-bold → font-semibold.
import { useState, useEffect } from 'react';
import { Lightbulb, Sparkles, TrendingUp, FileText, Calendar } from 'lucide-react';
import { useAccounts } from '../hooks/useAccount.js';
import { ProxiedAvatar } from '../components/ProxiedAvatar.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { PlatformIcon } from '../components/icons/PlatformIcon.jsx';
import { getInsight, getInsightsMeta, getWeeklyBriefing } from '../lib/insights.js';

const TABS = [
  { value: 'strategy', label: 'Strategy Brief', icon: FileText },
  { value: 'viral', label: 'Viral Recipe', icon: Sparkles },
  { value: 'growth', label: 'Growth Strategy', icon: TrendingUp },
  { value: 'weekly', label: 'Weekly Briefing', icon: Calendar }
];

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

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary flex items-center gap-2">
          <Lightbulb className="w-6 h-6 text-accent-primary" />
          Insight & Rekomendasi
        </h1>
        <p className="text-sm text-text-muted mt-0.5">
          {meta.generatedAt
            ? `Tersimpan lokal · ${new Date(meta.generatedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })} · ${meta.accountCount} akun`
            : 'Belum ada insight yang tersimpan'
          }
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border-subtle overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              onClick={() => setActiveTab(t.value)}
              className={`
                flex items-center gap-2 px-4 py-2 text-sm font-medium whitespace-nowrap
                border-b-2 transition-colors
                ${activeTab === t.value
                  ? 'border-accent-primary text-accent-primary'
                  : 'border-transparent text-text-muted hover:text-text-primary'
                }
              `}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Account selector (hidden for weekly briefing) */}
      {activeTab !== 'weekly' && (
        <div className="surface p-3">
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Pilih Akun</div>
          <div className="flex flex-wrap gap-1.5">
            {accounts.map((a) => (
              <button
                key={a.slug}
                onClick={() => setActiveSlug(a.slug)}
                className={`
                  flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors
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
      <div className="surface p-5">
        {activeTab === 'weekly' ? (
          weeklyText ? (
            <div className="prose prose-invert max-w-none">
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
              <Lightbulb className="w-3.5 h-3.5" />
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
