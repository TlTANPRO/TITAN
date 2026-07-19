// V21: Breadcrumb — route-derived breadcrumb.
import { Link, useLocation, useParams } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { useAccounts } from '../hooks/useAccount.js';

const ROUTE_LABELS = {
  '': 'Home',
  account: 'Akun',
  compare: 'Bandingkan',
  calendar: 'Kalender',
  library: 'Library',
  ai: 'AI Lab',
  settings: 'Settings'
};

export function Breadcrumb() {
  const location = useLocation();
  const params = useParams();
  const accounts = useAccounts();

  const parts = location.pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  const crumbs = [{ to: '/', label: <Home className="w-3.5 h-3.5" />, ariaLabel: 'Home' }];
  let path = '';
  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i];
    path += `/${segment}`;
    if (segment === params.slug) {
      // Account slug — look up username
      const acc = accounts.find((a) => a.slug === segment);
      crumbs.push({
        to: path,
        label: acc ? `@${acc.username}` : segment
      });
    } else {
      crumbs.push({
        to: path,
        label: ROUTE_LABELS[segment] ?? segment
      });
    }
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-text-muted">
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="w-3 h-3 opacity-50" />}
          {i === crumbs.length - 1 ? (
            <span className="font-semibold text-text-primary" aria-current="page">{c.label}</span>
          ) : (
            <Link
              to={c.to}
              aria-label={c.ariaLabel}
              className="hover:text-text-primary transition-colors"
            >
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
