// V21: /settings — Settings page (General, Data, Accounts, AI, About sections).
// Vertical tabs layout. Hard refresh behind simple password gate.
import { useState } from 'react';
import { Settings as SettingsIcon, Database, Users, Bot, Info, ShieldAlert, KeyRound } from 'lucide-react';
import { useAccounts } from '../hooks/useAccount.js';
import { FreshnessBadge } from '../components/ui/FreshnessBadge.jsx';
import { ProxiedAvatar } from '../components/ProxiedAvatar.jsx';
import { PlatformIcon, platformLabel } from '../components/icons/PlatformIcon.jsx';
import { triggerHardRefresh } from '../lib/refreshClient.js';
import { formatNumber } from '../lib/format.js';

const SECTIONS = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'data', label: 'Data & Refresh', icon: Database },
  { id: 'accounts', label: 'Accounts', icon: Users },
  { id: 'ai', label: 'AI', icon: Bot },
  { id: 'about', label: 'About', icon: Info }
];

export default function Settings() {
  const accounts = useAccounts();
  const [activeSection, setActiveSection] = useState('general');
  const [userName, setUserName] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem('titan.userName.v1') ?? '';
  });
  const [hardRefreshPassword, setHardRefreshPassword] = useState('');
  const [hardRefreshStatus, setHardRefreshStatus] = useState(null);

  const saveUserName = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('titan.userName.v1', userName);
    }
  };

  const handleHardRefresh = async () => {
    setHardRefreshStatus({ status: 'loading' });
    const result = await triggerHardRefresh();
    if (result.ok) {
      setHardRefreshStatus({ status: 'success', message: result.message, jobId: result.jobId });
    } else {
      setHardRefreshStatus({ status: 'error', error: result.error });
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-text-primary mb-4">Settings</h1>

      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
        {/* Sidebar tabs */}
        <nav className="surface p-2 h-fit space-y-0.5">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium
                  transition-colors text-left
                  ${activeSection === s.id
                    ? 'bg-accent-primary/10 text-accent-primary'
                    : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* Section content */}
        <div className="surface p-5 space-y-4">
          {activeSection === 'general' && (
            <>
              <h2 className="text-lg font-bold text-text-primary">General</h2>
              <div>
                <label htmlFor="username" className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Nama panggilan (untuk AI chat)
                </label>
                <div className="flex gap-2 mt-1">
                  <input
                    id="username"
                    name="username"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Syahfalah"
                    autoComplete="off"
                    className="flex-1 px-3 py-1.5 text-sm bg-bg-tertiary border border-border-subtle rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                  />
                  <button onClick={saveUserName} className="btn-primary !px-4 !py-1.5 text-sm">Simpan</button>
                </div>
              </div>
            </>
          )}

          {activeSection === 'data' && (
            <>
              <h2 className="text-lg font-bold text-text-primary">Data & Refresh</h2>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-text-muted">Total akun</div>
                  <div className="text-xl font-bold text-text-primary tabular-nums">{accounts.length}</div>
                </div>
                <div>
                  <div className="text-text-muted">Total post</div>
                  <div className="text-xl font-bold text-text-primary tabular-nums">
                    {formatNumber(accounts.reduce((s, a) => s + (a.posts?.length ?? 0), 0))}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border-subtle">
                <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-2">
                  <ShieldAlert className="w-4 h-4 text-accent-warning" />
                  Hard Refresh (full re-scrape)
                </h3>
                <p className="text-xs text-text-muted mb-3">
                  Memicu GitHub Actions workflow scrape ulang. Butuh password. Butuh waktu 25-40 menit.
                </p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                    <input
                      id="hard-refresh-password"
                      name="hardRefreshPassword"
                      type="password"
                      value={hardRefreshPassword}
                      onChange={(e) => setHardRefreshPassword(e.target.value)}
                      placeholder="Password"
                      autoComplete="current-password"
                      className="w-full pl-9 pr-3 py-1.5 text-sm bg-bg-tertiary border border-border-subtle rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                    />
                  </div>
                  <button
                    onClick={handleHardRefresh}
                    disabled={!hardRefreshPassword || hardRefreshStatus?.status === 'loading'}
                    className="btn-primary !px-4 !py-1.5 text-sm disabled:opacity-50"
                  >
                    {hardRefreshStatus?.status === 'loading' ? 'Memulai…' : 'Trigger Hard Refresh'}
                  </button>
                </div>
                {hardRefreshStatus?.status === 'success' && (
                  <div className="mt-2 text-xs text-accent-success">{hardRefreshStatus.message}</div>
                )}
                {hardRefreshStatus?.status === 'error' && (
                  <div className="mt-2 text-xs text-accent-danger">{hardRefreshStatus.error}</div>
                )}
              </div>
            </>
          )}

          {activeSection === 'accounts' && (
            <>
              <h2 className="text-lg font-bold text-text-primary">Accounts</h2>
              <p className="text-xs text-text-muted">9 akun yang di-scrape otomatis tiap hari</p>
              <div className="divide-y divide-border-subtle">
                {accounts.map((a) => (
                  <div key={a.slug} className="flex items-center gap-3 py-2.5">
                    <ProxiedAvatar account={a} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-text-primary">@{a.username}</div>
                      <div className="text-xs text-text-muted flex items-center gap-1.5">
                        <PlatformIcon platform={a.platform} className="w-3 h-3" />
                        {platformLabel(a.platform)} · {formatNumber(a.followerCount)} followers · {formatNumber(a.posts?.length ?? 0)} posts
                      </div>
                    </div>
                    <FreshnessBadge lastPostAt={a.lastPostAt} />
                  </div>
                ))}
              </div>
            </>
          )}

          {activeSection === 'ai' && (
            <>
              <h2 className="text-lg font-bold text-text-primary">AI Configuration</h2>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-xs font-semibold text-text-muted uppercase tracking-wider">LLM Proxy</div>
                  <div className="text-xs text-text-secondary font-mono break-all mt-0.5">
                    {import.meta.env.VITE_LLM_PROXY_URL || '—'}
                  </div>
                </div>
                <div className="pt-3 border-t border-border-subtle">
                  <p className="text-xs text-text-muted">
                    AI text di-cache di <code className="bg-bg-tertiary px-1 rounded">src/data/ai-insights.json</code>.
                    Regenerate dengan: <code className="bg-bg-tertiary px-1 rounded">pnpm insights:generate</code>
                  </p>
                </div>
              </div>
            </>
          )}

          {activeSection === 'about' && (
            <>
              <h2 className="text-lg font-bold text-text-primary">About TITAN</h2>
              <div className="space-y-2 text-sm text-text-secondary">
                <div><strong className="text-text-primary">Version:</strong> 21.0</div>
                <div><strong className="text-text-primary">Description:</strong> Social Media Marketing Intelligence Dashboard</div>
                <div><strong className="text-text-primary">Stack:</strong> React 18 · Vite · Tailwind · recharts</div>
                <div><strong className="text-text-primary">Data source:</strong> 4 Instagram + 5 TikTok akun</div>
                <div><strong className="text-text-primary">Live:</strong> <a href="https://tltanpro.github.io/TITAN/" className="text-accent-primary hover:underline">tltanpro.github.io/TITAN</a></div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
