// V34: DataFreshnessBadge — global data freshness indicator for the Topbar.
// Aggregates the latest post timestamp across ALL accounts → one chip:
//   green "Data fresh · 2j lalu"  | amber "Stale · 3h"  | red "Stale · 12h"
// Design canon: single accent, tnum, no animation (reduced-motion safe).
import { useMemo } from 'react';
import { useAccounts } from '../../hooks/useAccount.js';

function latestPostMs(accounts) {
  let latest = 0;
  for (const a of accounts) {
    for (const p of a.posts ?? []) {
      const t = Number(p.createTime ?? 0);
      if (t > latest) latest = t;
    }
  }
  return latest > 0 ? (latest > 1e12 ? latest : latest * 1000) : 0;
}

function relTime(ms) {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}j lalu`;
  return `${Math.floor(hours / 24)}h lalu`;
}

export function useDataFreshness() {
  const accounts = useAccounts();
  return useMemo(() => {
    const latest = latestPostMs(accounts);
    if (!latest) return { tone: 'neutral', label: 'Tanpa data' };
    const age = Date.now() - latest;
    if (age < 24 * 3600e3) return { tone: 'success', label: `Data fresh · ${relTime(age)}` };
    if (age < 72 * 3600e3) return { tone: 'warning', label: `Stale · ${relTime(age)}` };
    return { tone: 'danger', label: `Stale · ${relTime(age)}` };
  }, [accounts]);
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
      title="Usia postingan terbaru di seluruh akun"
      aria-live="polite"
      aria-label={`Status data: ${f.label}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {f.label}
    </span>
  );
}
