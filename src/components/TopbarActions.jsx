// TopbarActions — replaces the inline topbar that lived in Home.jsx. Now used
// in both Home and AccountPage so users always have access to LIST + REFRESH.
// V11: default behavior is soft refresh (cache-bust only, no scraping).
// Hard refresh (full scrape) is in /settings behind login. Progress %
// shows during in-flight refresh.
import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, RefreshCw, AlertTriangle, Loader2, CheckCircle2, XCircle, Settings } from 'lucide-react';
import { useAccounts } from '../hooks/useAccount.js';
import { AccountListPopover } from './AccountListPopover.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import { triggerSoftRefresh } from '../lib/refreshClient.js';
import { dataAvailability } from '../lib/analytics.js';

export function TopbarActions({ title, subtitle, onAfterRefresh }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState(0); // 0..100
  const [lastUpdated, setLastUpdated] = useState(null); // ISO string
  const accounts = useAccounts();
  const navigate = useNavigate();

  const limitedCount = accounts.filter((a) => {
    const av = dataAvailability(a.posts ?? [], a.platform);
    return av && !av.hasRealData;
  }).length;

  // Read lastUpdated from accounts-full.json (dataStore subscription)
  useEffect(() => {
    const stored = window.localStorage.getItem('titan.lastUpdated.v1');
    if (stored) setLastUpdated(stored);
  }, [accounts]);

  const handleSoftRefresh = useCallback(async () => {
    setStatus('loading');
    setMessage('Memuat data…');
    setProgress(0);
    // Animate progress to ~90% over 3s (soft refresh is usually < 1s)
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
        onAfterRefresh?.(result);
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
  }, [onAfterRefresh]);

  return (
    <header className="border-b border-border-subtle bg-bg-secondary/50 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl font-bold text-text-primary tracking-tight truncate">
            {title ?? 'TITAN'}
          </h1>
          {subtitle ? (
            <p className="text-xs text-text-muted mt-0.5 truncate">{subtitle}</p>
          ) : (
            <p className="text-xs text-text-muted mt-0.5">
              Social Media Marketing Intelligence · V11
              {lastUpdated ? ` · Update ${new Date(lastUpdated).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs flex-wrap justify-end">
          {limitedCount > 0 && (
            <button
              onClick={() => navigate('/')}
              className="chip bg-accent-warning/10 text-accent-warning hover:bg-accent-warning/20 transition-colors"
              title="Akun dengan data terbatas (perlu enrichment)"
            >
              <AlertTriangle className="w-3 h-3" />
              <span className="hidden sm:inline">{limitedCount} akun perlu enrichment</span>
              <span className="sm:hidden">{limitedCount}</span>
            </button>
          )}
          {status === 'loading' && (
            <span
              className="chip bg-accent-primary/10 text-accent-primary min-w-[120px]"
              title={message}
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="hidden md:inline">{message}</span>
              <span className="md:hidden">{progress}%</span>
              <span className="hidden md:inline tabular-nums opacity-70">{progress}%</span>
            </span>
          )}
          {status === 'success' && (
            <span className="chip bg-accent-success/10 text-accent-success" title={message}>
              <CheckCircle2 className="w-3 h-3" />
              <span className="hidden md:inline">{message}</span>
            </span>
          )}
          {status === 'error' && (
            <span className="chip bg-accent-danger/10 text-accent-danger" title={message}>
              <XCircle className="w-3 h-3" />
              <span className="hidden md:inline">{message}</span>
            </span>
          )}
          <div className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label="Buka daftar akun"
              className="btn-secondary !px-3 !py-2 text-sm flex items-center gap-1.5"
            >
              <Users className="w-4 h-4" />
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
            aria-label="Soft refresh (re-fetch data JSON)"
            className="btn-primary !px-3 !py-2 text-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Reload data dari server (soft, tanpa scraping)"
          >
            <RefreshCw className={`w-4 h-4 ${status === 'loading' ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={() => navigate('/settings')}
            aria-label="Buka Settings"
            className="btn-secondary !px-3 !py-2 text-sm flex items-center gap-1.5"
            title="Settings & hard refresh (perlu login)"
          >
            <Settings className="w-4 h-4" />
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
