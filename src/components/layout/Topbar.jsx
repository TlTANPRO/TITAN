// V21: Topbar — search · global period filter · refresh · user menu.
// Replaces inline TopbarActions pattern. Used in AppShell.
import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, RefreshCw, AlertTriangle, Loader2, CheckCircle2, XCircle, Settings as SettingsIcon, Filter } from 'lucide-react';
import { useAccounts } from '../../hooks/useAccount.js';
import { AccountListPopover } from '../AccountListPopover.jsx';
import ThemeToggle from '../ThemeToggle.jsx';
import { triggerSoftRefresh } from '../../lib/refreshClient.js';
import { dataAvailability } from '../../lib/analytics.js';
import { usePeriod, PERIOD_OPTIONS } from '../../hooks/usePeriod.js';

export function Topbar({ limitedCount = 0 }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [searchValue, setSearchValue] = useState('');
  const accounts = useAccounts();
  const navigate = useNavigate();
  const location = useLocation();
  const { period, setPeriod } = usePeriod();

  useEffect(() => {
    const stored = window.localStorage.getItem('titan.lastUpdated.v1');
    if (stored) setLastUpdated(stored);
  }, [accounts]);

  const handleSoftRefresh = useCallback(async () => {
    setStatus('loading');
    setMessage('Memuat data…');
    setProgress(0);
    const tick = setInterval(() => setProgress((p) => (p < 90 ? p + 6 : p)), 100);
    try {
      const result = await triggerSoftRefresh();
      clearInterval(tick);
      if (result.ok) {
        setProgress(100);
        setStatus('success');
        const generatedAt = result.generatedAt ?? new Date().toISOString();
        setMessage(
          result.fallback
            ? `Cache refresh (${result.totalPosts ?? '?'} post)`
            : `${result.totalPosts ?? '?'} post dimuat`
        );
        setLastUpdated(generatedAt);
        window.localStorage.setItem('titan.lastUpdated.v1', generatedAt);
        setTimeout(() => { setStatus('idle'); setProgress(0); }, 4000);
      } else {
        setStatus('error');
        setMessage(result.error ?? 'Refresh gagal');
        setTimeout(() => { setStatus('idle'); setProgress(0); }, 6000);
      }
    } catch (err) {
      clearInterval(tick);
      setStatus('error');
      setMessage(err?.message ?? 'Tidak dapat menghubungi Worker');
      setTimeout(() => { setStatus('idle'); setProgress(0); }, 6000);
    }
  }, []);

  // Derive page title from route
  const pageTitle = (() => {
    if (location.pathname === '/') return 'TITAN · Home';
    if (location.pathname === '/account') return 'Daftar Akun';
    if (location.pathname === '/compare') return 'Bandingkan Akun';
    if (location.pathname === '/calendar') return 'Kalender Konten';
    if (location.pathname === '/library') return 'Library Post';
    if (location.pathname === '/ai') return 'AI Insights';
    if (location.pathname === '/settings') return 'Settings';
    if (location.pathname.startsWith('/account/')) return null; // AccountPage renders its own
    return 'TITAN';
  })();

  // Search submit → jump to /library?q=
  const handleSearchSubmit = useCallback((e) => {
    e.preventDefault();
    if (searchValue.trim()) {
      navigate(`/library?q=${encodeURIComponent(searchValue.trim())}`);
    }
  }, [navigate, searchValue]);

  return (
    <header className="sticky top-0 z-sticky bg-bg-secondary/80 backdrop-blur border-b border-border-subtle">
      <div className="flex items-center gap-3 px-4 md:px-6 py-3">
        {pageTitle && (
          <h1 className="text-sm font-semibold text-text-primary whitespace-nowrap hidden md:block">
            {pageTitle}
          </h1>
        )}

        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
            <input
              type="search"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Cari akun atau post…"
              aria-label="Search"
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-bg-tertiary border border-border-subtle rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent"
            />
          </div>
        </form>

        <div className="flex-1" />

        {/* Period filter */}
        <div className="hidden sm:flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-text-muted" />
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            aria-label="Periode filter"
            className="text-xs bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Status indicator */}
        {status === 'loading' && (
          <span className="chip bg-accent-primary/10 text-accent-primary">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="hidden md:inline">{message}</span>
            <span className="md:hidden">{progress}%</span>
          </span>
        )}
        {status === 'success' && (
          <span className="chip bg-accent-success/10 text-accent-success">
            <CheckCircle2 className="w-3 h-3" />
            <span className="hidden md:inline">{message}</span>
          </span>
        )}
        {status === 'error' && (
          <span className="chip bg-accent-danger/10 text-accent-danger">
            <XCircle className="w-3 h-3" />
            <span className="hidden md:inline">{message}</span>
          </span>
        )}

        {limitedCount > 0 && (
          <span className="chip bg-accent-warning/10 text-accent-warning" title="Akun perlu enrichment">
            <AlertTriangle className="w-3 h-3" />
            <span className="hidden lg:inline">{limitedCount} perlu enrichment</span>
          </span>
        )}

        {lastUpdated && status === 'idle' && (
          <span className="hidden xl:inline text-[10px] text-text-muted">
            Update {new Date(lastUpdated).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}

        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label="Buka daftar akun"
            className="btn-secondary !px-3 !py-1.5 text-sm flex items-center gap-1.5"
          >
            <span className="hidden sm:inline">Akun</span>
          </button>
          {open && (
            <AccountListPopover
              accounts={accounts}
              onClose={() => setOpen(false)}
            />
          )}
        </div>

        <button
          onClick={handleSoftRefresh}
          disabled={status === 'loading'}
          aria-label="Soft refresh"
          className="btn-primary !px-3 !py-1.5 text-sm flex items-center gap-1.5 disabled:opacity-50"
          title="Reload data dari server (soft)"
        >
          <RefreshCw className={`w-4 h-4 ${status === 'loading' ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>

        <button
          onClick={() => navigate('/settings')}
          aria-label="Settings"
          className="btn-secondary !px-3 !py-1.5 text-sm flex items-center gap-1.5"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>

        <ThemeToggle />
      </div>
    </header>
  );
}
