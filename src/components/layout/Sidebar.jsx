// V21: Sidebar — persistent navigation. Inspired by vue-element-admin + Strapi.
// Collapsible to icon-only at <1024px. Active route highlighted.
// Badge support for items needing attention (e.g. "akun perlu enrichment").
import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Home, Users, GitCompareArrows, Calendar as CalIcon, Library, Sparkles, Settings,
  ChevronLeft, ChevronRight, X
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home, exact: true },
  { to: '/account', label: 'Akun', icon: Users },
  { to: '/compare', label: 'Bandingkan', icon: GitCompareArrows },
  { to: '/calendar', label: 'Kalender', icon: CalIcon },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/ai', label: 'AI Lab', icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: Settings }
];

const STORAGE_KEY = 'titan.sidebar.collapsed.v1';

export function Sidebar({ limitedCount = 0 }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // Auto-close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const width = collapsed ? 'w-16' : 'w-56';

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-overlay lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed lg:sticky top-0 left-0 z-sticky lg:z-base
          h-screen ${width} bg-bg-secondary border-r border-border-subtle
          flex flex-col transition-[width] duration-base ease-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        aria-label="Main navigation"
      >
        {/* Logo + collapse button */}
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 py-4 border-b border-border-subtle`}>
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center text-white font-bold text-sm">T</div>
              <span className="font-bold text-sm tracking-tight text-text-primary">TITAN</span>
            </div>
          )}
          {collapsed && (
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center text-white font-bold text-sm">T</div>
          )}
          <button
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`hidden lg:flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-text-primary hover:bg-bg-tertiary ${collapsed ? '' : ''}`}
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const badge = item.to === '/account' && limitedCount > 0 ? limitedCount : null;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) => `
                  group relative flex items-center gap-3 ${collapsed ? 'justify-center' : ''}
                  px-3 py-2 rounded-md text-sm font-medium
                  transition-colors duration-fast
                  ${isActive
                    ? 'bg-accent-primary/10 text-accent-primary'
                    : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                  }
                `}
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-accent-primary" />
                    )}
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {!collapsed && badge != null && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-accent-warning/20 text-accent-warning">
                        {badge}
                      </span>
                    )}
                    {collapsed && badge != null && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-accent-warning" />
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer version */}
        {!collapsed && (
          <div className="px-3 py-2 border-t border-border-subtle text-[10px] text-text-muted">
            <div>TITAN V21.0</div>
            <div className="mt-0.5">Marketing Intelligence</div>
          </div>
        )}
      </aside>

      {/* Mobile toggle button — rendered separately via parent or just hidden if drawer auto-renders */}
      <button
        onClick={() => setMobileOpen((v) => !v)}
        aria-label={mobileOpen ? 'Tutup navigasi' : 'Buka navigasi'}
        aria-expanded={mobileOpen}
        className="lg:hidden fixed bottom-4 left-4 z-toast w-10 h-10 rounded-full bg-accent-primary text-white shadow-lg flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
      </button>
    </>
  );
}
