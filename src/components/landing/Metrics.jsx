// Metrics band — rivr-defi-landing §4.
//
// "Inner box: bg-[rgba(30,50,90,0.02)] border border-[rgba(30,50,90,0.05)]
// rounded-[1.5rem] md:rounded-[3rem] p-8 md:p-16" wrapping "A 2x4 grid
// separated by borders" with "Staggered upward fade-ins using whileInView".
//
// The prompt's four values are DeFi constants. Ours come from landingData.js.
import { motion, useReducedMotion } from 'framer-motion';

export function Metrics({ metrics = [] }) {
  const reduced = useReducedMotion();

  return (
    <section id="angka" aria-labelledby="metrics-title" className="w-full px-3 py-6 md:px-5 md:py-12">
      <h2 id="metrics-title" className="sr-only">
        Angka portofolio
      </h2>

      <div className="rivr-metrics-box mx-auto w-full max-w-[1536px] p-8 md:p-16">
        <div className="rivr-metrics-grid">
          {metrics.map((metric, index) => (
            <motion.div
              key={metric.label}
              initial={reduced ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: (index % 4) * 0.07 }}
              className="p-6 md:p-8"
            >
              <p className="flex items-baseline gap-1.5">
                <span className="text-[clamp(1.9rem,3.6vw,3rem)] font-medium leading-none tracking-[-0.03em] text-neutral-900 tabular-nums">
                  {metric.value}
                </span>
                <span className="text-sm font-medium text-neutral-500">{metric.unit}</span>
              </p>
              <p className="mt-2.5 text-[13px] leading-snug text-neutral-600">{metric.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
