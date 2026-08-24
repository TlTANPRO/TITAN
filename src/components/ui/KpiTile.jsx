// V36: KpiTile — single source for KPI tiles across all pages.
// Replaces inline duplicates in Admin.jsx (was KpiTile there) and StatTile.
// Display typography + delta chip + optional sparkline slot + accent prop.
import { formatNumber, formatPercent } from '../../lib/format.js';

export const KPI_TONE = {
  primary:   { text: 'text-accent-primary',   bar: 'bg-accent-primary',   iconBg: 'bg-accent-primary/10' },
  brand:     { text: 'text-accent-brand',     bar: 'bg-accent-brand',     iconBg: 'bg-accent-brand/10' },
  success:   { text: 'text-accent-success',   bar: 'bg-accent-success',   iconBg: 'bg-accent-success/10' },
  warning:   { text: 'text-accent-warning',   bar: 'bg-accent-warning',   iconBg: 'bg-accent-warning/10' },
  danger:    { text: 'text-accent-danger',    bar: 'bg-accent-danger',    iconBg: 'bg-accent-danger/10' },
  instagram: { text: 'text-accent-instagram', bar: 'bg-accent-instagram', iconBg: 'bg-accent-instagram/10' },
  tiktok:    { text: 'text-accent-tiktok',    bar: 'bg-accent-tiktok',    iconBg: 'bg-accent-tiktok/10' }
};

// delta: { value: number, suffix?: '%' } — positive = up (success), negative = down (danger)
export function KpiTile({ icon, label, value, accent = 'primary', delta, format = 'number', children }) {
  const tone = KPI_TONE[accent] ?? KPI_TONE.primary;
  const display =
    format === 'percent' ? formatPercent(value)
    : format === 'raw' ? value
    : formatNumber(value);

  const deltaEl = delta && Number.isFinite(delta.value) && delta.value !== 0 ? (
    <span
      className={`text-[10px] font-semibold tabular-nums px-1 py-0.5 rounded ${
        delta.value > 0 ? 'text-accent-success bg-accent-success/10' : 'text-accent-danger bg-accent-danger/10'
      }`}
    >
      {delta.value > 0 ? '↑' : '↓'} {Math.abs(delta.value).toFixed(1)}{delta.suffix ?? '%'}
    </span>
  ) : null;

  return (
    <div className="relative surface p-4 overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${tone.bar}`} aria-hidden="true" />
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md ${tone.iconBg} ${tone.text}`}>
          {icon}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">{label}</span>
        {deltaEl}
      </div>
      <div className="text-display-lg text-text-primary tabular-nums leading-none">{display}</div>
      {children}
    </div>
  );
}
