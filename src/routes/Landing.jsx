// Landing — the composed prompt page.
//
// Section order follows the prompt set, not the app's route order:
//
//   Hero        rivr-defi-landing      (well, badge, stagger, glass card, cut-out)
//   Metrics     rivr-defi-landing §4   (divided 2x4 grid, real figures)
//   Features    rivr-defi-landing §5   (1/3/3/1 grid, 2%-opacity watermarks)
//   CommandCenter  existing V33-V37 dashboard, unchanged
//   SpecStats   technical-specifications (4 tabs, range bars, spark traces, axis)
//   BentoStats  bento-grid-stats       (6x10 grid, dot staircase, ring diagram)
//   CtaFaq      faq-cta                (animated gradient + accordion)
//   Footer      stark-minimal-footer   (drifting dots, oversized wordmark)
//
// The landing renders OUTSIDE AppShell on purpose: it has its own nav from the
// rivr prompt, and the app sidebar belongs to the tool, not to the front door.
import { useMemo } from 'react';
import { Hero } from '../components/landing/Hero.jsx';
import { Metrics } from '../components/landing/Metrics.jsx';
import { Features } from '../components/landing/Features.jsx';
import { SpecStats } from '../components/landing/SpecStats.jsx';
import { BentoStats } from '../components/landing/BentoStats.jsx';
import { CtaFaq } from '../components/landing/CtaFaq.jsx';
import { LandingFooter } from '../components/landing/LandingFooter.jsx';
import { CommandCenter } from '../components/command/CommandCenter.jsx';
import { useAccounts } from '../hooks/useAccount.js';
import { useDataManifest } from '../lib/dataManifest.js';
import { getAgeMs, getLatestPostAt } from '../lib/dataFreshness.js';
import {
  formatCompactAge,
  getLandingBento,
  getLandingMetrics,
  resolveTimestamp
} from '../lib/landingData.js';

export default function Landing() {
  const accounts = useAccounts();
  const { manifest } = useDataManifest();

  // One snapshot for every section, so the hero, the metrics band, the bento and
  // the spec chart can never disagree with each other.
  const snapshot = useMemo(() => {
    const now = Date.now();
    return {
      metrics: getLandingMetrics(accounts, manifest, now),
      bento: getLandingBento(accounts, manifest, now),
      contentAge: getAgeMs(
        resolveTimestamp(
          accounts.length ? getLatestPostAt(accounts) : null,
          manifest?.latestPostAt
        ),
        now
      )
    };
  }, [accounts, manifest]);

  const contentAgeLabel = formatCompactAge(snapshot.contentAge);

  return (
    <div className="titan-prompt-font" style={{ background: '#f0f0f0' }}>
      {/* The global skip link in App.jsx already targets #main-content, which
          this page owns — a second skip link here would just be noise. */}
      <main id="main-content">
        <Hero metrics={snapshot.metrics} contentAgeLabel={contentAgeLabel} />
        <Metrics metrics={snapshot.metrics} />
        <Features />

        <div className="bg-[#f0f0f0]">
          <CommandCenter embedded />
        </div>

        <SpecStats accounts={accounts} manifest={manifest} />
        <BentoStats bento={snapshot.bento} />
        <CtaFaq />
      </main>

      <LandingFooter />
    </div>
  );
}
