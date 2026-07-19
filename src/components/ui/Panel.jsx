// V21: Panel — bento panel with title, subtitle, optional action, content.
import { Surface } from './Surface.jsx';

export function Panel({
  title,
  subtitle,
  icon: Icon,
  action = null,
  variant = 'default',
  padding = 'p-4',
  className = '',
  children
}) {
  return (
    <Surface variant={variant} padding={padding} className={className}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0 flex-1">
            {title && (
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2 truncate">
                {Icon && <Icon className="w-4 h-4 text-accent-primary flex-shrink-0" />}
                <span className="truncate">{title}</span>
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-text-muted mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </Surface>
  );
}
