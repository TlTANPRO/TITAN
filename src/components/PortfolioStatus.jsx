import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Database, RefreshCw, ShieldQuestion } from 'lucide-react';
import { useAccounts } from '../hooks/useAccount.js';
import { formatRelativeAge, getPortfolioFreshness } from '../lib/dataFreshness.js';
import { getManifestCoverage, useDataManifest } from '../lib/dataManifest.js';

const TONE = {
  success: {
    dot: 'bg-accent-success',
    text: 'text-accent-success',
    border: 'border-accent-success/30',
    background: 'bg-accent-success/10'
  },
  warning: {
    dot: 'bg-accent-warning',
    text: 'text-accent-warning',
    border: 'border-accent-warning/30',
    background: 'bg-accent-warning/10'
  },
  danger: {
    dot: 'bg-accent-danger',
    text: 'text-accent-danger',
    border: 'border-accent-danger/30',
    background: 'bg-accent-danger/10'
  },
  neutral: {
    dot: 'bg-text-muted',
    text: 'text-text-muted',
    border: 'border-border-subtle',
    background: 'bg-bg-tertiary'
  }
};

const PLATFORM = {
  instagram: { label: 'Instagram', icon: 'bg-platform-instagram/15 text-platform-instagram' },
  tiktok: { label: 'TikTok', icon: 'bg-platform-tiktok/15 text-platform-tiktok' }
};

function formatTimestamp(value) {
  if (!value) return 'tidak diketahui';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'tidak diketahui';
  return date.toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

export function PortfolioStatus({ headingAs: Heading = 'h1' }) {
  const accounts = useAccounts();
  const { manifest, coverage } = useDataManifest();
  // Manifest first: it arrives in KB, so the status panel is honest before the
  // 12MB dataset finishes. Once accounts land, the full-data reading wins
  // because it is computed from the same records the charts use.
  const fromAccounts = useMemo(() => getPortfolioFreshness(accounts), [accounts]);
  const fromManifest = useMemo(() => {
    if (!manifest) return null;
    return {
      tone: null,
      label: null,
      latestPostAt: Number(manifest.latestPostAt) || null,
      lastScrapeAt: Number(manifest.lastScrapeAt) || null,
      accountCount: Number(manifest.accountCount) || 0,
      platforms: Object.entries(manifest.platforms ?? {}).reduce((acc, [platform, info]) => {
        acc[platform] = { accountCount: Number(info?.accountCount) || 0 };
        return acc;
      }, {})
    };
  }, [manifest]);

  const pending = accounts.length === 0 && manifest != null;
  const status = accounts.length > 0 ? fromAccounts : (fromManifest ?? fromAccounts);
  const overallTone = pending
    ? TONE.neutral
    : (TONE[status.tone] ?? TONE.neutral);
  const coveragePercent = coverage == null ? null : Math.round(coverage * 100);

  return (
    <section
      aria-labelledby="portfolio-status-title"
      className="surface overflow-hidden border border-border-subtle"
    >
      <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:p-6">
        <div className="min-w-0">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-brand">
            Portfolio pulse
          </p>
          <Heading id="portfolio-status-title" className="text-2xl font-semibold tracking-tight text-text-primary md:text-3xl">
            Ringkasan portofolio sosial
          </Heading>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
            Lihat kondisi data, posting terbaru, dan akun yang perlu diperiksa sebelum mengambil keputusan konten.
          </p>
        </div>

        <div className="flex min-w-[190px] flex-col items-start gap-2 md:items-end">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${overallTone.background} ${overallTone.text} ${overallTone.border}`}
            aria-live="polite"
          >
            <span className={`h-2 w-2 rounded-full ${overallTone.dot}`} aria-hidden="true" />
            {pending ? 'Memuat ringkasan…' : status.label}
          </span>
          <span className="text-[10px] text-text-muted">
            Pipeline terakhir: {formatTimestamp(status.lastScrapeAt)}
          </span>
        </div>
      </div>

      <div className="grid gap-px border-t border-border-subtle bg-border-subtle sm:grid-cols-2">
        {Object.entries(status.platforms).map(([platform, platformStatus]) => {
          const platformMeta = PLATFORM[platform] ?? { label: platform, icon: 'bg-bg-tertiary text-text-secondary' };
          const platformTone = TONE[platformStatus.tone] ?? TONE.neutral;
          return (
            <div key={platform} className="flex items-center justify-between gap-4 bg-bg-surface px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${platformMeta.icon}`}>
                  {platform === 'instagram' ? 'IG' : 'TT'}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">{platformMeta.label}</p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {platformStatus.accountCount} akun
                    {platformStatus.label ? ` · ${platformStatus.label}` : ''}
                  </p>
                </div>
              </div>
              <span className={`shrink-0 text-[10px] font-semibold ${platformTone.text}`}>
                {platformStatus.latestPostAt ? formatRelativeAge(platformStatus.ageMs) : '—'}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 border-t border-border-subtle px-5 py-4 text-xs text-text-muted sm:flex-row sm:items-center sm:justify-between md:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" aria-hidden="true" />
            {status.accountCount} akun dimuat
          </span>
          <span className="inline-flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {status.latestPostAt ? `Konten terbaru ${formatRelativeAge(status.ageMs)}` : 'Belum ada konten'}
          </span>
          {coveragePercent != null && (
            <span
              className="inline-flex items-center gap-1.5"
              title="Rata-rata post yang punya data engagement terukur. 0% berarti metrik tidak pernah dikumpulkan, bukan engagement-nya nol."
            >
              <ShieldQuestion className="h-3.5 w-3.5" aria-hidden="true" />
              Coverage metrik {coveragePercent}%
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            {pending ? 'Menunggu dataset penuh' : status.tone === 'success' ? 'Siap diperiksa' : 'Periksa data'}
          </span>
        </div>
        <Link
          to="/account"
          className="inline-flex items-center gap-1 font-semibold text-accent-primary transition-colors hover:text-accent-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
        >
          Buka daftar akun
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
