// Features — rivr-defi-landing §5, "No Background Videos Layout".
//
// "grid grid-cols-1 md:grid-cols-3 md:grid-rows-2. All cards are white,
// rounded [1.5rem] md:rounded-[2rem], with
// hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] and overflow-hidden."
//
// Card placement from the prompt:
//   1. Tall left    — md:row-span-2 min-h-[28rem] + huge 2%-opacity Layers watermark
//   2. Wide top right — md:col-span-2 + Activity watermark anchored bottom-right
//   3. Bottom right 1 — text + outline "View Audits"-style button
//   4. Bottom right 2 — centred circular button with ArrowUpRight
//
// Every card links to a route that actually exists, so the section is
// navigation rather than decoration.
import { motion, useReducedMotion } from 'framer-motion';
import { Activity, ArrowUpRight, GitCompareArrows, Layers, LineChart, ShieldQuestion } from 'lucide-react';

const CARDS = [
  {
    key: 'command',
    variant: 'tall',
    icon: Layers,
    title: 'Satu layar yang tahu harus kamu periksa berikutnya',
    body:
      'Antrean keputusan di Home diurutkan dari akun dengan metrik tidak terukur, konten yang terlalu lama, sampai pipeline yang tertinggal. Tiap baris punya aksi, bukan cuma angka.',
    cta: { label: 'Buka command center', to: '/TITAN/dashboard' },
    watermark: { Icon: Layers, size: 340, top: '18%', left: '-12%' }
  },
  {
    key: 'compare',
    variant: 'wide',
    icon: GitCompareArrows,
    title: 'Bandingkan akun berdampingan, periode tetap',
    body:
      'Pilih hingga sembilan akun, kunci rentang tanggal yang sama, lalu baca follower, engagement rate, frekuensi posting, dan views dalam satu tabel. Nilai yang tidak dikumpulkan ditampilkan sebagai “tidak tersedia”, bukan 0.',
    cta: { label: 'Mulai bandingkan', to: '/TITAN/compare' },
    watermark: { Icon: Activity, size: 260, top: 'auto', bottom: '-18%', right: '-6%' }
  },
  {
    key: 'library',
    variant: 'button',
    icon: LineChart,
    title: 'Pustaka post yang bisa dicari',
    body:
      'Cari berdasarkan caption, filter per platform dan rentang tanggal, lalu buka post sumbernya. Thumbnail yang gagal dimuat punya fallback, dan angka 0 tidak disamakan dengan data kosong.',
    cta: { label: 'Jelajahi pustaka', to: '/TITAN/library' }
  },
  {
    key: 'quality',
    variant: 'circle',
    icon: ShieldQuestion,
    title: 'Integritas data, bukan estoppel',
    body:
      'TITAN memisahkan waktu scrape dari waktu posting terbaru, dan menghitung coverage per metrik. Kalau datanya basi, dashboard mengatakannya di depan, bukan setelah kamu menyimpulkan sendiri.',
    cta: { label: 'Cek status data', to: '/TITAN/settings' }
  }
];

export function Features() {
  const reduced = useReducedMotion();

  return (
    <section id="fitur" aria-labelledby="features-title" className="bg-[#f0f0f0] px-3 py-6 md:px-5 md:py-12">
      <div className="mx-auto w-full max-w-[1536px]">
        <div className="mb-8 flex flex-col gap-4 px-5 md:mb-12 md:flex-row md:items-end md:justify-between md:px-8">
          <h2
            id="features-title"
            className="max-w-2xl text-balance text-[clamp(1.9rem,3.4vw,3rem)] font-medium leading-[1.08] tracking-[-0.03em] text-neutral-900"
          >
            Dibangun untuk keputusan konten, bukan untuk menumpuk kartu
          </h2>
          <a
            href="/TITAN/account"
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-neutral-800 transition-colors hover:border-neutral-900 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
          >
            Lihat semua akun
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>

        <div className="rivr-features-grid">
          {CARDS.map((card, index) => {
            const Watermark = card.watermark?.Icon;
            return (
              <motion.article
                key={card.key}
                initial={reduced ? false : { opacity: 0, y: 26 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: index * 0.08 }}
                className={[
                  'rivr-feature-card group',
                  card.variant === 'tall' ? 'rivr-feature-card-tall' : '',
                  card.variant === 'wide' ? 'rivr-feature-card-wide' : ''
                ].join(' ')}
              >
                {Watermark ? (
                  <Watermark
                    className="rivr-watermark"
                    style={{
                      width: card.watermark.size,
                      height: card.watermark.size,
                      top: card.watermark.top,
                      bottom: card.watermark.bottom,
                      left: card.watermark.left,
                      right: card.watermark.right
                    }}
                    aria-hidden="true"
                    strokeWidth={0.6}
                  />
                ) : null}

                <div className="relative z-10 flex items-start justify-between gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-900">
                    <card.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                </div>

                <div className="relative z-10 mt-auto pt-8">
                  <h3 className="max-w-md text-[clamp(1.15rem,1.6vw,1.5rem)] font-medium leading-[1.2] tracking-[-0.02em] text-neutral-900">
                    {card.title}
                  </h3>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-neutral-600">{card.body}</p>

                  {card.variant === 'button' ? (
                    <a
                      href={card.cta.to}
                      className="mt-6 inline-flex items-center gap-2 rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-800 transition-colors hover:border-neutral-900 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                    >
                      {card.cta.label}
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  ) : null}

                  {card.variant === 'circle' ? (
                    <div className="mt-6 flex items-center justify-center">
                      <a
                        href={card.cta.to}
                        className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-neutral-200 text-neutral-900 transition-transform duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                      >
                        <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
                        <span className="sr-only">{card.cta.label}</span>
                      </a>
                    </div>
                  ) : null}
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
