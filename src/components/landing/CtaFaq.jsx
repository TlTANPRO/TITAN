// CTA + FAQ — faq-cta, implemented to the prompt.
//
// Left column: the `.c5-animated-gradient` card, including the prompt's full
// @property blob animation, copied verbatim into prompt-sites.css. The button
// bumps its shadow on hover via onMouseEnter/onMouseLeave exactly as specified.
//
// Right column: a five-item accordion. The prompt holds state with
// useState<number | null>(0) and a toggle; the card styling (border radius 10px,
// 18px/20px padding, the two box-shadow states, ChevronUp when active) is the
// prompt's.
//
// Questions are TITAN's, and they are the questions this dashboard actually
// raises about itself.
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const FAQ = [
  {
    q: 'Kenapa dashboard ini sering menampilkan angka 0?',
    a: 'Karena ada dua kemungkinan yang berbeda, dan TITAN tidak menggabungkannya. Nol berarti post itu memang tidak punya interaksi. “Tidak tersedia” berarti metrik itu belum pernah dikumpulkan untuk post tersebut. Kalau keduanya dibiarkan sama, kamu akan menyimpulkan sesuatu yang salah.'
  },
  {
    q: 'Seberapa sering data diperbarui?',
    a: 'Pipeline berjalan terjadwal setiap hari. Kalau jumlah post baru yang ditambahkan nol padahal pipeline melaporkan sukses, TITAN akan menampilkan peringatan di beranda — kondisi itu yang sedang terjadi sekarang dan sengaja ditampilkan, bukan disembunyikan.'
  },
  {
    q: 'Apakah angka industri atau benchmark eksternal tersedia?',
    a: 'Belum, dan itu keputusan sadar. TITAN hanya menampilkan angka yang bisa dihitung dari data yang dimuat. Menambahkan benchmark industri berarti mengarang sumber yang belum disetujui, jadi section itu sengaja tidak ada sampai ada sumber yang sah.'
  },
  {
    q: 'Bagaimana AI chat dilindungi?',
    a: 'Browser tidak pernah memegang secret jangka panjang. Kredensial bootstrap ditukar menjadi token sesi berumur pendek di server Worker, dan token itu disimpan di sessionStorage sehingga hilang saat tab ditutup.'
  },
  {
    q: 'Apakah bisa dipasang sebagai aplikasi?',
    a: 'Manifest web sudah terhubung dan bisa dipasang di sebagian browser, tapi TITAN sengaja tidak punya service worker. Aplikasi ini butuh data baru setiap hari, dan cache offline hanya akan menampilkan angka lama tanpa ada peringatan bahwa datanya sudah basi.'
  }
];

export function CtaFaq() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hover, setHover] = useState(false);

  return (
    <section id="faq" className="bg-white py-20 text-neutral-900 max-[900px]:py-[60px]">
      <div className="mx-auto w-full max-w-[1100px] px-5">
        <div className="grid grid-cols-[1.6fr_1fr] items-stretch gap-[30px] max-[900px]:grid-cols-1 max-[900px]:gap-[60px]">
          {/* Left — animated gradient CTA card */}
          <div
            className="c5-animated-gradient flex flex-col items-center justify-center rounded-[24px] px-10 py-20 text-center text-white"
            style={{ boxShadow: '0 10px 30px rgba(0, 0, 0, 0.05)' }}
          >
            <h2 className="mb-[15px] font-normal leading-[1.1] text-balance" style={{ fontSize: 'clamp(2.2rem,4.4vw,3.5rem)', letterSpacing: '-0.03em' }}>
              Lihat datanya
              <br />
              sebelum percaya.
            </h2>
            <p className="mb-[30px] text-[0.9rem] font-normal opacity-85">
              Buka command center dan lihat antrean keputusan hari ini.
            </p>
            <a
              href="/TITAN/dashboard"
              onMouseEnter={() => setHover(true)}
              onMouseLeave={() => setHover(false)}
              className="cursor-pointer border-none bg-neutral-900 font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
              style={{
                padding: '14px 32px',
                borderRadius: '12px',
                fontSize: '0.95rem',
                boxShadow: hover
                  ? '0 14px 30px rgba(0,0,0,0.4)'
                  : '0 10px 20px rgba(0,0,0,0.3)'
              }}
            >
              Mulai sekarang
            </a>
          </div>

          {/* Right — FAQ accordion */}
          <div className="flex flex-col justify-center gap-3">
            {FAQ.map((item, index) => {
              const isActive = activeIndex === index;
              return (
                <div
                  key={item.q}
                  className={`faq-item ${isActive ? 'is-active' : ''}`}
                  onClick={() => setActiveIndex(isActive ? null : index)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isActive}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveIndex(isActive ? null : index);
                    }
                  }}
                >
                  <div className="flex items-center justify-between gap-3 font-normal text-[0.9rem] text-neutral-900">
                    <span>{item.q}</span>
                    {isActive ? (
                      <ChevronUp size={20} className="shrink-0" aria-hidden="true" />
                    ) : (
                      <ChevronDown size={20} className="shrink-0" aria-hidden="true" />
                    )}
                  </div>
                  {isActive ? (
                    <p className="mt-3 text-[0.9rem] leading-[1.6] text-[#666]">{item.a}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
