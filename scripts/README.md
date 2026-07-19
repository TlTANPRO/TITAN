# TITAN Scripts

> V20 (19 Jul 2026). Purely free methods. **NO ENSEMBLEDATA** (tokens habis).

## Pipeline (1 command)

```bash
pnpm run deploy
```

Lihat detail di `scripts/deploy.mjs` header. Singkatnya:
1. `node scripts/generate-data.mjs` — scraped → src/data/
2. Pre-flight: 9 akun + ≥ 4.000 post + 0 cross-dup — **FAIL FAST** kalau ada anomali
3. `pnpm run build` — Vite embed + prebuild copy
4. Copy `dist/*` → root (replace `accounts-full.json`, `assets/`)
5. Cleanup backup files di `scraped/`
6. `git add -A` + commit + push → GitHub Pages

Atau step-by-step manual:

```bash
# 1. Scrape / enrich (optional — kalau ada post baru)
node scripts/scrape-ig-free.mjs           # atau scrape-incremental.mjs
node scripts/scrape-tt-free.mjs
node scripts/enrich-ig-android-feed.mjs   # IG free enrichment
node scripts/enrich-tt-tikwm.mjs          # TT free enrichment

# 2. Validate
node scripts/validate-merge.mjs           # dedup + sanity

# 3. Generate + deploy
node scripts/generate-data.mjs            # aggregate
pnpm run deploy                           # or: pnpm run deploy:dry (no push)
```

## Scripts

### Pipeline (wajib)

| File | Purpose |
|------|---------|
| `deploy.mjs` | **ONE command deploy** — generate + build + push |
| `validate-merge.mjs` | Dedup + sanity check scraped/*.json |
| `generate-data.mjs` | scraped → src/data/accounts-full.json |

### Scrapers (manual)

| File | Method | Use when |
|------|--------|----------|
| `scrape-ig-free.mjs` | i.instagram.com `/clips/user/` (REELS) | Full IG scrape, free method |
| `scrape-tt-free.mjs` | TikWM `/api/videoByUrl/` | Full TT scrape, free method |
| `scrape-incremental.mjs` | Incremental (since lastTimestamp) | Future cron / daily update |

### Enrichers (manual, per-field)

| File | Field | Best for |
|------|-------|----------|
| `enrich-ig-android-feed.mjs` | IG like/view/comment | Best free IG |
| `enrich-ig-ytdlp.mjs` | IG VIDEO/REEL only | Fallback IG |
| `enrich-tt-tikwm.mjs` | TT like/view/comment/save | Best free TT (100% coverage) |
| `enrich-tt-jina.mjs` | TikWM via Jina proxy | Backup if direct rate-limited |
| `enrich-ig-android-info.mjs` | ❌ 403 login_required | Skip |
| `enrich-ig-postdetails.mjs` | ENSEMBLEDATA (deprecated) | Skip |
| `enrich-fallback.mjs` | Profile-level only | Skip |

### Audit

| File | Purpose |
|------|---------|
| `coverage-report.mjs` | Per-akun × field coverage matrix |
| `audit-multi-account.mjs` | Cross-account validation (duplicate, schema) |
| `audit-integration.mjs` | Integration audit (pipeline + deploy) |

### Other

| File | Purpose |
|------|---------|
| `accounts.mjs` | 9 akun definition (ACCOUNTS_IG + ACCOUNTS_TT) |
| `copy-data-to-public.mjs` | src/data/ → public/data/ (auto via prebuild) |
| `scrape-avatars.mjs` | Download real profile photos via facebookexternalhit UA |
| `generate-ai-insights.mjs` | LLM insight generator (manual, optional) |
| `validate-tokens.mjs` | Token validation (legacy, ENSEMBLEDATA era) |
| `lib/tokenPool.mjs` | Token pool (legacy, kept for reference) |
| `prompts/*.md` | LLM prompt templates for AI insights |

## Recovery

### Kalau deploy 0 post / data corrupt

```bash
# Lihat history
git log --oneline | head -20

# Restore dari commit valid
git checkout <commit> -- accounts-full.json assets/
git commit -m "revert: restore from <commit>"
git push origin main
```

### Kalau scraped/ corrupted

```bash
git log --oneline scripts/scraped/ | head -10
git checkout <commit> -- scripts/scraped/
pnpm run deploy
```

## DEPRECATED / SKIP

❌ `scrape-ig.mjs` + `scrape-tt.mjs` — pakai ENSEMBLEDATA (tokens habis)
❌ `enrich-ig-android-info.mjs` — 403 login_required
❌ `enrich-ig-postdetails.mjs` — pakai ENSEMBLEDATA
❌ `enrich-fallback.mjs` — terlalu kecil (12 sample)
❌ `validate-tokens.mjs` — token pool sudah tidak relevan

## Aturan Main

- **Append-only**: enricher pakai MAX-merge (`if (newVal > existingVal) existing.field = newVal`)
- **Atomic write**: `tmp = filepath + '.tmp'; fs.writeFile(tmp, ...); fs.rename(tmp, filepath)`
- **9 akun**: edit `scripts/accounts.mjs` (ACCOUNTS_IG + ACCOUNTS_TT)
- **Schema**: lihat `DATA-SSOT.md` §4

Lihat `DATA-SSOT.md` untuk definisi lengkap SSOT + schema + method coverage.
