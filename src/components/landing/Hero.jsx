// Landing hero — rivr-defi-landing grammar.
//
// Implemented as the prompt specifies: full-screen well, oversized rounded
// container, glass badge, staggered fade + scale, a bottom-left glass card, and
// the bottom-right "cut-out" corner closed off with two inverted-corner SVGs.
//
// The prompt's background <video> (a CloudFront MP4) is replaced by the
// .rivr-aurora CSS field. Everything else — z-order, radii, padding, the glass
// treatment, the corner path — is as written.
//
// Copy is TITAN's own. The numbers are real and come from landingData.js.
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Database, Sparkles, Users } from 'lucide-react';
import { LandingNav } from './LandingNav.jsx';

// "subtle staggered fade-in + scale animations via Framer Motion"
const rise = (delay, reduced) => ({
  initial: reduced ? false : { opacity: 0, y: 18, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: 0.85, ease: [0.22, 1, 0.36, 1], delay }
});

export function Hero({ metrics = [], contentAgeLabel = '—' }) {
  const reduced = useReducedMotion();

  const [accounts, posts, platforms, freshness] = [
    metrics[0]?.value ?? '—',
    metrics[1]?.value ?? '—',
    metrics[4]?.value ?? '—',
    contentAgeLabel
  ];

  return (
    // The prompt's wrapper is "w-full h-screen flex items-center justify-center
    // p-3 md:p-5". We use min-h-[100svh] instead of h-screen so the well can
    // still grow on short viewports, and let it stretch rather than centre.
    <div className="rivr-shell flex min-h-[100svh] w-full p-3 md:p-5">
      <section className="rivr-well w-full" aria-labelledby="hero-title">
        <div className="rivr-aurora" aria-hidden="true" />

        <LandingNav tone="light" />

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-28 pt-10 text-center md:px-10">
          <motion.div {...rise(0.05, reduced)}>
            <span className="rivr-badge">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Social media intelligence
            </span>
          </motion.div>

          <motion.h1
            id="hero-title"
            {...rise(0.14, reduced)}
            className="mt-7 max-w-5xl text-balance text-[clamp(2.4rem,6.4vw,5.1rem)] font-medium leading-[1.03] tracking-[-0.035em] text-white"
          >
            Every account, every post,
            <br />
            <span className="text-white/55">with the freshness shown up front.</span>
          </motion.h1>

          <motion.p
            {...rise(0.24, reduced)}
            className="mt-6 max-w-2xl text-pretty text-[clamp(0.95rem,1.35vw,1.15rem)] leading-relaxed text-white/70"
          >
            TITAN collapses Instagram and TikTok scraping into one dashboard — and tells you
            plainly when the data underneath is too old to act on. No invented benchmarks, no
            zeros pretending to be measurements.
          </motion.p>

          <motion.div {...rise(0.34, reduced)} className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <a
              href="/TITAN/dashboard"
              className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-neutral-900 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Buka command center
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
            </a>
            <a
              href="/TITAN/library"
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Jelajahi pustaka
            </a>
          </motion.div>
        </div>

        {/* BottomLeftCard — glass card pinned bottom-left, inside the well. */}
        <motion.div
          {...rise(0.46, reduced)}
          className="rivr-glass absolute bottom-5 left-5 z-20 hidden max-w-[19rem] p-4 text-neutral-900 shadow-[0_10px_30px_rgb(0_0_0/0.08)] sm:block"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70 text-neutral-900">
              <Users className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold tabular-nums">
                {accounts} akun · {posts} post
              </p>
              <p className="mt-0.5 text-xs leading-snug text-neutral-700">
                Dipantau harian di {platforms} platform.
              </p>
              <a href="/TITAN/account" className="rivr-pill-white mt-3">
                Lihat akun
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        </motion.div>

        {/* A second, smaller status readout so the freshness number is not only
            in the metrics band further down the page. */}
        <motion.div
          {...rise(0.54, reduced)}
          className="absolute bottom-5 left-1/2 z-20 hidden -translate-x-1/2 items-center gap-2.5 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white backdrop-blur-md lg:flex"
          aria-live="polite"
        >
          <Database className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Posting terbaru</span>
          <span className="font-bold text-white">{freshness}</span>
        </motion.div>

        {/* BottomRightCorner — the flush cut-out. The two SVGs fill the gap the
            inner curve leaves, per the prompt's path. */}
        <div className="rivr-corner">
          <svg className="rivr-corner-top" viewBox="0 0 56 56" aria-hidden="true">
            <path d="M56 56V0C56 30.9279 30.9279 56 0 56H56Z" fill="var(--rivr-canvas)" />
          </svg>
          <svg className="rivr-corner-left" viewBox="0 0 56 56" aria-hidden="true">
            <path d="M56 56V0C56 30.9279 30.9279 56 0 56H56Z" fill="var(--rivr-canvas)" />
          </svg>
          <div className="relative z-10 flex items-center gap-2.5 text-neutral-700">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300">
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-xs font-semibold leading-tight">
              Dokumentasi
              <br />
              &amp; pustaka
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
