// Footer — stark-minimal-footer, implemented to the prompt's spec.
//
// This is the closest prompt-to-code ratio in the set: the whole thing is
// written as exact CSS values, so prompt-sites.css carries it verbatim and this
// file is the markup. Kept as written:
//
//   .footer-dots 120px band, .footer-dots__line 200% wide, 70px tall, three
//                layered radial-gradient dot patterns at the exact positions
//                and sizes, footerDotsMove 18s linear infinite
//   .site-footer__top   minmax(320px, 1.25fr) repeat(3, minmax(150px, 0.42fr)),
//                       gap clamp(28px, 4vw, 76px), min-height clamp(220px, 24vw, 330px)
//   .site-footer__mark  clamp(58px, 6.1vw, 118px) circle with the zig-zag
//                       ::before clip-path
//   .site-footer__wordmark  clamp(58px, 11.1vw, 214px), weight 760,
//                       letter-spacing -0.055em, line-height 0.78, nowrap
//   .site-footer__legal 9px, rgb(255 255 255 / 0.52)
//   breakpoints at 980px and 560px
//
// Substituted: "EngineTech" → TITAN, and the nav columns point at TITAN's real
// routes instead of a fictional site's anchors.
export function LandingFooter() {
  return (
    <footer className="site-footer titan-prompt-font">
      <div className="footer-dots" aria-hidden="true">
        <div className="footer-dots__line" />
      </div>

      <div className="site-footer__inner">
        <div className="site-footer__top">
          <h2>Intelligence for content teams that have to defend their numbers.</h2>

          <nav className="site-footer__nav" aria-label="Navigasi produk">
            <a href="/TITAN/dashboard">Command center</a>
            <a href="/TITAN/account">Daftar akun</a>
            <a href="/TITAN/compare">Perbandingan</a>
            <a href="/TITAN/library">Pustaka</a>
            <a href="/TITAN/calendar">Kalender</a>
          </nav>

          <nav className="site-footer__nav" aria-label="Navigasi sistem">
            <a href="/TITAN/ai">Insight AI</a>
            <a href="/TITAN/admin">Admin</a>
            <a href="/TITAN/settings">Pengaturan</a>
            <a href="/TITAN/data/manifest.json" target="_blank" rel="noreferrer">Data manifest</a>
            <a href="/TITAN/manifest.webmanifest">Manifest</a>
          </nav>

          <nav className="site-footer__nav" aria-label="Tautan status">
            <a href="/TITAN/settings">Status data</a>
            <a href="/TITAN/dashboard">Antrean keputusan</a>
            <a href="/TITAN/compare">Benchmark internal</a>
          </nav>
        </div>

        <div className="site-footer__brand-row">
          <a href="/TITAN/" className="site-footer__brand" aria-label="TITAN beranda">
            <span className="site-footer__mark" aria-hidden="true" />
            <span className="site-footer__wordmark">TITAN</span>
          </a>
        </div>

        <div className="site-footer__legal">
          <p>© 2026 TITAN — Social Media Marketing Intelligence Dashboard</p>
          <a href="/TITAN/settings">Status pipeline</a>
          <a href="/TITAN/data/manifest.json" target="_blank" rel="noreferrer">Versi data</a>
        </div>
      </div>
    </footer>
  );
}
