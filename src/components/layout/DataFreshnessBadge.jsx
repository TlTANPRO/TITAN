// V38: DataFreshnessBadge — global content freshness indicator for the Topbar.
// The badge describes the newest observed post, not merely the pipeline run time.
// Design canon: single accent, tnum, no animation (reduced-motion safe).
import { useMemo } from 'react';
import { useAccounts } from '../../hooks/useAccount.js';
import { getPortfolioFreshness } from '../../lib/dataFreshness.js';

export function useDataFreshness() {
  const accounts = useAccounts();
  return useMemo(() => getPortfolioFreshness(accounts), [accounts]);
}

export function DataFreshnessBadge() {
  const f = useDataFreshness();
  const toneClass = {
    success: 'bg-accent-success/10 text-accent-success border border-accent-success/30',
    warning: 'bg-accent-warning/10 text-accent-warning border border-accent-warning/30',
    danger: 'bg-accent-danger/10 text-accent-danger border border-accent-danger/30',
    neutral: 'bg-bg-tertiary text-text-muted border border-border-subtle'
  }[f.tone];
  const dot = {
    success: 'bg-accent-success',
    warning: 'bg-accent-warning',
    danger: 'bg-accent-danger',
    neutral: 'bg-text-muted'
  }[f.tone];
  return (
    <span
      className={`hidden md:inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold tabular-nums ${toneClass}`}
      title="Usia konten terbaru di seluruh akun"
      aria-live="polite"
      aria-label={`Status konten: ${f.label}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {f.label}
    </span>
  );
}
