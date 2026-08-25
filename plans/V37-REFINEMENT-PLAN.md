# TITAN V37 — PLAN PENYEMPURNAAN (hasil audit visual pasca-V36.4)
Tanggal: 2026-08-25 | Metode: screenshot loop headless Chromium semua page + sub-tab

## STATUS SAAT INI (terverifikasi visual, LIVE)
✓ Home — PulseBar + KPI + viral cards + live activity: BAGUS
✓ Akun (list) — tabel + PulseBar + filter: BAGUS
✓ Akun detail 5 sub-tab (Overview/Content/Patterns/Insights/Benchmark): HIJAU,
  Insights tab menampilkan 5 Kekuatan/5 Kelemahan/5 Rekomendasi + Strategy Brief
✓ Admin — crash FIXED: KPI tiles, 4 kartu admin, sparkline, charts tampil
✓ Kalender — heatmap multi-hue IG/TT + nav + "Hari ini": BAGUS
✓ Insight global — Strategy Brief SWOT terisi konten nyata (27/27)
✓ Bandingkan, Library (grid+table), Settings: BAGUS
✓ Tombol Kembali di AccountPage: TAMPIL (kiri breadcrumb)
✓ Data fresh badge topbar: "Data fresh - 6j lalu"

## SISA TEMUAN (dari screenshot + code audit)

### T1. Reni = 0 post (Admin)
Kartu Reni: POST 0, semua metrik 0/—. Hashtag #agustusre tidak punya post.
Bukan bug UI — data memang kosong. Empty state kartu harus jujur + CTA.

### T2. Sparkline admin flat (Reni, Julian)
Line chart tanpa variasi terlihat seperti garis mati. Perlu minimal
area-fill + tooltip titik terakhir.

### T3. Live Activity "0 likes 0 views" pada post TT baru
Sudah difix via enrich (46 post) — sisa 36 post lama terisi otomatis oleh
workflow berikutnya. VERIFY besok.

### T4. ChatPanel belum terverifikasi visual (butuh interaksi klik)
Auth sudah difix (X-Titan-Key build-time). Perlu test interaktif:
buka panel, kirim pesan, cek respons streaming.

### T5. Mobile: FAB chat vs sidebar toggle
Sudah diberi ruang (pb-20), tapi perlu screenshot mobile ulang untuk
konfirmasi tidak ada overlap.

### T6. Light theme belum diverifikasi visual
Toggle ada, token sudah benar, tapi belum ada screenshot light mode.

### T7. Footer "TITAN V34" — version drift
Sidebar footer masih tulis V34. Harus dinamis atau diupdate.

### T8. Insight page: badge staleness kecil
"5j" chip di account pills — artinya insight 5 jam lalu. Bagus. Tapi
tidak ada tombol "Regenerate" di UI (harus lewat Settings/workflow).

### T9. Komentar Admin tab (Admin page) belum diverifikasi visual
Tab kedua Admin — perlu screenshot.

### T10. Compare page dengan akun terpilih belum diverifikasi
Empty state bagus, tapi state 2-4 akun terpilih perlu dicek (chart vs).

---

## PLAN V37 — PENYEMPURNAAN (prioritas)

### FAZA 1 — VERIFIKASI INTERAKTIF (½ sesi)
1.1 ChatPanel E2E: buka panel → kirim "halo" → verify streaming respons
    (headless chromium + CDP evaluate). Kalau gagal: cek CORS/worker log.
1.2 Screenshot light mode semua page utama (toggle theme via CDP localStorage).
1.3 Screenshot mobile (390px) semua page — konfirmasi tidak ada overlap FAB.
1.4 Compare dengan 3 akun terpilih (klik via CDP) — verify chart vs.
1.5 Admin tab Komentar — screenshot + verify data komentar tampil.
1.6 Update footer versi: baca dari package.json version, bukan hardcoded.

### FAZA 2 — POLISH DATA-DRIVEN (½ sesi)
2.1 Kartu admin 0-post: empty state jujur "Belum ada post untuk hashtag ini
    bulan ini" + CTA link ke Library dengan filter hashtag.
2.2 Sparkline minimal: area gradient fill + dot titik terakhir + tooltip.
2.3 Insight page: tombol "Regenerate" (panggil worker hard-refresh atau
    link ke Settings → AI) untuk admin.
2.4 Verify enrich otomatis: setelah workflow besok, cek sisa 36 post TT
    sudah punya counts. Kalau tidak, tambah retry pass di enrich script.

### FAZA 3 — TOTAL UI REDESIGN LANJUTAN (dari V36 plan yang belum)
3.1 DataTable v2 unified (Admin/Library/AccountList pakai satu komponen:
    sticky header, column visibility, density toggle, sort, virtual scroll).
3.2 Motion system: number count-up di KPI, card hover lift 2px, nav
    transition — 4 interaksi saja, prefers-reduced-motion respect.
3.3 Empty states seragam: satu komponen EmptyState dipakai semua (icon +
    1 kalimat + CTA), skeleton per-shape (chart≠table≠card).
3.4 Typography hierarchy: h1/h2 konsisten antar page (PageHeader varian),
    display font untuk angka besar saja.
3.5 Brand identity: logo mark amber di sidebar (sekarang cuma huruf T),
    favicon brand-consistent.
3.6 A11y sweep: keyboard nav semua interaksi, contrast AA otomatis,
    aria-live untuk data refresh.

### FAZA 4 — QUALITY GATE
4.1 Vitest unit: admin-helpers (pure functions, mudah dites) target 80%.
4.2 Screenshot regression: simpan baseline semua page, diff otomatis.
4.3 Lighthouse: target perf >85, a11y >90.
4.4 Deploy + verify live + update CLAUDE.md/memory.

## ESTIMASI
Faza 1: ½ sesi | Faza 2: ½ sesi | Faza 3: 1-2 sesi | Faza 4: ½ sesi
Total: 2.5-3.5 sesi

## ACCEPTANCE CRITERIA V37
1. ChatPanel kirim/terima pesan nyata (bukan error)
2. Light mode semua page terverifikasi screenshot
3. Mobile semua page tanpa overlap
4. Compare dengan akun terpilih menampilkan chart
5. Kartu admin 0-post punya empty state + CTA
6. 0 post TT tanpa engagement counts (enrich lengkap)
7. Footer versi dinamis
8. admin-helpers test coverage >= 80%
9. Lighthouse perf >85, a11y >90
