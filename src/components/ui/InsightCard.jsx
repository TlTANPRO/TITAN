// InsightCard — Linear-style empty state for insight panels.
// Variants: 'empty' (data not generated yet), 'loading', 'success' (with body).
// Replaces bare "Insight belum tersedia" EmptyState with a more designed surface.
import { Sparkles, Loader2 } from 'lucide-react';

export function InsightCard({ status = 'empty', title, description, children, accent = 'accent-primary' }) {
  const accentText = {
    'accent-primary': 'text-accent-primary',
    'accent-secondary': 'text-accent-secondary',
    'pink-500': 'text-pink-500',
    'purple-500': 'text-purple-500',
    'cyan-500': 'text-cyan-500',
    'emerald-500': 'text-emerald-500'
  }[accent] || 'text-accent-primary';

  if (status === 'loading') {
    return (
      <div className="surface p-5 flex items-center gap-3">
        <Loader2 className={`w-4 h-4 animate-spin ${accentText}`} />
        <span className="text-sm text-text-muted">{title}</span>
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <div className="surface p-5">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className={`w-4 h-4 ${accentText} opacity-60`} />
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
            {title}
          </span>
        </div>
        <p className="text-sm text-text-muted leading-relaxed">{description}</p>
      </div>
    );
  }

  return (
    <div className="surface p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className={`w-4 h-4 ${accentText}`} />
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}
