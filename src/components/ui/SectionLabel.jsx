// SectionLabel — Linear-style section header with number + colored accent bar.
// Used in Home bento to visually separate content categories.
// Variants:
//   accent (default blue) | pink | purple | cyan | emerald
//   tone="solid" (default) | "muted"
export function SectionLabel({ number, title, accent = 'accent', action, className = '' }) {
  const accentClass = {
    accent: 'bg-accent-primary',
    pink: 'bg-pink-500',
    purple: 'bg-purple-500',
    cyan: 'bg-cyan-500',
    emerald: 'bg-emerald-500',
    warning: 'bg-accent-warning'
  }[accent] || 'bg-accent-primary';

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className={`w-1 h-5 rounded-sm flex-shrink-0 ${accentClass}`} aria-hidden="true" />
      {number && (
        <span className="text-[10px] font-mono text-text-muted tabular-nums tracking-wider">
          {String(number).padStart(2, '0')}
        </span>
      )}
      <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
        {title}
      </h2>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}
