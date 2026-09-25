// Bento stats — bento-grid-stats, implemented to the prompt's numbers.
//
// The prompt: dark #0f0f0f, px-6 py-24 sm:px-10 lg:px-16 lg:py-32, DM Sans,
// 6-column grid with gridTemplateRows repeat(10, minmax(46px, auto)), and six
// explicitly placed cards. CardMotion animates opacity 0 / scale 0.95 → 1 / 1
// over 0.65s with ease [0.22, 1, 0.36, 1] and staggered delays, triggered once
// by useInView({ once: true, margin: '-60px' }).
//
// Two deviations, both required:
//   1. Font. DM Sans is not loaded; TITAN uses Inter. Swapping a font for a
//      section is a regression in first paint and a new external request.
//   2. Card 6's photograph. The prompt uses a Pexels stock image of an office
//      and prints "4.9 / 5" over it. A stock photo plus an invented rating is
//      exactly the kind of thing TITAN exists to avoid, so the card keeps its
//      shape, the dark overlay and the white 2-stat layout, and carries real
//      numbers instead.
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** useInView({ once: true, margin: '-60px' }) in a 15-line hook. */
function useInViewOnce() {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || seen) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: '-60px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [seen]);

  return [ref, seen];
}

/** The prompt's staircase: 26 columns, each a base plus two conditional rows. */
function stairColumns(monthly) {
  const columns = 26;
  const peak = Math.max(1, ...monthly);
  return Array.from({ length: columns }, (_, c) => {
    // Real buckets, resampled across 26 columns so the staircase tracks the
    // actual posting cadence instead of a decorative curve.
    const sourceIndex = Math.min(
      monthly.length - 1,
      Math.floor((c / columns) * monthly.length)
    );
    const ratio = peak ? (monthly[sourceIndex] ?? 0) / peak : 0;
    const filled = Math.max(1, Math.round(ratio * 15));
    return filled;
  });
}

