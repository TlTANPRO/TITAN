# TITAN TOTAL REDESIGN PLAN — V34
Tanggal: 2026-08-23 | Basis: audit adversarial terverifikasi (curl + parse + node)
Metode verifikasi: setiap klaim dicek live → source → data, sesuai 7 Prinsip Audit.

## GROUND TRUTH (fakta terverifikasi)

### Data
- accounts-full.json: 9 akun (4 IG, 5 TT), 4.072 posts, 0 dup ID
- IG fresh (latest 20-21 Aug), TT STALE:
  - majangmejeng_ 09 Aug, syahfalahproperti 08 Aug, ardian.tanah 08 Aug,
    ardiantanahmenjawab 19 Jul, itsnisyananda 17 Jun
- Admin hashtags: #agustusrm=27, #agustusrf=12, #agustusju=4, #agustusre=0
  (semua hanya dari ig-majangmejeng_)
- admin-comments.json: 12 entri MANUAL (file sendiri: "manual until a free
  scraper is wired" — scraper komentar BELUM diwire ke pipeline)

### Avatar
- ProxiedAvatar: localAvatar → fallback brand-icon tile (IG gradasi / TT hitam)
- ig-majangmejeng_.png = 4168x4168 PNG (BUKAN ukuran profile pic normal;
  scrape-avatars.mjs og:image bisa menangkap gambar yang SALAH saat
  login-wall/redirect). Tidak ada validasi apapun pada avatar hasil scrape.
- 5 akun TT tidak punya profilePicUrl live; hanya andalkan localAvatar.

### Infra
- Scraper TT: discovery via DDG/Bing lewat Jina (0–5 video acak per run),
  TIDAK PERNAH ambil feed user langsung → penyebab stagnasi.
- Worker Cloudflare: endpoint chat/proxy TANPA auth, TANPA rate limit,
  CORS *. Hanya /hard-refresh yang terproteksi.
- Repo 69MB: tmp-acc.json, accounts-live.json, live-main.js, live-afull.js,
  logs.zip = duplikat/temp ikut di-commit.
- Tests: vitest terpasang, 0 test suite untuk UI/pipeline (ada 3 test lib saja).
- Doc drift: CLAUDE.md bilang 3.999 posts & hash bundle lama (aktual 4.072,
  D4J082VS).

---

## FAZA 0 — FIX DATA PIPELINE (prioritas #1, tanpa ini UI baru = data busuk)

0.1 Scraper TikTok baru (pengganti DDG/Bing discovery):
    - Sumber utama: TikWM `/api/user/posts` (free, no key) — ambil feed user
      LANGSUNG, cursor pagination sampai ketemu post yang sudah ada.
    - Fallback 1: TikWM `/api/feed/search` keywords=username (sudah ada).
    - Fallback 2: Jina reader ke `tiktok.com/@user` (parse video ID dari HTML).
    - Acceptance: setelah run, `latest post` tiap 5 akun TT <= 24 jam dari
      postingan asli terbaru (verifikasi manual cek 1 akun di app TT).
0.2 Wire scraper komentar:
    - TT: aktifkan `scripts/scrape-comments-tt.mjs` di daily-update.yml
      (sudah ada, belum dipanggil workflow).
    - IG: source gratis — i.instagram.com GraphQL comment endpoint (pattern
      V28 sama seperti /feed/user/) atau fallback Jina ke halaman post
      (commentCount + teks via render). Target: komentar per admin otomatis
      harian, bukan JSON manual 12 baris.
0.3 Merge + SSOT bersih:
    - Hapus dari repo & pipeline: tmp-acc.json, accounts-live.json,
      live-main.js, live-afull.js, logs.zip, debug-og.mjs, audit-avatar.mjs.
    - accounts-full.json = satu-satunya SSOT data; generated files masuk
      .gitignore kecuali yang dibutuhkan deploy.
0.4 Validasi avatar otomatis (perbaiki akar masalah icon):
    - scrape-avatars.mjs tambah validasi: ukuran wajib <= 512px (profile pic),
      hash unik per akun (tolak jika 2 akun punya hash sama), tolak jika
      response bukan image, bandingkan bytes dengan versi lama (log jika
      berubah).
    - Re-scrape semua 9 avatar dengan validasi; VERIFIKASI VISUAL manual oleh
      user (9 gambar) sebelum commit.
    - Kompres ig-*.png 4168px → 256x256 webp/png (perf).
0.5 Perbaiki doc drift: CLAUDE.md update jumlah posts dinamis + hash check
    otomatis (script pre-session sudah ada, tinggal diset benar).

## FAZA 1 — WORKER SECURITY + RELIABILITY

1.1 Auth ringan endpoint LLM/chat: header X-Titan-Key (secret di Worker env +
    di-inject saat build via GH secret VITE_TITAN_KEY). Tanpa key = 401.
1.2 Rate limit per-IP sederhana (Cloudflare KV atau DO-free: cache API +
    counter 60 req/jam/IP untuk endpoint chat & soft-refresh).
1.3 CORS dikunci ke https://tltanpro.github.io (bukan *).
1.4 Health endpoint /status (uptime, kuota provider, last scrape age) —
    dipakai Settings page untuk tampilkan status pipeline ke user.

## FAZA 2 — UI/UX REDESIGN (ui-ux-pro-max + design-system + impeccable)

2.0 Design tokens (design-system generate):
    - DESIGN.md + design-tokens.json: palet (dark-first, slate/zinc base +
      1 accent brand), skala spacing 4/8/16, radius konsisten, tipografi
      hierarki jelas (pilih pairing dari typography.csv ui-ux-pro-max).
    - Hapus AI slop (design-system slop-check): gradien gratis, hover-scale,
      glass morphism tak berfungsi (sesuai titan-v23-design-skill lama).
2.1 Layout shell:
    - Sidebar: grup navigasi (Analitik: Home/Akun/Bandingkan/Kalender/Library |
      Intelijen: Insight | Operasional: Admin/Settings) — sekarang 8 item flat.
    - Topbar: status freshness data (badge "data 23 Aug · TT 09 Aug ⚠") supaya
      staleness TERLIHAT, tombol refresh, theme toggle.
2.2 Halaman Home: hero metrik ringkas (total posts, akun aktif, post 7 hari),
    grid aktivitas per platform, viral posts. Konsisten token baru.
2.3 Halaman Admin (rombak total):
    - Ringkasan per admin: kartu (post count dari hashtag + comment count
      otomatis + streak mingguan) untuk Reni/Rifqi/Reta/Julian.
    - Tabel postingan per hashtag: filter bulan (monthly picker existing),
      kolom platform, akun, engagement.
    - Grafik komentar per admin per bulan (Recharts, data dari scraper 0.2).
    - Empty state jujur: "#agustusre: 0 post bulan ini" + CTA.
2.4 Halaman Akun: kartu akun pakai avatar asli tervalidasi (Faza 0.4),
    badge staleness per akun ("TT: terakhir 09 Aug"), link ke profil asli.
2.5 Polish (impeccable): loading skeleton semua chart, empty state semua
    list, focus states, kontras AA (audit 10 dimensi design-system, skor tiap
    dimensi >= 7 sebelum lanjut).
2.6 Aksesibilitas & perf: lazy route (sudah ada), avatar lazy+dimensi fixed
    (hindari CLS), audit react-performance.csv untuk list 4k posts
    (virtualisasi tabel besar bila perlu).

## FAZA 3 — TESTING & QUALITY GATE

3.1 Unit test lib kritikal: adminHashtags, normalize, merge/dedup, worker
    routing (target coverage lib >= 80%).
3.2 E2E pipeline: script smoke test harian — jalankan scrape dry-run,
    assert: 9 akun, TT latest <= 48 jam, avatar valid, JSON schema OK.
    Gagal = workflow merah + notice.
3.3 Visual check: screenshot 8 halaman (playwright di CI atau lokal) untuk
    regresi layout.

## FAZA 4 — DEPLOY & HANDOVER

4.1 Deploy bertahap: Faza 0 dulu (data benar) → verifikasi live curl →
    Faza 1+2 → verify bundle hash + fitur di live.
4.2 Update CLAUDE.md + memory pointers versi V34.
4.3 Backup: tag git v33-final sebelum rombak.

---

## URUTAN EKSEKUSI & DEPENDENSI
Faza 0 (pipeline+avatar) HARUS duluan — UI baru dengan data stale = sia-sia.
Faza 1 paralel dengan 2.0-2.1 (beda domain).
Faza 2.3 (Admin) butuh output 0.2 (scraper komentar).
Total estimasi: 4 sesi kerja (0: 1 sesi, 1+2.0-2.1: 1, 2.2-2.6: 1, 3+4: 1).

## ACCEPTANCE CRITERIA (seluruhnya terukur)
1. 9/9 avatar = foto profil ASLI (verifikasi visual user + validasi hash)
2. Latest post TT semua akun <= 48 jam saat pipeline jalan
3. Tab Admin: jumlah post per admin per hashtag + jumlah komentar per admin,
   update otomatis harian, 0 entri manual
4. Worker chat endpoint menolak request tanpa key (401), rate limit aktif
5. Repo tanpa file temp/duplikat; vitest >= 80% lib coverage
6. Live bundle hash match repo; semua halaman render tanpa error console
