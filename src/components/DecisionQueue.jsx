// V39: DecisionQueue — the "so what?" panel for Home.
//
// The old Home answered "what is the data?" with nine stacked bento sections.
// Nothing answered "what should I actually do next?". This ranks real, computed
// signals into an ordered queue, so the first screen is a worklist instead of a
// chart wall.
//
// Rules that keep it honest:
//   - every item is derived from data we actually loaded, never invented
//   - a signal with no underlying data becomes a data-fix task, not a fake KPI
//   - severity is deterministic, so the ordering never reshuffles on re-render
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, Database, Gauge, Radio, Wrench } from 'lucide-react';
import { useDataManifest } from '../lib/dataManifest.js';
import { formatRelativeAge, getLatestPostAt, getAgeMs } from '../lib/dataFreshness.js';
import { isDegradedMode, getLoadError } from '../lib/dataStore.js';

const DAY_MS = 86_400_000;
const STALE_AFTER_MS = 3 * DAY_MS;
const AGING_AFTER_MS = DAY_MS;

// Severity: 0 = highest priority. Kept numeric so the sort is stable.
const SEVERITY = { blocker: 0, warn: 1, info: 2 };

export function buildQueue(accounts, manifest, now, health = {}) {
  const items = [];
  const loaded = accounts?.length ?? 0;

  // 0. Nothing loaded at all. This has to outrank every data-derived signal,
  //    because with zero accounts the checks below would quietly pass and the
  //    queue would say "nothing to do" while the dashboard shows only zeros.
  if (health.loadError) {
    items.push({
      id: 'load-failed',
      severity: 'blocker',
      icon: Wrench,
      title: 'Data TITAN gagal dimuat',
      detail: `Bukan karena tidak ada konten — file datanya tidak terbaca. ${health.loadError}`,
      action: { label: 'Cek status data', to: '/settings' }
    });
  }

  // 1. Content age, measured against the documented freshness contract:
  //    <= 24h fine, 24-72h aging, > 72h stale and therefore not decision-grade.
  //    (The previous version had an `else if` for a 14-day idle warning that
  //    could never fire, because anything past 3 days already matched stale.)
  const fromPosts = loaded > 0 ? getLatestPostAt(accounts) : null;
  const latestPostAt = fromPosts ?? (Number(manifest?.latestPostAt) || null);
  const ageMs = getAgeMs(latestPostAt, now);
  const ageDays = ageMs == null ? null : Math.floor(ageMs / DAY_MS);

  if (ageMs != null && ageMs > STALE_AFTER_MS) {
    items.push({
      id: 'stale-content',
      severity: 'blocker',
      icon: AlertTriangle,
      title: 'Konten portal terlalu lama untuk dipakai mengambil keputusan',
      detail: `Posting terbaru berumur ${ageDays} hari. Angka engagement masih tampil, tapi bukan cermin kondisi sekarang.`,
      action: { label: 'Jalankan hard refresh', to: '/settings' }
    });
  } else if (ageMs != null && ageMs > AGING_AFTER_MS) {
    items.push({
      id: 'aging-content',
      severity: 'warn',
      icon: Radio,
      title: 'Konten sudah melewati ambang 24 jam',
      detail: `Posting terbaru ${formatRelativeAge(ageMs)}. Masih di bawah batas 72 jam, tapi jadwalkan pipeline berikutnya agar tidak menumpuk.`,
      action: { label: 'Buka daftar akun', to: '/account' }
    });
  }

  // 2. Per-account data gaps — the actionable half of a coverage problem.
  const entries = manifest?.accounts ?? [];
  const gapped = entries
    .map((entry) => {
      const latest = Number(entry?.latestPostAt) || null;
      const entryAge = getAgeMs(latest, now);
      const share = Number(entry?.coverage?.engagedPostShare);
      return { ...entry, ageMs: entryAge, share };
    })
    .filter((entry) => (entry.ageMs != null && entry.ageMs > STALE_AFTER_MS) || !(entry.share > 0))
    .slice(0, 3);

  for (const entry of gapped) {
    const noMetrics = !(entry.share > 0);
    items.push({
      id: `account-${entry.slug}`,
      severity: noMetrics ? 'blocker' : 'warn',
      icon: noMetrics ? Database : Gauge,
      title: `@${entry.username ?? entry.slug} — ${noMetrics ? 'metrik engagement tidak pernah dikumpulkan' : `konten ${Math.floor((entry.ageMs ?? 0) / DAY_MS)} hari`}`,
      detail: noMetrics
        ? 'Angka 0 di dashboard berarti "tidak diukur", bukan "tidak ada interaksi".'
        : `${entry.postCount ?? 0} post, posting terakhir ${Math.floor((entry.ageMs ?? 0) / DAY_MS)} hari lalu.`,
      action: { label: 'Periksa akun', to: `/account/${entry.slug}` }
    });
  }

  // 3. Degraded data load — the UI is running on the local split payloads.
  if (health.degraded) {
    items.push({
      id: 'degraded',
      severity: 'warn',
      icon: Wrench,
      title: 'Data dimuat dari payload per-akun, bukan dataset penuh',
      detail: 'Hanya terjadi di mode lokal: file payload per-akun tidak dipublikasikan ke GitHub Pages. Cek ulang angka sebelum dipakai.',
      action: { label: 'Cek pipeline', to: '/settings' }
    });
  }

  // 4. No actionable signal at all — say so rather than padding the list.
  if (items.length === 0) {
    items.push({
      id: 'clear',
      severity: 'info',
      icon: Gauge,
      title: 'Tidak ada sinyal yang perlu ditindak',
      detail: 'Konten cukup segar dan metrik akun terukur. Lanjut ke pola performa.',
      action: { label: 'Buka compare', to: '/compare' }
    });
  }

  return items.sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity]).slice(0, 5);
}

