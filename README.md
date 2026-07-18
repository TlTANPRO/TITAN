# TITAN — Social Media Marketing Intelligence

A static React + Vite dashboard that surfaces 22 marketing analytics across 9 Instagram & TikTok accounts. Includes a zero-template AI chat (Claude 3 / Gemini 2.0 Flash) with 3-layer persistent memory and free web access. Deployed to GitHub Pages (or Cloudflare Workers); API keys held server-side by a Cloudflare Worker — no manual user input.

**Live**: [tltanpro.github.io/TITAN](https://tltanpro.github.io/TITAN/) (GitHub Pages).

---

## What's inside

- **9 akun** (4 Instagram + 5 TikTok) di bawah PT Syahfalah Griya Aquila, Lumajang
- **3,409+ post real** — no dummy data, di-scrape via ENSEMBLEDATA API
- **22 analytics**: top views/likes/comments, performance tiers, hashtag co-occurrence, hook classification, outlier detection, growth velocity, international benchmark, content pillars, cross-account comparison, dll
- **Dashboard profesional bahasa Indonesia** dengan **15 section** per akun (Profil, Top 5 Post 3-axis, Distribusi Tingkatan, Tema & Kolaborasi, Performa Harian/Bulanan, Analisis Durasi, Ringkasan Tahunan, Insight & Rekomendasi, Benchmark Industri, Potensi Pertumbuhan, Grafik Pertumbuhan, dll)
- **AI chat** dengan tiga memory layer (chat history, user profile, per-account context) dan live web access via `allorigins.win`
- **PWA**: installable, works offline (shell)
- **Dual-mode LLM**: auto via Cloudflare Worker (recommended) atau direct (manual)

---

## Quick start

### Prasyarat
- Node.js 18+
- pnpm (`npm i -g pnpm`)
- ENSEMBLEDATA API tokens (untuk scraper saja — tidak dibutuhkan untuk menjalankan app)

### Jalankan app (tidak butuh data untuk UI load)
```bash
pnpm install
pnpm dev               # http://localhost:5173/TITAN/
```
`src/data/accounts-full.json` sudah di-generate dan di-bundle ke dalam build. Bila hilang, jalankan pipeline di bawah.

### Refresh data (re-scrape semua 9 akun)

```bash
# 1. Pastikan .env berisi ENSEMBLEDATA_TOKENS=... (sudah terisi)
# 2. Jalankan pipeline lengkap:
pnpm pipeline
# Setara dengan: scrape IG → scrape TT → validate → generate

# Atau step by step:
pnpm scrape:ig         # 4 IG accounts (skip akun yang sudah ada)
pnpm scrape:tt         # 5 TT accounts (skip akun yang sudah ada)
pnpm validate          # dedupe + sanity check
pnpm generate          # aggregate ke src/data/accounts-full.json
```

Both scrapers skip akun yang sudah punya `scripts/scraped/{slug}.json` non-empty — jadi `pnpm scrape:ig` aman di-re-run kapan saja.

### Force re-scrape (abaikan existing files)

```bash
pnpm scrape:ig:enrich  # re-scrape 4 IG + /media/info enrichment (~1.520 call, butuh ~9% daily quota)
node scripts/scrape-tt.mjs --force  # re-scrape 5 TT (cursor-loop sampai 100% complete)
```

### Scrape hanya satu akun

```bash
node scripts/scrape-ig.mjs only=ig-majangmejeng_
node scripts/scrape-tt.mjs only=tt-itsnisyananda
```

### Pakai subset token yang masih aktif

ENSEMBLEDATA punya token yang kehabisan quota tengah hari (reset UTC 00:00 = 07:00 WIB). Jika Anda hanya punya beberapa token yang masih fresh, restrict pool:

```bash
ENSEMBLEDATA_TOKENS_FILTER=GXQv,rntd,nfj8 node scripts/scrape-tt.mjs
```

Jika sebuah token kena daily quota (HTTP 495), scraper otomatis rotate ke token berikutnya. Jika semua 26 habis, scraper berhenti dengan error yang jelas.

---

## Scraper details — verified quirks

Perilaku ENSEMBLEDATA API yang sudah di-handle oleh scraper:

| Aspek | Status | Catatan |
|------|--------|---------|
| IG `/user/posts` `likeCount` | ✅ Auto-fix | Di-enrich via `/media/info?code=SHORTCODE` per post (~1.520 call) |
| IG `/user/posts` `commentCount` | ✅ Auto-fix | Di-enrich via `/media/info` |
| IG `/user/posts` `viewCount` | ✅ Auto-fix | Di-enrich via `/media/info` |
| IG `/user/detailed-info` 422 | ✅ Handled | `/user/info` di-fetch dulu; detailed-info best-effort fallback |
| TT `mediaType` undefined | ✅ Auto-fix | Set `VIDEO` jika `duration > 0`, else `IMAGE` |
| TT cursor pagination | ✅ Auto-fix | Loop sampai `nextCursor` habis (max 20 pages safety cap) |
| TT `playCount` field | ✅ Auto-fix | Normalizer map `playCount` → `viewCount` di runtime |
| TT `video.duration` ms | ✅ Auto-fix | Divide by 1000 untuk `durationSeconds` |

**Pipeline normal:** `pnpm scrape:ig:enrich` (IG) + `pnpm scrape:tt` (TT, dengan cursor-loop) — tidak perlu `--force` flag tambahan. Quota impact aman (~9% daily untuk IG enrichment).

---

## Data quality audit (verified 14 Jul 2026)

Live bundle `dist/assets/accounts-full-{hash}.js` (4.85 MB) di GitHub Pages **sudah match** dengan `src/data/accounts-full.json` — no drift.

### Field coverage target (setelah re-scrape dengan enrichment)

| Field | Target | Note |
|-------|--------|------|
| `id`, `timestamp`, `caption`, `hashtags`, `mentions` | 100% | ✓ semua 9 akun |
| `likeCount` | 100% (TT) / ~100% (IG setelah /media/info) | Enrichment per post |
| `commentCount` | 100% (TT) / ~100% (IG setelah /media/info) | Enrichment per post |
| `viewCount` | 100% (TT) / ~95% (IG) | TT `playCount` mapped ke `viewCount` |
| `saveCount` | ~50% | Optional field, mostly TT |
| `mediaType` | 100% | TT auto-detect; IG dari `product_type`/`media_type` |
| `followerCount` | 9/9 | Dari `/user/info` (fallback jika detailed 422) |
| `followingCount` | 9/9 | `/user/info` untuk TT; IG biasanya 0 |
| `durationSeconds` | 100% TT | Divide by 1000 dari `video.duration` ms |

### IG accounts tanpa enrichment (data lama)

Jika scraper dijalankan tanpa `pnpm scrape:ig:enrich` (yaitu `pnpm scrape:ig` biasa), IG posts tidak akan punya `likeCount`/`commentCount`/`viewCount`. Dashboard otomatis menampilkan badge "⚠️ Data Terbatas" untuk akun ini — bukan bug, ini transparansi data.

---

## Build & deploy

```bash
pnpm build             # outputs ke dist/
cd dist
git add -A
git commit -m "deploy: ..."
git push -u origin main --force
```

Cloudflare / GitHub Pages auto-redeploy dari branch `main`.

**Setelah deploy, hard-refresh browser** (Ctrl+Shift+R) atau clear service worker cache (DevTools → Application → Service Workers → Unregister) — data bundle di-cache agresif, stale data akan muncul jika tidak.

### Konfigurasi LLM proxy (full-auto mode)

Tanpa ini, app butuh user masukkan API key di Settings modal. Dengan ini, app 100% otomatis.

Lihat [`cloudflare-worker/README.md`](./cloudflare-worker/README.md) untuk panduan deploy 5 menit. Lalu set di `.env`:
```env
VITE_LLM_PROXY_URL=https://titan-llm-proxy.YOUR-SUBDOMAIN.workers.dev
```

---

## Project structure

```
titan-app/
├── src/
│   ├── components/          # UI: AccountCard, ChatPanel, Heatmap, OutlierCard, ProfileHeader, StatCard
│   ├── routes/              # Home, AccountPage, NotFound
│   ├── lib/
│   │   ├── analytics.js     # 22 analytics + dataAvailability helper + STOPWORDS
│   │   ├── llm.js           # OpenRouter + Google AI Studio client
│   │   ├── normalize.js     # IG/TT post schema adapter
│   │   ├── imageProxy.js    # weserv.nl image proxy
│   │   ├── format.js        # formatNumber, formatPercent, formatCompact
│   │   ├── webAccess.js     # URL fetch via allorigins.win
│   │   └── memory/          # 3-layer AI memory
│   ├── hooks/               # useLlmChat, useAccount
│   ├── data/                # accounts-full.json (gitignored, generated)
│   ├── styles/              # tokens.css, animations.css
│   ├── App.jsx
│   └── main.jsx
├── scripts/
│   ├── accounts.mjs         # 9 target accounts
│   ├── scrape-ig.mjs        # ENSEMBLEDATA IG + /media/info enrichment (FULL_SCRAPE_DEPTH=50)
│   ├── scrape-tt.mjs        # ENSEMBLEDATA TT + cursor-loop (FULL_SCRAPE_DEPTH=50, MAX_PAGES=20)
│   ├── validate-merge.mjs   # dedupe + sanity check
│   ├── generate-data.mjs    # aggregate → src/data/accounts-full.json
│   ├── lib/
│   │   └── tokenPool.mjs    # ENSEMBLEDATA token rotation (round-robin, 495 retry)
│   └── scraped/             # (gitignored) raw JSON per account
├── cloudflare-worker/
│   ├── src/index.js         # LLM proxy Worker code
│   ├── wrangler.toml        # (optional) untuk CLI deploy
│   └── README.md            # 5-min deploy guide
├── public/                  # favicon.svg, user-profile.json, manifest
├── dist/                    # (gitignored) build output
├── .env                     # (gitignored) tokens + proxy URL
├── .env.example             # template
├── vite.config.js           # base: /TITAN/, PWA, manual chunks
└── package.json
```

---

## Stack

- **Vite 5** + **React 18** + **TypeScript** + **Tailwind 3**
- **React Router 6** (`/TITAN/` basename)
- **Recharts** untuk charts, **lucide-react** untuk icons
- **vite-plugin-pwa** untuk installable PWA + service worker
- **ENSEMBLEDATA API** untuk Instagram & TikTok scraping
- **OpenRouter** (Claude 3 Haiku) primary + **Google AI Studio** (Gemini 2.0 Flash) fallback
- **allorigins.win** untuk free CORS-proxy web access
- **images.weserv.nl** untuk cross-origin-safe IG/FB avatar loading

---

## Data scope (last refreshed 2026-07-13)

| Platform | Akun | Post | Followers | Notes |
|----------|------|------|-----------|-------|
| IG | @majangmejeng_ | 313 | — | likeCount via /media/info enrichment |
| IG | @syahfalahproperti | 500 | — | likeCount via /media/info enrichment |
| IG | @nisyanandaa | 214 | — | likeCount via /media/info enrichment |
| IG | @ardiantanah | 500 | — | likeCount via /media/info enrichment |
| TT | @majangmejeng_ | 492 | 17,753 | full metrics, cursor-loop 100% |
| TT | @syahfalahproperti | 407 | 1,143 | full metrics |
| TT | @ardian.tanah | 353 | 9,911 | full metrics |
| TT | @ardiantanahmenjawab | 467 | 5,306 | full metrics |
| TT | @itsnisyananda | 163 | 32,473 | full metrics |

**Note:** Semua IG accounts butuh re-scrape dengan `pnpm scrape:ig:enrich` agar `likeCount`/`commentCount`/`viewCount` terisi. Sebelum re-scrape, badge "Data Terbatas" akan tampil di UI.

---

## Deployment

TITAN adalah pure static SPA. Dua host equivalent, keduanya work dengan output `dist/` yang sama:

1. **Cloudflare Workers** (recommended, edge CDN lebih cepat):
   - Cloudflare Dashboard → Workers & Pages → Create → "Continue with GitHub"
   - Connect ke `TlTANPRO/TITAN`, build command: `pnpm build`, output: `dist`
   - URL: `titan.YOUR-SUBDOMAIN.workers.dev`

2. **GitHub Pages**:
   - Push `dist/` ke branch `main`
   - Settings → Pages → Branch: `main` / root
   - URL: `https://YOUR-ORG.github.io/TITAN/`

Both butuh `vite.config.js` `base: '/TITAN/'` (UPPERCASE) untuk match nama repo GitHub `TlTANPRO/TITAN`.

---

## Commands

| Command | Apa yang dilakukan |
|---------|-------------------|
| `pnpm dev` | Start dev server (HMR) di http://localhost:5173/TITAN/ |
| `pnpm build` | Production build ke `dist/` |
| `pnpm preview` | Serve `dist/` lokal untuk verify production build |
| `pnpm scrape:ig` | Scrape 4 Instagram accounts (skip yang sudah ada) |
| `pnpm scrape:ig:enrich` | Re-scrape 4 IG + /media/info enrichment per post |
| `pnpm scrape:tt` | Scrape 5 TikTok accounts (skip yang sudah ada) |
| `pnpm scrape:tt:force` | Force re-scrape 5 TikTok (cursor-loop 100%) |
| `pnpm scrape:full` | Scrape semua 9 akun |
| `pnpm validate` | Dedupe + sanity check scraped JSON |
| `pnpm generate` | Aggregate → `src/data/accounts-full.json` |
| `pnpm pipeline` | scrape:full → validate → generate (one-shot) |
| `pnpm test` | Run vitest unit tests |

---

## Dashboard 15-section overview

Setiap akun memiliki 15 section di halaman detail (bahasa Indonesia):

1. **Profil** — Avatar, biodata, 6 stat pill (Total Video, Total Tayangan, Total Suka, Total Komentar, Rata-rata Tayangan, Engagement Rate)
2. **5 Post Teratas — Tayangan** — List caption + view count
3. **5 Post Teratas — Suka** — List caption + like count (atau "Tidak tersedia" untuk IG tanpa enrichment)
4. **5 Post Teratas — Komentar** — List caption + comment count
5. **Distribusi Tingkatan Performa** — 5-tier (Sangat Viral / Performa Tinggi / Bagus / Rata-rata / Rendah) + deskripsi
6. **Tema Konten — 10 Hashtag Terbanyak** — Chip list top 10
7. **Kolaborasi — 10 Mention Terbanyak** — Chip list top 10
8. **Performa per Hari** — Bar chart 7 hari (Minggu–Sabtu) rata-rata likes
9. **Performa Bulanan** — Line chart ER per bulan
10. **Analisis Durasi Video** — Tabel bucket durasi (Foto / <15s / 15-30s / 30-60s / >60s)
11. **Ringkasan Tahunan** — Tabel per tahun (post, total likes, total comments, ER)
12. **Insight & Rekomendasi** — 3-column grid (Kekuatan hijau / Kelemahan merah / Rekomendasi biru)
13. **Benchmark Industri** — Perbandingan ER vs Rival IQ median & vertical property/lifestyle
14. **Potensi Pertumbuhan** — Skor 0-100 + label (Tinggi/Sedang/Rendah) + reasoning
15. **Grafik Modern — Pertumbuhan Akun** — Dual-line area chart (jumlah post + total likes per bulan)

Plus section bonus: Outlier Posts (Sangat Viral z≥5, Konten Viral z≥3, Performa Unggul z≥2), Konsistensi Posting, Komposisi Format Konten, Klasifikasi Hook Caption, Pilar Konten (TF-IDF), Pasangan Hashtag, dan Growth Velocity.

---

## License & ownership

Internal project — PT Syahfalah Griya Aquila, Lumajang. Not for redistribution.