function DotStaircase({ monthly }) {
  const filled = stairColumns(monthly);
  return (
    <div className="bento-dots" aria-hidden="true">
      {filled.map((count, c) => (
        <div key={c} className="bento-dots-col">
          {Array.from({ length: 15 }, (_, r) => (
            <span
              key={r}
              className={`bento-dot-cell ${r < count ? 'bento-dot-cell-on' : ''}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The prompt's "Speed card" diagram: 3 concentric circles + 4 marked squares. */
function RingDiagram() {
  return (
    <svg viewBox="0 0 200 180" className="h-auto w-full max-w-[240px]" aria-hidden="true">
      <circle cx="110" cy="80" r="75" stroke="#222" strokeWidth="0.8" fill="none" opacity="0.2" />
      <circle cx="110" cy="80" r="50" stroke="#222" strokeWidth="0.8" fill="none" opacity="0.3" />
      <circle cx="110" cy="80" r="25" stroke="#222" strokeWidth="0.8" fill="none" opacity="0.4" />
      <rect x="68" y="42" width="16" height="16" fill="#000" />
      <text x="76" y="54" fill="#fff" fontSize="11" fontWeight="300" textAnchor="middle">+</text>
      <rect x="102" y="36" width="20" height="20" fill="#000" />
      <path d="M112 40l-5 9h4l-3 7 7-10h-4l4-6z" fill="#fff" />
      <rect x="82" y="128" width="14" height="14" fill="#000" />
      <text x="89" y="139" fill="#fff" fontSize="11" fontWeight="300" textAnchor="middle">−</text>
      <rect x="138" y="128" width="14" height="14" fill="#000" />
      <rect x="142" y="132" width="6" height="6" fill="#fff" />
    </svg>
  );
}

/** The prompt's "Projects card": seven black squares at fixed percentages. */
const SCATTER = [
  { left: '55%', top: '2%', size: 30 },
  { left: '80%', top: '0%', size: 24 },
  { left: '70%', top: '28%', size: 16 },
  { left: '92%', top: '18%', size: 14 },
  { left: '58%', top: '22%', size: 10 },
  { left: '88%', top: '36%', size: 10 },
  { left: '46%', top: '14%', size: 8 }
];

function Scatter() {
  return (
    <div className="relative h-24 w-full" aria-hidden="true">
      {SCATTER.map((s, i) => (
        <span
          key={i}
          className="absolute bg-black"
          style={{ left: s.left, top: s.top, width: s.size, height: s.size }}
        />
      ))}
    </div>
  );
}

/** The prompt's rating marks. */
function Stars() {
  return (
    <div className="flex gap-0.5" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} width="11" height="11" viewBox="0 0 12 12" fill="#fff">
          <path d="M6 0l1.8 3.6L12 4.2 8.9 7.1l.7 4.2L6 9.3 2.4 11.3l.7-4.2L0 4.2l4.2-.6z" />
        </svg>
      ))}
    </div>
  );
}

function PlusBtn({ dark }) {
  return <span className={`bento-plus ${dark ? 'bento-plus-dark' : 'bento-plus-light'}`}>+</span>;
}

export function BentoStats({ bento }) {
  const [ref, seen] = useInViewOnce();
  // Staggered delays from the prompt: 0, 0.08, 0.12, 0.18, 0.22, 0.28.
  const anim = (delay) => ({
    className: `bento-animate ${seen ? 'is-in' : ''}`,
    style: { transitionDelay: `${delay}s` }
  });

  return (
    <section id="data" aria-labelledby="bento-title" className="bento-section titan-prompt-font">
      <div className="mx-auto max-w-7xl">
        <div className="bento-grid">
          {/* Card 1 — header card, no background. Carries the observer ref. */}
          <div
            ref={ref}
            {...anim(0)}
            style={{ transitionDelay: '0s', gridColumn: '1 / 3', gridRow: '1 / 5' }}
            className={`bento-animate ${seen ? 'is-in' : ''} flex flex-col justify-end pb-4 pr-4`}
          >
            <p className="bento-label mb-4 inline-block">kenapa titan</p>
            <h2
              id="bento-title"
              className="text-[clamp(1.6rem,2.6vw,2.4rem)] font-light leading-[1.2] tracking-tight"
            >
              <span className="text-white">Satu sumber</span>
              <br />
              <span className="text-[#666]">kebenaran untuk</span>
              <br />
              <span className="text-[#666]">tim konten</span>
            </h2>
          </div>

          {/* Card 3 — white stat card with the ring diagram */}
          <div
            {...anim(0.12)}
            style={{ transitionDelay: '0.12s', gridColumn: '3 / 5', gridRow: '1 / 6' }}
            className={`bento-animate ${seen ? 'is-in' : ''} bento-card bento-card-white`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="bento-stat text-black">{bento.accountsStat}</p>
                <p className="bento-sub">{bento.accountsCaption}</p>
              </div>
              <PlusBtn dark />
            </div>
            <div className="mt-auto flex flex-1 items-start justify-center pt-6">
              <RingDiagram />
            </div>
          </div>

          {/* Card 4 — dark copy card */}
          <div
            {...anim(0.18)}
            style={{ transitionDelay: '0.18s', gridColumn: '5 / 7', gridRow: '1 / 5' }}
            className={`bento-animate ${seen ? 'is-in' : ''} bento-card bento-card-dark`}
          >
            <div className="flex justify-end">
              <PlusBtn dark={false} />
            </div>
            <div className="mt-auto space-y-5 pb-1">
              <p className="bento-copy">{bento.freshnessCaption}</p>
              <p className="bento-copy">
                TITAN tidak pernah menyamakan angka nol dengan data yang tidak dikumpulkan. Kalau
                sebuah metrik belum pernah diukur, dashboard menuliskannya sebagai belum tersedia.
              </p>
            </div>
          </div>

          {/* Card 2 — white stat card with the dot staircase */}
          <div
            {...anim(0.08)}
            style={{ transitionDelay: '0.08s', gridColumn: '1 / 3', gridRow: '5 / 11' }}
            className={`bento-animate ${seen ? 'is-in' : ''} bento-card bento-card-white`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="bento-stat text-black">{bento.postsStat}</p>
                <p className="bento-sub">{bento.postsCaption}</p>
              </div>
              <PlusBtn dark />
            </div>
            <div className="mt-auto pt-8">
              <DotStaircase monthly={bento.monthly} />
              <div className="mt-3 flex justify-between pr-2 text-[10px] tracking-wide text-[#aaa]">
                {['6 bln', '5 bln', '4 bln', '3 bln', '2 bln', 'bln ini'].map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Card 5 — white card with scattered squares */}
          <div
            {...anim(0.22)}
            style={{ transitionDelay: '0.22s', gridColumn: '3 / 5', gridRow: '6 / 11' }}
            className={`bento-animate ${seen ? 'is-in' : ''} bento-card bento-card-white`}
          >
            <Scatter />
            <p className="bento-stat mt-4 text-black">{bento.coverageStat}</p>
            <p className="bento-sub max-w-[210px] leading-[1.7]">{bento.coverageCaption}</p>
          </div>

          {/* Card 6 — dark card, same shape and overlay as the prompt's photo
              card, carrying real figures in place of the stock photo + rating. */}
          <div
            {...anim(0.28)}
            style={{
              transitionDelay: '0.28s',
              gridColumn: '5 / 7',
              gridRow: '5 / 11',
              background: 'linear-gradient(160deg, #141414 0%, #050505 100%)',
              minHeight: '380px'
            }}
            className={`bento-animate ${seen ? 'is-in' : ''} bento-card bento-card-photo`}
          >
            <div className="flex items-start justify-between">
              <span className="flex items-center gap-[3px]" aria-hidden="true">
                <span className="text-[1.6rem] font-bold leading-none text-white">T</span>
                <span className="h-[10px] w-[10px] bg-white" />
                <span className="flex flex-col gap-[3px]">
                  <span className="h-[7px] w-[7px] bg-white" />
                  <span className="h-[7px] w-[7px] bg-white/50" />
                </span>
              </span>
              <span className="flex flex-col items-end gap-1.5">
                <span className="text-base font-light leading-none text-white">
                  {bento.platformsStat}
                </span>
                <Stars />
              </span>
            </div>

            <div className="mt-auto flex items-end justify-between gap-4">
              <div>
                <p className="bento-stat text-white">{bento.platformsStat}</p>
                <p className="mt-2 text-[13px] text-white/60">{bento.platformsCaption}</p>
              </div>
              <a
                href="/TITAN/compare"
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center bg-white text-neutral-900 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">Buka perbandingan akun</span>
              </a>
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-white/35">
          Angka dihitung ulang dari data yang termuat, bukan angka tetap.{' '}
          {bento.coverageKnown} akun punya metrik engagement terukur.
        </p>
      </div>
    </section>
  );
}

export { DotStaircase, RingDiagram, stairColumns };
