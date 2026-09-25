// Landing navigation — rivr-defi-landing spec.
//
// "Hidden on desktop, mobile shows text logo 'RIVR'. Desktop shows centered
// links ... Add a right-aligned 'Book Demo' hoverable button (dark blue
// background, white text, inner white/20 pill with ArrowUpRight)."
//
// The prompt hides the nav on desktop, which would leave the landing page with
// no way to reach the app, so the brand stays visible on both and the desktop
// centre links are the addition. Everything else follows the spec.
import { useEffect, useState } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';

const LINKS = [
  { label: 'Fitur', href: '#fitur' },
  { label: 'Angka', href: '#angka' },
  { label: 'Spesifikasi', href: '#spesifikasi' },
  { label: 'Data', href: '#data' },
  { label: 'FAQ', href: '#faq' }
];

export function LandingNav({ tone = 'dark' }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Lock body scroll while the mobile panel is open, and close it on Escape.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const light = tone === 'light';

  return (
    <nav
      aria-label="Navigasi utama"
      className="relative z-30 w-full px-4 pt-4 md:px-7 md:pt-6"
    >
      <div
        className={[
          'flex items-center justify-between gap-4 rounded-full px-3 py-2 transition-colors duration-300 md:px-4',
          scrolled
            ? light
              ? 'bg-neutral-900/25 backdrop-blur-xl'
              : 'bg-neutral-900/80 backdrop-blur-xl'
            : light
              ? 'bg-transparent'
              : 'bg-transparent'
        ].join(' ')}
      >
        <a
          href="/TITAN/"
          aria-label="TITAN beranda"
          className={[
            'shrink-0 rounded-full px-2 py-1 text-lg font-bold tracking-[-0.03em] focus-visible:outline-none focus-visible:ring-2',
            light ? 'text-white focus-visible:ring-white' : 'text-neutral-900 focus-visible:ring-neutral-900'
          ].join(' ')}
        >
          TITAN
        </a>

        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className={[
                  'inline-flex items-center rounded-full px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2',
                  light
                    ? 'text-white/75 hover:text-white focus-visible:ring-white'
                    : 'text-neutral-600 hover:text-neutral-900 focus-visible:ring-neutral-900'
                ].join(' ')}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <a
            href="/TITAN/dashboard"
            className="hidden items-center gap-2 rounded-full bg-[#1b2b4b] px-4 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b2b4b] sm:inline-flex"
          >
            Buka dashboard
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </a>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            className={[
              'inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 md:hidden',
              light
                ? 'bg-white/10 text-white hover:bg-white/20 focus-visible:ring-white'
                : 'bg-neutral-900/10 text-neutral-900 hover:bg-neutral-900/20 focus-visible:ring-neutral-900'
            ].join(' ')}
          >
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            <span className="sr-only">{open ? 'Tutup menu' : 'Buka menu'}</span>
          </button>
        </div>
      </div>

      {open ? (
        <div
          id="landing-mobile-menu"
          className="mt-2 overflow-hidden rounded-3xl border border-white/20 bg-neutral-900/95 p-3 backdrop-blur-xl md:hidden"
        >
          <ul className="space-y-0.5">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-2xl px-4 py-3 text-base font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li className="pt-1">
              <a
                href="/TITAN/dashboard"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-2xl bg-[#1b2b4b] px-4 py-3 text-base font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Buka dashboard
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </li>
          </ul>
        </div>
      ) : null}
    </nav>
  );
}
