// V21: SectionHeader — h2 with icon, title, optional subtitle + action.
export function SectionHeader({ icon: Icon, title, subtitle = null, action = null, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-2 mb-3 ${className}`}>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-accent-primary flex-shrink-0" />}
          <span className="truncate">{title}</span>
        </h2>
        {subtitle && <p className="text-xs text-text-muted mt-1 truncate">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
