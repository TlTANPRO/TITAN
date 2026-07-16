// SettingsPage — V11
// Internal-use only: hidden behind a frontend login (Mada/Ganteng).
// ⚠️ Frontend-only auth is NOT real security. Anyone can read source on
// GitHub Pages and extract the password. Use this only to hide
// destructive actions from curious end-users (e.g. random visitors who
// happen to find the route). For real auth, see Cloudflare Access or
// Worker-side password hashing.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings as SettingsIcon, Lock, AlertTriangle, RefreshCw, Loader2,
  CheckCircle2, XCircle, ArrowLeft, Calendar, Database
} from 'lucide-react';
import { triggerHardRefresh } from '../lib/refreshClient.js';

// Credentials (internal only). VITE_HARD_REFRESH_PASSWORD in env MUST match
// the value configured in Worker (env.HARD_REFRESH_PASSWORD) for hard refresh
// to actually run.
const INTERNAL_ID = 'Mada';
const INTERNAL_PASSWORD = 'Ganteng';
const AUTH_STORAGE_KEY = 'titan.settingsAuth.v1';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(AUTH_STORAGE_KEY) === '1';
  });
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Hard refresh state
  const [hrStatus, setHrStatus] = useState('idle'); // idle | loading | success | error
  const [hrMessage, setHrMessage] = useState('');
  const [hrProgress, setHrProgress] = useState(0);

  useEffect(() => {
    if (!authed) return;
    // Page-level session only — clears on tab close
  }, [authed]);

  const handleLogin = (e) => {
    e?.preventDefault?.();
    if (id === INTERNAL_ID && password === INTERNAL_PASSWORD) {
      setAuthed(true);
      setLoginError('');
      window.sessionStorage.setItem(AUTH_STORAGE_KEY, '1');
    } else {
      setLoginError('ID atau password salah');
    }
  };

  const handleLogout = () => {
    setAuthed(false);
    setId('');
    setPassword('');
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
  };

  const handleHardRefresh = async () => {
    if (!window.confirm(
      'Hard refresh akan scrape ulang SEMUA akun dari awal. ' +
      'Ini memakan token ENSEMBLEDATA dan waktu 5-10 menit. Lanjut?'
    )) return;
    setHrStatus('loading');
    setHrMessage('Menghubungi Worker…');
    setHrProgress(0);
    const tick = setInterval(() => setHrProgress((p) => Math.min(95, p + 3)), 1000);
    try {
      const r = await triggerHardRefresh();
      clearInterval(tick);
      if (r.ok) {
        setHrProgress(100);
        setHrStatus('success');
        setHrMessage(`Sukses dalam ${Math.round((r.durationMs ?? 0) / 1000)}s`);
        setTimeout(() => { setHrStatus('idle'); setHrProgress(0); }, 8000);
      } else {
        setHrStatus('error');
        setHrMessage(r.error ?? 'Hard refresh gagal');
        setTimeout(() => { setHrStatus('idle'); setHrProgress(0); }, 8000);
      }
    } catch (err) {
      clearInterval(tick);
      setHrStatus('error');
      setHrMessage(err?.message ?? 'Network error');
    }
  };

  // ============ Login screen ============
  if (!authed) {
    return (
      <main id="main-content" tabIndex={-1} className="min-h-screen flex items-center justify-center px-4 py-12 bg-bg-primary">
        <div className="w-full max-w-sm">
          <button
            onClick={() => navigate('/')}
            className="btn-secondary text-xs mb-4 inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3 h-3" /> Kembali ke Dashboard
          </button>
          <div className="surface p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-accent-primary" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-text-primary">Settings (Internal)</h1>
                <p className="text-xs text-text-muted">Khusus karyawan kantor</p>
              </div>
            </div>

            <div className="bg-accent-warning/10 border border-accent-warning/20 rounded-lg p-3 mb-4 text-xs text-text-secondary flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-accent-warning flex-shrink-0 mt-0.5" />
              <span>
                <strong>Internal use only.</strong> Login ini hanya frontend gate
                (bukan enkripsi). Jangan share URL settings ke orang luar.
              </span>
            </div>

            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="text-xs text-text-muted mb-1 block">ID</label>
                <input
                  type="text"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  className="w-full bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                />
              </div>
              {loginError && (
                <div className="text-xs text-accent-danger flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5" /> {loginError}
                </div>
              )}
              <button
                type="submit"
                className="btn-primary w-full text-sm"
              >
                Login
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  // ============ Authed dashboard ============
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-bg-primary px-4 md:px-6 py-6 md:py-8 pb-32 md:pb-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
              <SettingsIcon className="w-6 h-6 text-accent-primary" />
              Settings
            </h1>
            <p className="text-xs text-text-muted mt-1">Internal use only · {INTERNAL_ID}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/')}
              className="btn-secondary text-xs inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3 h-3" /> Dashboard
            </button>
            <button
              onClick={handleLogout}
              className="btn-secondary text-xs"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Hard refresh section */}
        <div className="surface p-5">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
            <Database className="w-4 h-4 text-accent-primary" />
            Hard Refresh (Full Scrape)
          </h2>
          <p className="text-xs text-text-muted mb-3">
            Trigger scrape ulang SEMUA akun dari awal. Pakai ENSEMBLEDATA token
            (~1500 calls untuk 9 akun) + waktu 5-10 menit. Defaultnya, data
            di-update via cron harian (lihat <code>incremental.yml</code>) jadi
            tombol ini hanya untuk recovery / data corruption.
          </p>

          {hrStatus === 'loading' && (
            <div className="mb-3">
              <div className="flex items-center gap-2 text-xs text-accent-primary mb-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{hrMessage}</span>
                <span className="ml-auto tabular-nums">{hrProgress}%</span>
              </div>
              <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-primary transition-all"
                  style={{ width: `${hrProgress}%` }}
                />
              </div>
            </div>
          )}
          {hrStatus === 'success' && (
            <div className="mb-3 chip bg-accent-success/10 text-accent-success inline-flex">
              <CheckCircle2 className="w-3 h-3" /> {hrMessage}
            </div>
          )}
          {hrStatus === 'error' && (
            <div className="mb-3 chip bg-accent-danger/10 text-accent-danger inline-flex">
              <XCircle className="w-3 h-3" /> {hrMessage}
            </div>
          )}

          <button
            onClick={handleHardRefresh}
            disabled={hrStatus === 'loading'}
            className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${hrStatus === 'loading' ? 'animate-spin' : ''}`} />
            Hard Refresh Sekarang
          </button>
        </div>

        {/* Cron info */}
        <div className="surface p-5">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-accent-primary" />
            Auto Refresh Schedule
          </h2>
          <div className="space-y-2 text-xs text-text-secondary">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent-success" />
              <span>
                <strong>GitHub Actions cron</strong> —
                <code className="bg-bg-tertiary px-1.5 py-0.5 rounded ml-1 text-[10px]">.github/workflows/incremental.yml</code>
              </span>
            </div>
            <p className="text-text-muted ml-4">
              Jalan tiap hari jam <strong className="text-text-primary">23:00 WIB</strong> (16:00 UTC).
              Hanya scrape post baru (incremental), hemat 99% token.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <span className="w-2 h-2 rounded-full bg-accent-secondary" />
              <span>
                <strong>Worker scheduled handler</strong> (backup) —
                <code className="bg-bg-tertiary px-1.5 py-0.5 rounded ml-1 text-[10px]">wrangler.toml [triggers] crons</code>
              </span>
            </div>
            <p className="text-text-muted ml-4">
              Cron Worker jam sama, hanya trigger kalau GH Actions tidak jalan
              dalam 24 jam. Log di Worker → refreshJobs.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
