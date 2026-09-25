// SpecStats — technical-specifications, implemented to the prompt's spec.
//
// The prompt is unusually complete here, so this follows it closely:
//
//   section  .spec-stats — the two radial-gradient layers over #111414→#171a1a
//   header   two-column grid, H2 weight 300, summary that fades in on .is-visible
//   tabs     4-column grid, bottom hairline, ::after underline scaleX 0→1
//   chart    1px border, 20px radius, repeating-linear-gradient vertical rules
//   bars     range indicator + fill bar + right-aligned value + 6 spark traces
//   axis     11-column 0..100 scale
//   replay   on tab click, drop .is-visible/.is-ready, swap content, re-add on
//            the next frame after the 140ms the prompt specifies
//
// The four datasets are computed from real data in lib/landingData.js instead
// of the prompt's fixed aerospace constants, because TITAN has real numbers and
// invented ones would be the whole opposite of this product.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SPEC_TAB_LABELS,
  SPEC_TAB_ORDER,
  getLandingSpecStats
} from '../../lib/landingData.js';

const BAR_DELAYS = [0, 90, 180, 270];

// The prompt alternates spark rows between 34% and 62% and rotates variants.
const SPARK_VARIANTS = ['', '1', '2', '', '1', ''];

function Spark({ x, index, rowIndex }) {
  const variant = SPARK_VARIANTS[index % SPARK_VARIANTS.length];
  return (
    <span
      className="spec-spark"
      data-variant={variant || undefined}
      style={{
        '--point-x': `${x}%`,
        '--point-y': index % 2 === 0 ? '34%' : '62%',
        '--point-delay': `${index * 70}ms`
      }}
    >
      <span className="sr-only">{(rowIndex ?? 0) + 1}</span>
    </span>
  );
}

function BarRow({ bar, rowIndex }) {
  return (
    <div
      className="spec-bar-row"
      style={{ '--bar-delay': `${BAR_DELAYS[rowIndex] ?? rowIndex * 90}ms` }}
    >
      <div className="spec-bar-label">
        <strong>{bar.label}</strong>
        <span>{bar.note}</span>
      </div>
      <div
        className="spec-track"
        style={{ '--range-start': bar.rangeStart, '--range-width': bar.rangeWidth }}
      >
        <span className="spec-range" aria-hidden="true" />
        <span className="spec-fill" style={{ '--bar-value': `${bar.value}%` }} aria-hidden="true" />
        <span className="spec-value tabular-nums">
          {bar.value}
          {bar.unit}
        </span>
        <span className="spec-trace" aria-hidden="true">
          {(bar.trace ?? []).map((x, i) => (
            <Spark key={i} x={x} index={i} rowIndex={rowIndex} />
          ))}
        </span>
      </div>
    </div>
  );
}

function Chart({ dataset, ready }) {
  return (
    <div className={`spec-chart ${ready ? 'is-ready' : ''}`} aria-live="polite">
      <dl className="spec-chart-head">
        <dt>{dataset.title}</dt>
        <dd>Target &amp; rentang</dd>
      </dl>

      <div className="spec-bars">
        {dataset.bars.map((bar, index) => (
          <BarRow key={bar.label} bar={bar} rowIndex={index} />
        ))}
      </div>

      <div className="spec-axis">
        <span className="spec-axis-label" />
        <div className="spec-axis-inner" aria-hidden="true">
          {Array.from({ length: 11 }, (_, i) => (
            <span key={i}>{i * 10}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SpecStats({ accounts = [], manifest = null }) {
  const [active, setActive] = useState(SPEC_TAB_ORDER[0]);
  const [ready, setReady] = useState(true);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef(null);

  const datasets = getLandingSpecStats(accounts, manifest, Date.now());
  const dataset = datasets[active] ?? datasets[SPEC_TAB_ORDER[0]];

  // Replay the prompt's animation sequence: drop the classes, swap the data,
  // then re-add them on the next frame after 140ms.
  const selectTab = useCallback((key) => {
    if (key === active) return;
    setReady(false);
    setVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setActive(key);
      requestAnimationFrame(() => {
        setVisible(true);
        setReady(true);
      });
    }, 140);
  }, [active]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return (
    <section id="spesifikasi" aria-labelledby="spec-title" className="spec-stats titan-prompt-font">
      {/* The prompt fades only the right-hand summary, not the H2. */}
      <div className="spec-header">
        <h2 id="spec-title" className="spec-h2">
          Angka yang bisa diaudit, bukan klaim yang harus dipercaya.
        </h2>
        <p className={`spec-summary ${visible ? 'is-visible' : ''}`}>{dataset.summary}</p>
      </div>

      <div className="spec-tabs" role="tablist" aria-label="Sumber data">
        {SPEC_TAB_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`spec-tab-${key}`}
            aria-selected={active === key}
            aria-controls="spec-panel"
            className={`spec-tab ${active === key ? 'is-active' : ''}`}
            onClick={() => selectTab(key)}
          >
            {SPEC_TAB_LABELS[key]}
          </button>
        ))}
      </div>

      <div id="spec-panel" role="tabpanel" aria-labelledby={`spec-tab-${active}`}>
        <Chart dataset={dataset} ready={ready} />
      </div>

      <p className="mx-auto mt-8 max-w-[1820px] px-2 text-xs text-white/35">
        Sumbu 0–100 adalah nilai yang dinormalkan terhadap angka terkuat di portofolio, bukan
        benchmark industri. Tidak ada sumber eksternal yang disetujui untuk TITAN.
      </p>
    </section>
  );
}
