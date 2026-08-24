# TITAN AUDIT ULANG + PLAN PERBAIKAN PENUH — V35
Tanggal: 2026-08-24 | Metode: 7 Prinsip Audit (live curl → source → data → logs Actions)

## BAGIAN A — HASIL AUDIT (semua terverifikasi)

### A1. LIVE SITE ✓ sebagian
- https://tltanpro.github.io/TITAN/ HTTP 200, bundle `vite-index.template-CxLwy0t8.js` = V34 Faza 2 UI redesign SUDAH live
- Data live accounts-full.json: 9 akun (4 IG, 5 TT), 4.170 posts

### A2. DATA STALE ❌ (masalah #1)
| Akun | Platform | Latest post |
|---|---|---|
| ig-majangmejeng_ | IG | 2026-07-13 |
| ig-syahfalahproperti | IG | 2026-07-13 |
| ig-nisyanandaa | IG | 2026-07-12 |
| ig-ardiantanah | IG | 2026-07-13 |
| tt-majangmejeng_ | TT | 2026-08-09 |
| tt-syahfalahproperti | TT | 2026-08-08 |
| tt-ardian.tanah | TT | 2026-08-08 |
| tt-ardiantanahmenjawab | TT | 2026-07-19 |
| tt-itsnisyananda | TT | 2026-06-17 |

IG mati total sejak 13 Jul (±6 minggu). TT 3/5 akun stale >1 bulan.

### A3. PIPELINE HARIAN GAGAL BERUNTUN ❌ (akar masalah)
daily-update.yml: sukses s/d 21 Aug → FAILURE 22 Aug & 23 Aug.
Log run 23 Aug menunjukkan SEMUA scraper bermasalah sekaligus:
1. **IG V28 free (i.instagram.com) mati**: semua akun "+0 new" tiap hari
   sejak pertengahan Juli → endpoint diblokir/deprecated. Ini penyebab
   staleness IG.
2. **TikWM search gagal**: "TikWM returned non-JSON: ![Image 1..." → Jina
   reader membungkus respons TikWM jadi markdown (kena anti-bot).
3. **Urlebird TT gagal**: "[ardian.tanah] FAILED: 0 videos found",
   "[majangmejeng_] no profile pic URL in embed HTML" (4/4 akun) →
   Urlebird berubah struktur / memblokir.
4. **Health gate V34.12 bekerja dengan benar**: "zero fresh posts" +
   pre-flight gagal karena "11 cross-account duplicates (> toleransi 5)"
   → deploy DIBATALKAN. Artinya dashboard live masih aman (data lama),
   tapi tidak pernah update lagi.
5. **Scraper komentar**: TT OK (132 komentar di-fetch, tapi 0 admin match);
   IG = 0/0 posts (tidak ada post baru untuk diproses).

### A4. WORKER SECURITY ✅ FAZA 1 SHIPPED
Endpoint: https://titan-llm-proxy.nickasad10007.workers.dev
- /chat tanpa key → **401** ✓; key salah → 401 ✓
- CORS allow-origin = https://tltanpro.github.io saja (bukan *) ✓
- /status juga terproteksi key (catatan: plan asli minta /status publik
  untuk Settings page — sekarang frontend harus kirim key, atau buat
  /status ringan tanpa key)

### A5. DEPLOY WORKER VIA ACTIONS ❌
worker-deploy.yml: FAILURE kedua run terakhir — wrangler
"Authentication failed (status 400) [code 9106]" → CLOUDFLARE_API_TOKEN
di GH secret tidak valid/expired untuk workers.dev account
nickasad10007. Worker yang live masih versi lama yang sudah benar
(karena dideploy manual sebelumnya), tapi CI worker deploy rusak.

### A6. AVATAR ⚠️ PARAH BURUK
- IG avatars (assets/avatars/ig-*.png) sudah diganti 23 Aug 22:26,
  ukuran wajar (1.4–3.1 KB) → kemungkinan sudah fix dari 4168px monster.
  PERLU verifikasi visual user (acceptance criteria V34 belum dicentang).
- TT avatars masih jpeg 20–88 KB dari scrape lama (belum tervalidasi).
- Scrape avatar harian GAGAL semua ("no profile pic URL in embed HTML").

### A7. HYGIENE REPO ❌
File temp/duplikat MASIH tracked di git (plan V34 Faza 0.3 tidak dieksekusi):
tmp-acc.json, accounts-live.json, live-main.js, live-afull.js, logs.zip
(±25 MB working tree). Repo dir 334 MB (node_modules lokal, pack only 12MB).

### A8. TESTS ⚠️
Hanya 2 test suite scraper (scrape-avatars-ig.test.mjs,
scrape-tt-urlebird.test.mjs). Target >=80% lib coverage JAUH dari tercapai.
Tidak ada smoke test E2E pipeline yang menggagalkan PR.

### A9. ADMIN COMMENTS ⚠️
Masih 12 entri (manual). Scraper TT jalan (132 komentar) tapi 0 admin
match → kemungkinan marker rules/username admin salah format. Scraper IG
tidak punya bahan (0 post baru).

## KESIMPULAN
Faza 0 (pipeline) = GAGAL di lapangan meski kode sudah ditulis:
ketiga sumber scraping gratis (i.instagram.com, TikWM-via-Jina, Urlebird)
mati/blokir dalam rentang yang sama. Faza 1 (worker security) = SHIPPED ✓.
Faza 2 (UI) = SHIPPED ✓ (perlu verifikasi visual). Faza 3–4 = belum.
Prioritas mutlak: ganti strategi scraping IG+TT dengan sumber yang masih
hidup, sebelum apa pun lagi.

