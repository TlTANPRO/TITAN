// V21: AppShell — wraps all routes with Sidebar + Topbar + main content area.
// V39: also primes the data manifest so the portfolio status panel has real
// freshness numbers before the full dataset finishes downloading.
import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';
import { useAccounts } from '../../hooks/useAccount.js';
import { dataAvailability } from '../../lib/analytics.js';
import { primeManifest } from '../../lib/dataManifest.js';

export function AppShell() {
  const accounts = useAccounts();
  const limitedCount = accounts.filter((a) => {
    const av = dataAvailability(a.posts ?? [], a.platform);
    return av && !av.hasRealData;
  }).length;

  // Apply persisted theme on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('titan.theme.v1');
    if (stored === 'light') document.documentElement.classList.remove('dark');
    else if (stored === 'dark' || !stored) document.documentElement.classList.add('dark');
  }, []);

  // Start the manifest fetch alongside the full dataset so both race in
  // parallel; the manifest wins the first paint because it is ~KB vs ~MB.
  useEffect(() => {
    primeManifest();
  }, []);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex">
      <Sidebar limitedCount={limitedCount} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar limitedCount={limitedCount} />
        <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none pb-20 sm:pb-6 titan-motion-page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
