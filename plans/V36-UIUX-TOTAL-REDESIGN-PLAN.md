# TITAN V36 — TOTAL UI/UX REDESIGN PLAN
Tanggal: 2026-08-24 | Audit: semua 10 routes + AppShell/Sidebar/Topbar + tokens + tailwind config
Skills dipakai: design-system (10-dim audit + slop-check), ui-ux-pro-max (styles/palette/typography/UX datasets), impeccable (polish/motion/hierarchy), frontend-design-direction (product-specific direction)

---

## BAGIAN A — TEMUAN AUDIT (semua terverifikasi dari source)

### A0. AKAR MASALAH #1 — DUA SUMBER KEBENARAN WARNA (bug, bukan selera)
- `tailwind.config.js`: warna HEX hardcoded (#0a0a0a, #3b82f6, dst)
- `src/styles/tokens.css`: warna OKLCH semantic (--bg-canvas dll)
- SEMUA component classes (.surface, .btn-primary, text-text-primary, bg-bg-primary)
  membaca TAILWIND HEX — tokens.css OKLCH hampir TIDAK DIPAKAI runtime.
- Konsekuensi: light theme PATAH total (ThemeToggle ada, tapi hex statis = light
  mode menampilkan warna dark). tokens.css hanya jadi dokumentasi mati.

### A1. FONT — Inter DISEBUT di tokens & tailwind tapi TIDAK PERNAH DIMUMAT
- index.html: 0 font link, 0 @font-face. Semua render pakai system-ui fallback.
- Identitas tipografi "Raycast ss03 Inter" = klaim kosong.

### A2. SKOR 10-DIMENSI (design-system audit)
| # | Dimensi | Skor | Bukti |
|---|---------|------|-------|
| 1 | Color consistency | 7 | 95% token-based; 13 raw Tailwind colors (bg-pink-500 dll di SectionLabel accents) + 6 hex IG gradient |
| 2 | Typography hierarchy | 5 | display scale ada di token tapi jarang dipakai; h1/h2 tidak konsisten antar page; font tak dimuat (A1) |
| 3 | Spacing rhythm | 8 | 4/8/12/16 konsisten via Tailwind scale |
| 4 | Component consistency | 6 | 13 ui primitives bagus TAPI Admin.jsx punya 15 fungsi inline sendiri (KpiTile, Sparkline, dsb) — duplikasi StatTile/Panel |
| 5 | Responsive | 5 | Admin 12 breakpoint patterns vs Calendar/AiInsights 1 — mobile tidak merata; tabel besar tidak discroll horizontal dengan baik |
| 6 | Dark/light mode | 2 | Light PATAH (A0). Dark OK. |
| 7 | Animation | 4 | 65x transition-colors (monoton), 3 animate total; tidak ada motion hierarchy — semua terasa flat |
| 8 | Accessibility | 6 | aria ada di page besar (Admin 7, Library 6) tapi Home cuma implisit; focus states via default browser |
| 9 | Information density | 6 | Home 3-zone bagus; Admin 1527 baris = wall-of-data tanpa progresi visual; Library cap 200 dengan CTA buruk |
| 10 | Polish | 5 | EmptyState ada di 7 file, Skeleton cuma 4; loading state tidak seragam; hover states monoton |

TOTAL: 54/100 — fondasi token bagus (warisan V23) tapi EKSEKUSI terputus di
tailwind layer, light mode patah, font bohong, dan Admin monolith.

### A3. AI-SLOP CHECK (design-system mode 3)
- TIDAK ada: gradien gratis, purple-blue default, glass morphism ✓ (bagus)
- ADA: "Grafana-style" 3-zone + SectionLabel numbered 01-09 di Home = pattern
  yang benar untuk dashboard TAPI over-engineered untuk 9 akun — terasa
  korporat-kaku untuk tim kecil 13 orang. Kekurangan SATU momen memorable.
- Brand accent amber (--accent-brand dari logo) ada di token tapi hampir tak
  terlihat di UI — identitas brand Majang Mejeng lemah.

### A4. PER-PAGE FINDINGS
1. **Home (271 ln)** — struktur 3-zone solid. Masalah: Hero KPI strip generik
   (4 angka besar tanpa konteks), tidak ada "moment" pembuka, viral card butuh
   media thumbnail (sekarang text-only).
2. **AccountList (198)** — tabel Strapi-style OK, tapi tidak ada visual identity
   per akun (avatar kecil, tanpa platform color coding yang konsisten).
3. **AccountPage (130 + 5 sub)** — tab shell baik. Overview padat tapi sub-tabs
   tidak punya visual differentiation.
4. **Admin (1527 ln!)** — MONOLITH: 15 fungsi inline, duplikat KpiTile/StatTile,
   Sparkline sendiri. UX: tabel hashtag + summary + chart + komentar dalam satu
   scroll panjang tanpa navigasi internal. Perlu rombak arsitektur + UX flow.
5. **AiInsights (156)** — tab per akun + staleness chip. Konten text-heavy,
   butuh card hierarchy lebih jelas (ViralRecipe/GrowthStrategy/StrategyBrief
   3 komponen besar dengan struktur mirip = bisa disatukan pattern).
6. **Calendar (255)** — heatmap multi-hue baru (V34.12) bagus. Interaksi click
   day minimal. Tidak ada month navigation yang jelas.
7. **Compare (234)** — pilih 2-4 akun, side-by-side. Mobile cards ada. Perlu
   visual "vs" yang lebih dramatis + ranking yang lebih jelas.
8. **Library (324)** — tabel global + filter. Cap 200 dengan warning. Search
   caption. Butuh: grid view option (post punya thumbnail), filter chips yang
   lebih visual, hasil yang lebih scannable.
9. **Settings (259)** — vertical tabs OK. Password gate hard-refresh. Fine.
10. **NotFound (26)** — fungsional, rendah prioritas.
11. **ChatPanel (326)** — floating AI chat. Markdown minimal. Perlu polish
    typing indicator + message bubbles.

### A5. PERF (react-performance + bundle)
- accounts-full chunk = **7.7 MB JS** (data dibundle!) — ini BUKAN design tapi
  menghambat persepsi UI (first load lambat). Fix: fetch JSON terpisah.
- recharts vendor 412 KB dimuat di 9 file — lazy per-chart sudah, tapi
  pertimbangkan chart lib ringan untuk sparklines.

---

## BAGIAN B — DESIGN DIRECTION V36 (frontend-design-direction)

**Purpose**: dashboard intelijen harian untuk tim marketing 13 orang —
dibuka tiap pagi, discan 2 menit, dipakai review mingguan.
**Audience**: Owner (lihat tren), Kepala Kantor (koordinasi), PIC Divisi &
Staff (posting harian + tracking hashtag).
**Tone**: "Command center yang hangat" — dense & scannable seperti Linear/
Raycast, TAPI dengan identitas brand Majang Mejeng (amber-orange) yang jelas,
bukan generik slate-biru.
**Memorable detail**: **"Pulse"** — satu baris heartbeat di atas setiap page:
ringkasan visual kecil (dot per akun, warna = platform, intensitas = aktivitas
7 hari) + angka besar HANYA untuk 1 metrik paling penting per konteks. Ini
jadi signature TITAN yang tidak ada di dashboard lain.
**Constraints**: React + Tailwind + tokens OKLCH existing; jangan tambah deps
berat; a11y AA; mobile-first untuk staff.

---

## BAGIAN C — PLAN EKSEKUSI (5 faza, tiap sub-task tested)

### FAZA 0 — FONDASI (wajib duluan, ½ sesi)
0.1 **Satukan sumber kebenaran warna**: rewrite tailwind.config.js membaca
    tokens.css (CSS vars) — hapus SEMUA hex hardcoded. Light theme langsung
    hidup kembali. Verify: toggle theme = semua page berubah.
0.2 **Load font Inter** (Google Fonts, preconnect + display=swap, subset
    latin) + fallback stack benar. Verify: computed font = Inter.
0.3 **Design tokens v2**: tambahkan elevation scale (3 level, bukan 5),
    motion tokens per-interaksi (hover/press/enter), brand amber dipromosikan
    (accent-brand dipakai di: logo, active nav, 1 KPI terpenting, CTA utama).
0.4 **Split data chunk**: accounts-full.json jadi fetch runtime (bukan import),
    loading skeleton saat fetch. 7.7MB → ~100KB initial JS.
0.5 **Audit a11y baseline**: focus-visible ring token, skip-link, contrast
    check otomatis (script kecil) untuk semua pasangan token.

### FAZA 1 — DESIGN SYSTEM + SHARED COMPONENTS (1 sesi)
1.1 **Komponen baru "Pulse"** (signature): `<PulseBar accounts />` — dot grid
    per akun + spark intensity, dipakai di atas semua page utama.
1.2 **KpiTile v2** (satu sumber, hapus duplikat di Admin): display typography
    benar, delta chip, optional sparkline slot, accent via prop.
1.3 **DataTable v2**: satu komponen tabel untuk Admin/Library/AccountList —
    sticky header, horizontal scroll mobile, column visibility, sort, row
    density toggle, virtualisasi jika >200 rows.
1.4 **EmptyState/LoadingState v2**: satu pattern (icon + 1 kalimat + CTA),
    skeleton per-shape (chart skeleton ≠ table skeleton ≠ card skeleton).
1.5 **Motion system**: definisikan 4 interaksi saja (nav transition, card
    hover lift 2px, number count-up, skeleton shimmer) — hapus sisanya.
    prefers-reduced-motion respect.
1.6 **Bersihkan 13 raw Tailwind colors** → token (SectionLabel accents jadi
    semantic prop).

### FAZA 2 — PAGE-BY-PAGE (2 sesi, urutan dampak)
2.1 **Home**: Hero v2 = PulseBar + 1 angka besar (posts 7 hari) + delta;
    viral cards dapat thumbnail (dari thumbnailUrl yang sudah ada di data!);
    zone labels disederhanakan (tanpa nomor 01-09, cukup label); LiveActivity
    feed dapat avatar stack.
2.2 **Admin rombak total** (paling besar):
    - Split jadi 4 sub-komponen file (AdminKpis, AdminTable, AdminCharts,
      AdminComments) + internal tabs (Ringkasan | Postingan | Komentar).
    - UX flow baru: pilih admin → lihat kartu admin (avatar, streak, total)
      → drill-down tabel. Bukan semua sekaligus.
    - Pakai DataTable v2 + KpiTile v2. Hapus 15 fungsi inline.
2.3 **Library**: tambah Grid View toggle (kartu thumbnail 16:9 dari
    thumbnailUrl, caption 2 baris) di samping Table View; filter chips visual
    (avatar akun + platform icon); hasil cap dinaikkan dengan lazy load.
2.4 **Calendar**: month nav jelas (‹ Agustus 2026 ›), click day = popover
    daftar post (bukan pindah halaman), legend interaktif (klik platform =
    highlight).
2.5 **Compare**: layout "versus" — kolom per akun dengan rank medal, bar
    race kecil per metrik; mobile = swipeable cards.
2.6 **AiInsights**: samakan 3 komponen insight jadi satu pattern InsightCard
    (judul + body + confidence + CTA); tab strip dengan staleness dot.
2.7 **AccountList/AccountPage**: row = avatar + platform chip + mini sparkline
    inline; AccountPage sub-tabs dapat ikon + count badge.
2.8 **ChatPanel + NotFound + Settings**: polish bubbles, typing indicator,
    404 dapat ilustrasi brand (logo mark besar amber).

### FAZA 3 — POLISH & VERIFY (½ sesi)
3.1 Screenshot semua page (light+dark, mobile+desktop) sebelum/sesudah.
3.2 A11y: keyboard nav semua interaksi, contrast AA verify otomatis.
3.3 Perf: Lighthouse sebelum/sesudah (target: initial JS <300KB, LCP <2.5s).
3.4 Design-system audit ulang: target total >= 75/100 (dari 54).

### FAZA 4 — DEPLOY
4.1 Build + pre-flight + deploy lokal (pola V35 sudah stabil).
4.2 Verify live: bundle hash, light theme benar-benar light, font Inter
    ter-load, PulseBar tampil.
4.3 Update CLAUDE.md + memory.

## URUTAN & ESTIMASI
Faza 0 → 1 → 2 (2.2 Admin paling besar, bisa paralel dengan 2.3-2.8) → 3 → 4.
Total ± 4 sesi kerja.

## ACCEPTANCE CRITERIA (terukur)
1. Light & dark theme SAMA BAGUSNYA (toggle berfungsi penuh, 0 hex statis)
2. Inter ter-load & terpakai (computed style verify)
3. Initial JS < 300KB (data chunk terpisah dari bundle)
4. Design-system audit >= 75/100
5. Admin.jsx <= 400 baris/route-file (monolith pecah)
6. 0 raw Tailwind colors di routes/components (semua token)
7. PulseBar tampil di semua page utama (signature terlihat)
8. Semua tabel pakai DataTable v2 (satu sumber)
9. Keyboard navigable penuh + contrast AA (audit otomatis lolos)
10. Screenshot before/after semua page tersimpan sebagai dokumentasi
