# TITAN DESIGN.md — V34 Redesign
Tanggal: 2026-08-24 | Metode: design-system audit + ui-ux-pro-max + impeccable

## AUDIT 10 DIMENSI (kondisi sekarang)

| Dimensi | Skor | Temuan utama |
|---|---|---|
| 1. Color consistency | 7 | Token system OKLCH sudah bagus; ada sisa raw Tailwind (pink/cyan di beberapa komponen lama) |
| 2. Typography hierarchy | 6 | Display scale ada tapi jarang dipakai; h1 halaman tidak konsisten (sr-only di Home, teks 2xl di Admin, tidak ada di beberapa) |
| 3. Spacing rhythm | 7 | 4/8 skala konsisten |
| 4. Component consistency | 6 | PageHeader component ADA tapi hanya dipakai 1-2 halaman; tiap halaman punya gaya header sendiri |
| 5. Responsive | 7 | Sidebar collapsible OK; tabel sudah responsive |
| 6. Dark mode | 8 | Dark-first, light theme lengkap |
| 7. Animation | 7 | Halus, ada reduced-motion |
| 8. Accessibility | 7 | AA terjaga, aria lengkap |
| 9. Information density | 6 | Home 9 baris bento = panjang sekali scroll; Admin 1500 baris 1 halaman |
| 10. Polish | 5 | **BUG: .btn-primary/.btn-secondary dipakai di Topbar/Settings/NotFound tapi TIDAK PERNAH didefinisikan di CSS = tombol tanpa style** |

**Rata-rata: 6.6/10** → target redesign ≥ 8.

## KEPUTUSAN DESAIN (design tokens)

### Palet (tetap OKLCH dark-first, 1 perubahan penting)
- Accent primary: **tetap blue oklch(0.65 0.20 250)** — brand konsisten
- TAMBAH `--accent-brand: oklch(0.70 0.19 55)` (amber-oranye, dari logo Majang Mejeng M) sebagai accent identitas untuk momen khusus (logo, admin section, CTA penting)
- Platform: IG pink / TT cyan tetap

### Tipografi (enforce hierarki)
- H1 halaman: `text-display-lg` (600 1.5rem) + kicker label `00 / HOME` style — SATU komponen `PageHeader` untuk SEMUA halaman
- Section: SectionLabel (sudah bagus, dipertahankan)
- Body: 14px, numeric tnum

### Spacing & Radius
- Tetap 4/8 skala, radius lg (12px) untuk surface

### Komponen baru/diperbaiki
1. **`.btn-primary` / `.btn-secondary` / `.btn-ghost` DIDEFINISIKAN** (fix bug)
2. **PageHeader dipakai di semua 8 halaman** (kicker + title + subtitle konsisten)
3. **Sidebar: nav dikelompokkan 3 grup** — Analitik (Home/Akun/Bandingkan/Kalender/Library), Intelijen (Insight), Operasional (Admin/Settings) dengan label grup uppercase kecil
4. **Topbar: freshness badge global** — chip hijau/kuning/merah dari latest post semua akun, terlihat di setiap halaman
5. **Admin page dipecah 2 tab**: "Postingan" (existing table+charts) & "Komentar" (KomentarAdmin) — kurangi 1500-baris single page

### Anti-slop rules (dipertahankan dari V23)
- No hover-scale, no gradien dekoratif, no glass morphism
- 1 accent per tile, tnum untuk semua angka

## ACCEPTANCE
- [ ] btn-* terdefinisi & terlihat di Topbar
- [ ] 8/8 halaman pakai PageHeader
- [ ] Sidebar 3 grup dengan label
- [ ] Freshness badge di Topbar
- [ ] Admin 2 tab
- [ ] Build sukses, 74+ test pass, visual check live
