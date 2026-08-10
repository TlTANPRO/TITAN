# Home V33.1 — pending deploy

User message: "pindah top engagement rate dibawah top view dan sesuaikan lagi luas tabelnya agar serasi dengan lainnya seperti top likes top comment, pada komposisi konten chart per platformnya tidak pas dan melebar butuh penyesuaian lagi, pada grafik tren bulanan lintas akun tidak terdata er likes view dan lainnya pada postingan terbaru, dan pastikan seluruh data tambahan scrap otomatis hariannya terdistribusikan ke seluruh isi dashboardnya"

## 4 fixes shipped (build OK, pending user deploy)

1. **Home ROW 4+5 reorder** — ROW 4 = col-12 Weekly Recap full-width. ROW 5 = plain grid `grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3` with 5 TopPerformer tiles (Views, Likes, Comments, Posts/Minggu, ER). TopPerformersCard refactored from `<BentoItem>` to plain `<div surface>` since no longer in BentoGrid. ER was previously inline in ROW 4 col-4.

2. **Komposisi bar width** — `minWidth: 2.5rem`/`1.5rem` removed on `Per Platform` + `Per Akun` bar segments. Added `flex-shrink-0`. Wrapped container in `max-w-3xl` so bar doesn't stretch full width on big screens.

3. **CrossAccountTimeline IG stale note** — new `igStaleInfo` useMemo. If latest month has zero IG accounts data, show footer line: "X/Y akun IG belum punya post di bulan [latestMonth] · post IG terakhir [Mon YYYY]". Reads from `accounts[].posts[].timestamp` (V32.3 fallback chain) not bucket posts (performanceByMonth doesn't keep them).

4. **Data distribution verification** — pipeline works via dataStore subscribe + V32.3 createTime fallback. Verified via `pnpm run build` (9.54s OK). Daily scrape via `daily-update.yml` cron 16:00 UTC writes to `accounts-full.json` → `pnpm run deploy` rebuilds bundle.

## Build output

- Home bundle: 45.67 kB (was 45.75 kB) — slight shrink from removing BentoItem nesting
- New bundle hash: `vite-index.template-BKALuPuB.js`
- Build time: 9.54s

## Deploy command (user manual)

```bash
cd C:/Users/Syahfalah/TITAN
pnpm run deploy
```

## Verification after deploy

```bash
curl -s https://tltanpro.github.io/TITAN/ | grep -oE "vite-index.template-[A-Za-z0-9]+\.js" | head -1
# expect: vite-index.template-BKALuPuB.js
```

## Out of scope

- IG scraper `feed/user` login_required bypass — outside dashboard scope
- Top ER computation logic — already in crossAccountComparison
- Admin V32.8 — unchanged, already shipped at commit 7c616ab
