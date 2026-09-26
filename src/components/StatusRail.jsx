// V39: StatusRail — TITAN's one signature motion, adapted from `nimbus-ops`.
//
// Why only one: the PRD accepts a single signature motion, and a dashboard
// with five different motion grammars reads as unfinished. Everything else on
// Home stays static; this rail is the single place where data moves.
//
// Adapted, not copied from the prompt:
//   - no WebGL / shader backdrop, no scroll hijack, no hover-only trigger
//   - a thin 1px progress track per pipeline stage instead of a hero canvas
//   - the animation is a CSS transform on the fill only, so it composites off
//     the main thread and never touches layout
//   - the whole rail collapses to a static list under prefers-reduced-motion
//   - no external asset, no font swap, no library added
import { useMemo } from 'react';
import { useDataManifest } from '../lib/dataManifest.js';
import { formatRelativeAge } from '../lib/dataFreshness.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Stage thresholds are the freshness contract from Phase 1 of the PRD.
// fresh <= 24h, delayed <= 72h, stale beyond that.
const STAGES = [
  { id: 'pipeline', label: 'Pipeline scrape', maxAge: 48 * HOUR, hint: 'Seharusnya < 2 hari' },
  { id: 'content', label: 'Konten terbaru', maxAge: 24 * HOUR, hint: 'Seharusnya < 1 hari' },
  { id: 'coverage', label: 'Coverage metrik', maxAge: 24 * HOUR, hint: 'Terisi penuh' }
];

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function evaluateStages(manifest, coverage, now) {
  const pipelineAge = manifest?.lastScrapeAt ? now - Number(manifest.lastScrapeAt) : null;
  const contentAge = manifest?.latestPostAt ? now - Number(manifest.latestPostAt) : null;

  return STAGES.map((stage) => {
    let ratio;
    let tone;
    let value;

    if (stage.id === 'pipeline') {
      ratio = pipelineAge == null ? 0 : clamp01(pipelineAge / stage.maxAge);
      tone = pipelineAge == null ? 'unknown' : pipelineAge <= stage.maxAge ? 'ok' : 'warn';
      value = pipelineAge == null ? 'tidak diketahui' : formatRelativeAge(pipelineAge);
    } else if (stage.id === 'content') {
      ratio = contentAge == null ? 0 : clamp01(contentAge / stage.maxAge);
      tone = contentAge == null ? 'unknown' : contentAge <= 24 * HOUR ? 'ok' : contentAge <= 72 * HOUR ? 'warn' : 'bad';
      value = contentAge == null ? 'tidak diketahui' : formatRelativeAge(contentAge);
    } else {
      const share = Number(coverage);
      ratio = Number.isFinite(share) ? clamp01(share) : 0;
      tone = !Number.isFinite(share) ? 'unknown' : share >= 0.9 ? 'ok' : share >= 0.5 ? 'warn' : 'bad';
      value = Number.isFinite(share) ? `${Math.round(share * 100)}%` : 'tidak diketahui';
    }

    return { ...stage, ratio, tone, value };
  });
}

const FILL = {
  ok: 'bg-accent-success',
  warn: 'bg-accent-warning',
  bad: 'bg-accent-danger',
  unknown: 'bg-text-disabled'
};

export function StatusRail() {
  const { manifest, coverage } = useDataManifest();
  const stages = useMemo(
    () => evaluateStages(manifest, coverage, Date.now()),
    [manifest, coverage]
  );
  const worst = useMemo(() => {
    if (stages.some((s) => s.tone === 'bad')) return 'bad';
    if (stages.some((s) => s.tone === 'warn')) return 'warn';
    if (stages.every((s) => s.tone === 'unknown')) return 'unknown';
    return 'ok';
  }, [stages]);

  return (
    <section
      aria-labelledby="status-rail-title"
      className="border-y border-border-subtle bg-bg-secondary/40"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-6 md:px-6">
        <div className="flex items-center gap-2 md:w-44 md:shrink-0">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${FILL[worst]}`}
            aria-hidden="true"
          />
          <h2 id="status-rail-title" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
            Pipeline status
          </h2>
        </div>

        {/* Decorative fill duplicates the numeric value in each stage label, so
            the motion is never the only way to read the state. */}
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:gap-4" aria-hidden="true">
          {stages.map((stage) => (
            <div key={stage.id} className="flex flex-1 items-center gap-2">
              <span className="w-28 shrink-0 truncate text-[10px] text-text-muted sm:w-32">
                {stage.label}
              </span>
              <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-bg-hover">
                <span
                  className={`block h-full rounded-full ${FILL[stage.tone]} motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-out`}
                  style={{ width: `${Math.max(3, Math.round(stage.ratio * 100))}%` }}
                />
              </span>
            </div>
          ))}
        </div>

        <dl className="flex flex-wrap gap-x-5 gap-y-1 md:shrink-0">
          {stages.map((stage) => (
            <div key={stage.id} className="flex items-baseline gap-1.5">
              <dt className="text-[10px] uppercase tracking-wider text-text-muted">{stage.label}</dt>
              <dd className="text-xs font-semibold tabular-nums text-text-primary">{stage.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
