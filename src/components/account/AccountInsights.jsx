// V21.1: Account Insights tab — SWOT, Strategy Brief, Viral Recipe, Growth Strategy, Content Calendar.
import { Lightbulb, TrendingUp, Activity, Target } from 'lucide-react';
import { SectionHeader } from '../ui/SectionHeader.jsx';
import { ViralRecipe } from '../ViralRecipe.jsx';
import { GrowthStrategy } from '../GrowthStrategy.jsx';
import { StrategyBrief } from '../StrategyBrief.jsx';
import { ContentCalendar } from '../ContentCalendar.jsx';
import { marketInsightsExtended } from '../../lib/analytics.js';

export function AccountInsights({ account, insights }) {
  const { marketInsights, marketInsightsExtended: extendedInsights, aggregates } = insights;
  const insightsForPanel = extendedInsights ?? marketInsightsExtended({ ...account, aggregates }, insights) ?? marketInsights;

  return (
    <div className="space-y-6">
      {/* SWOT-style insights panel */}
      <div className="surface p-5">
        <SectionHeader
          icon={Lightbulb}
          title={`Insight & Rekomendasi (${insightsForPanel.strengths.length} kekuatan · ${insightsForPanel.weaknesses.length} kelemahan · ${insightsForPanel.recommendations.length} aksi)`}
          subtitle="Dihasilkan otomatis dari 9+ analytics primitives (mix, cadence, viral, pillar, hook, hashtag, velocity, availability)"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
          <div className="bg-accent-success/5 border border-accent-success/20 rounded-lg p-4">
            <div className="text-xs font-semibold text-accent-success uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> Kekuatan ({insightsForPanel.strengths.length})
            </div>
            <ul className="text-sm text-text-secondary space-y-1.5 list-disc list-inside">
              {insightsForPanel.strengths.map((s, i) => <li key={i} className="leading-relaxed">{s}</li>)}
            </ul>
          </div>
          <div className="bg-accent-danger/5 border border-accent-danger/20 rounded-lg p-4">
            <div className="text-xs font-semibold text-accent-danger uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> Kelemahan ({insightsForPanel.weaknesses.length})
            </div>
            <ul className="text-sm text-text-secondary space-y-1.5 list-disc list-inside">
              {insightsForPanel.weaknesses.map((w, i) => <li key={i} className="leading-relaxed">{w}</li>)}
            </ul>
          </div>
          <div className="bg-accent-primary/5 border border-accent-primary/20 rounded-lg p-4">
            <div className="text-xs font-semibold text-accent-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" /> Rekomendasi ({insightsForPanel.recommendations.length})
            </div>
            <ul className="text-sm text-text-secondary space-y-1.5 list-disc list-inside">
              {insightsForPanel.recommendations.map((r, i) => <li key={i} className="leading-relaxed">{r}</li>)}
            </ul>
          </div>
        </div>
      </div>

      <StrategyBrief account={account} insights={insights} />
      <ViralRecipe insights={insights} account={account} />
      <GrowthStrategy insights={insights} account={account} />
      <ContentCalendar account={account} insights={insights} />
    </div>
  );
}
