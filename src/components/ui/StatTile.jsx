// V21: StatTile — small KPI box (AdminLTE small-box pattern).
// Used in Home hero + AccountPage overview. Renders icon + label + value + optional delta.
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

const TONE_CLASSES = {
  primary: 'text-accent-primary',
  success: 'text-accent-success',
  warning: 'text-accent-warning',
  danger: 'text-accent-danger',
  muted: 'text-text-muted'
};

export function StatTile({ icon: Icon, label, value, delta, deltaTone = 'muted', tone = 'primary', sublabel, className = '' }) {
  const toneClass = TONE_CLASSES[tone] ?? TONE_CLASSES.primary;
  const deltaClass = TONE_CLASSES[deltaTone] ?? TONE_CLASSES.muted;
  const DeltaIcon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;

  return (
    <div className={`surface p-4 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider truncate">
            {label}
          </div>
          <div className={`text-2xl font-bold tabular-nums mt-1 ${toneClass}`}>
            {value}
          </div>
          {sublabel && (
            <div className="text-[10px] text-text-muted mt-0.5 truncate">{sublabel}</div>
          )}
        </div>
        {Icon && (
          <div className={`flex-shrink-0 w-9 h-9 rounded-lg bg-bg-tertiary flex items-center justify-center ${toneClass}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      {delta != null && (
        <div className={`flex items-center gap-1 mt-2 text-[11px] font-semibold tabular-nums ${deltaClass}`}>
          <DeltaIcon className="w-3 h-3" />
          <span>{delta > 0 ? '+' : ''}{delta}</span>
        </div>
      )}
    </div>
  );
}
