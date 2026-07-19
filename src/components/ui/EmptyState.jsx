// V21: Standardized empty/error states. Use in every async section that
// can have no data. Renders a centered icon + title + description + optional
// action button. Respects dark/light theme via semantic tokens.
import { Inbox } from 'lucide-react';

export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4">
      <div className="w-12 h-12 rounded-full bg-bg-tertiary flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-text-muted" />
      </div>
      {title && <div className="text-sm font-semibold text-text-primary mb-1">{title}</div>}
      {description && <div className="text-xs text-text-muted max-w-sm">{description}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Gagal memuat data', description, action, icon: Icon }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4 border border-accent-danger/20 rounded-2xl bg-accent-danger/5">
      <div className="w-12 h-12 rounded-full bg-accent-danger/10 flex items-center justify-center mb-3">
        {Icon ? <Icon className="w-5 h-5 text-accent-danger" /> : <span className="text-xl">⚠️</span>}
      </div>
      <div className="text-sm font-semibold text-text-primary mb-1">{title}</div>
      {description && <div className="text-xs text-text-muted max-w-sm">{description}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