const TONE = {
  blocker: { border: 'border-accent-danger/40', text: 'text-accent-danger', chip: 'bg-accent-danger/10 text-accent-danger' },
  warn: { border: 'border-accent-warning/40', text: 'text-accent-warning', chip: 'bg-accent-warning/10 text-accent-warning' },
  info: { border: 'border-border-subtle', text: 'text-text-secondary', chip: 'bg-bg-tertiary text-text-secondary' }
};

const LABEL = { blocker: 'Prioritas', warn: 'Periksa', info: 'Info' };

export function DecisionQueue() {
  const { manifest } = useDataManifest();
  // useAccounts is intentionally avoided here: the queue must be able to render
  // from the manifest alone, before the full dataset arrives.
  const accounts = (manifest?.accounts ?? []).map((entry) => ({
    slug: entry.slug,
    username: entry.username,
    platform: entry.platform,
    posts: []
  }));

  const items = useMemo(
    () => buildQueue(accounts, manifest, Date.now(), {
      degraded: isDegradedMode(),
      loadError: getLoadError()
    }),
    [manifest]
  );

  return (
    <section aria-labelledby="decision-queue-title" className="surface border border-border-subtle">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-subtle px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-brand">
            Antrean keputusan
          </p>
          <h2 id="decision-queue-title" className="mt-1 text-base font-semibold text-text-primary">
            Yang perlu dikerjakan berikutnya
          </h2>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-text-muted tabular-nums">
          {items.length} item
        </span>
      </header>

      <ol className="divide-y divide-border-subtle">
        {items.map((item) => {
          const tone = TONE[item.severity];
          const Icon = item.icon;
          return (
            <li key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
              <span
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${tone.border} ${tone.text}`}
                aria-hidden="true"
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${tone.chip}`}>
                    {LABEL[item.severity]}
                  </span>
                  <p className="text-sm font-semibold text-text-primary">{item.title}</p>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-text-muted">{item.detail}</p>
              </div>
              {item.action ? (
                <Link
                  to={item.action.to}
                  className="inline-flex shrink-0 items-center gap-1 self-start rounded-md border border-border-subtle px-2.5 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-accent-primary/40 hover:text-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                >
                  {item.action.label}
                  <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