---

## BAGIAN B — PLAN PERBAIKAN V35 (≤5 sub-task per faza, tiap sub-task tested)

### FAZA A — RESCUE SCRAPING (prioritas #1, est. 1 sesi)
A.1 Diagnosa cepat sumber kandidat (skrip probe satu-run, output tabel):
    - IG: (a) i.instagram.com status aktual; (b) Instagram web profile
      via Jina; (c) r.jina.ai + instagram.com/<user>/ (parse og:description
      follower/posts); (d) ytdlp untuk IG (sudah ada enrich-ig-ytdlp.mjs);
      (e) picuki/imginn mirror. Pilih 2 sumber hidup.
    - TT: (a) TikWM /api/user/posts LANGSUNG tanpa Jina (kemarin yang
      gagal TikWM-via-Jina, bukan TikWM murni — test direct dulu!);
      (b) tikwm.com/api/feed/search; (c) urlebird struktur baru;
      (d) tiklydown/others gratis.
    Acceptance: tabel "sumber → akun → jumlah post fresh" nyata, pilih
    primary + fallback per platform. TANPA asumsi — semua diprobe.
A.2 Tulis ulang scrape-ig.mjs pakai 2 sumber hidup hasil A.1
    (primary → fallback otomatis), merge dedup ke accounts-full.json.
A.3 Perbaiki TT chain: TikWM direct (tanpa Jina) sebagai primary;
    Jina hanya fallback terakhir. Fix parse "non-JSON markdown".
A.4 Fix cross-account duplicate detection: 11 dup saat ini > toleransi 5
    dan MENGABURKAN pre-flight. Investigasi: dup ID antar akun mana,
    tambah dedup pass di merge, reset counter setelah bersih.
A.5 Jalankan full pipeline lokal (daily-update-local.sh), verify:
    - IG latest <= 48 jam utk 4 akun, TT <= 48 jam utk 5 akun
    - 0 cross-dup
    - commit + push + curl live confirm data baru tampil

### FAZA B — COMMENT PIPELINE + AVATAR (est. ½ sesi)
B.1 Debug 0 admin match di scrape-comments-tt: cek _markerRules vs
    username admin asli (Reni/Rifqi/Reta/Julian), test dengan komentar
    sample yang diketahui. Target: >=1 admin comment auto-detected.
B.2 Wire scrape-comments-ig ke post IG fresh (setelah Faza A berhasil).
B.3 Verifikasi VISUAL 4 avatar IG baru oleh user (tampilkan file).
    Re-scrape avatar TT dengan validasi (ukuran<=512px, hash unik).
B.4 Hapus file temp dari git: tmp-acc.json, accounts-live.json,
    live-main.js, live-afull.js, logs.zip + .gitignore.

### FAZA C — INFRA FIXES (paralel dengan B, beda domain)
C.1 Fix CLOUDFLARE_API_TOKEN di GH secret (regenerate token untuk
    account nickasad10007, scope Workers Scripts:Edit) → re-run
    worker-deploy.yml sampai hijau.
C.2 /status endpoint: buat varian read-only ringan TANPA key (hanya
    uptime + last-scrape age, tanpa detail kuota) supaya Settings page
    bisa menampilkan health tanpa membocorkan key ke client bundle.
    Endpoint chat tetap terproteksi.
C.3 Rate limit chat endpoint (60 req/jam/IP via cache API) — dari plan
    V34 1.2, belum terkonfirmasi shipped. Test: 61st request → 429.

### FAZA D — QUALITY GATE (est. ½ sesi)
D.1 Unit test lib kritikal (adminHashtags, normalize, merge/dedup,
    duplicate detector) — target lib coverage >= 80%, angka nyata dari
    vitest --coverage.
D.2 Smoke test pipeline jadi step wajib workflow: assert >=1 post fresh
    per platform sebelum boleh deploy (sudah ada health gate — tambahkan
    assertion per-platform, bukan cuma global).
D.3 Update CLAUDE.md: hapus angka hardcoded, arahkan ke script check;
    update versi ke V35.

### FAZA E — VERIFY & HANDOVER
E.1 curl live: bundle hash match repo, data fresh terlihat di JSON live.
E.2 Tag git v34-final sebelum perubahan besar (rollback point).
E.3 Update memory pointers + catat pelajaran:
    "Jina membungkus API JSON menjadi markdown = false negative;
    selalu test API direct sebelum via-Jina."

## URUTAN
A (rescue scraping) → B+C paralel → D → E. Estimasi total: 2–3 sesi.

## ACCEPTANCE CRITERIA V35 (terukur)
1. IG 4/4 akun latest <= 48 jam; TT 5/5 akun latest <= 48 jam (data live)
2. daily-update.yml hijau 2 run berturut-turut
3. 0 cross-account duplicate di accounts-full.json
4. >=1 admin comment terdeteksi otomatis (bukan manual JSON)
5. Avatar 9/9 tervalidasi + disetujui visual oleh user
6. worker-deploy.yml hijau; /chat 401 tanpa key; /status ringan publik
7. Repo bersih file temp; lib coverage >= 80% (angka dari vitest)
