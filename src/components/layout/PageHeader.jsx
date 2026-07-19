// V21: PageHeader — title block with icon, title, subtitle, optional breadcrumb + action.
import { Breadcrumb } from './Breadcrumb.jsx';

export function PageHeader({ icon: Icon, title, subtitle = null, action = null, showBreadcrumb = true, className = '' }) {
  return (
    <header className={`mb-4 ${className}`}>
      {showBreadcrumb && (
        <div className="mb-2">
          <Breadcrumb />
        </div>
      )}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            {Icon && <Icon className="w-6 h-6 text-accent-primary flex-shrink-0" />}
            <span className="truncate">{title}</span>
          </h1>
          {subtitle && <p className="text-sm text-text-muted mt-1">{subtitle}</p>}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
    </header>
  );
}
