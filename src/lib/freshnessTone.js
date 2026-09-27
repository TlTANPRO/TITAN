// Single source of truth for mapping a freshness tone (from dataFreshness.js)
// onto design tokens. Extracted from PortfolioStatus so Hero and AccountCard
// colour staleness identically instead of each inventing their own classes.

const TONE = {
  success: {
    dot: 'bg-accent-success',
    text: 'text-accent-success',
    border: 'border-accent-success/30',
    background: 'bg-accent-success/10'
  },
  warning: {
    dot: 'bg-accent-warning',
    text: 'text-accent-warning',
    border: 'border-accent-warning/30',
    background: 'bg-accent-warning/10'
  },
  danger: {
    dot: 'bg-accent-danger',
    text: 'text-accent-danger',
    border: 'border-accent-danger/30',
    background: 'bg-accent-danger/10'
  },
  neutral: {
    dot: 'bg-text-muted',
    text: 'text-text-muted',
    border: 'border-border-subtle',
    background: 'bg-bg-tertiary'
  }
};

export function toneStyle(tone) {
  return TONE[tone] ?? TONE.neutral;
}

export { TONE };
export default TONE;
