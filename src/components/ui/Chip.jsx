// V21: Chip — standardized status pill with tone variant.
// Replaces inline `chip` class. Tones: success / warning / danger / info / neutral / primary.
import { CheckCircle2, AlertTriangle, XCircle, Info, Circle } from 'lucide-react';

const TONE_CLASSES = {
  success: 'bg-accent-success/10 text-accent-success border-accent-success/30',
  warning: 'bg-accent-warning/10 text-accent-warning border-accent-warning/30',
  danger: 'bg-accent-danger/10 text-accent-danger border-accent-danger/30',
  info: 'bg-sky-500/10 text-sky-500 border-sky-500/30',
  primary: 'bg-accent-primary/10 text-accent-primary border-accent-primary/30',
  neutral: 'bg-bg-tertiary text-text-secondary border-border-subtle'
};

const TONE_ICON = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
  primary: Info,
  neutral: Circle
};

export function Chip({ tone = 'neutral', children, icon: IconOverride, size = 'md', className = '' }) {
  const toneClass = TONE_CLASSES[tone] ?? TONE_CLASSES.neutral;
  const Icon = IconOverride ?? TONE_ICON[tone] ?? Circle;
  const sizeClass = size === 'sm' ? 'text-[10px] px-1.5 py-0.5 gap-1' : 'text-xs px-2.5 py-1 gap-1.5';

  return (
    <span className={`inline-flex items-center rounded-full border font-medium ${toneClass} ${sizeClass} ${className}`}>
      <Icon className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      {children}
    </span>
  );
}
