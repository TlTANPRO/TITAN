# TITAN Scrape Pipeline

V11 incremental + manual scrape scripts.

## Scripts Overview

| Script | Purpose | Token Cost | Use When |
|--------|---------|------------|----------|
| `scrape-ig.mjs` | Full IG scrape (all posts) | ~700 /media-info calls/akun | Initial setup, recovery |
| `scrape-tt.mjs` | Full TT scrape (all posts) | ~200 calls/akun | Initial setup, recovery |
| `scrape-incremental.mjs` | **Incremental — only new posts** | **~5 calls/akun** | **Daily cron (default)** |
| `validate-merge.mjs` | Dedup + sanity check | 0 | After every scrape |
| `generate-data.mjs` | Regenerate accounts-full.json | 0 | After validate-merge |
| `enrich-*.mjs` | Free enrichers (yt-dlp, Jina) | 0 (uses free providers) | Catch up missing data |

## Incremental vs Full

**Incremental (default for cron)**:
- Reads `scraped/{slug}.json`
- Takes `posts[0].timestamp` as `sinceTimestamp`
- Calls `/user/posts?depth=20` (covers ~7 days for active accounts)
- Filters posts with `timestamp > sinceTimestamp - 1 day` (safety buffer)
- Merges with existing posts, dedupes by `id`, sorts desc
- Atomic write back to `scraped/{slug}.json`

**Full** (initial + recovery):
- `node scrape-ig.mjs --force` (re-scrape even if file exists)
- `node scrape-tt.mjs only=ig-majangmejeng_` (one account)

## CLI Flags

### `scrape-incremental.mjs`
```bash
node scrape-incremental.mjs                 # all platforms, 7-day window
node scrape-incremental.mjs --platform=ig   # IG only
node scrape-incremental.mjs --platform=tt   # TT only
node scrape-incremental.mjs --days=14       # 14-day window
node scrape-incremental.mjs --no-enrich    # skip /media/info enrichment
node scrape-incremental.mjs --prune        # remove posts older than window
```

### `scrape-ig.mjs`
```bash
node scrape-ig.mjs                  # skip if file exists
node scrape-ig.mjs --force          # re-scrape all
node scrape-ig.mjs only=ig-majangmejeng_  # one account
node scrape-ig.mjs --no-enrich     # skip enrichment
```

## Cron Schedule

`.github/workflows/incremental.yml`:
- Runs daily at **23:00 WIB** (16:00 UTC)
- Triggers: `scrape-incremental.mjs` → `validate-merge.mjs` → `generate-data.mjs` → commit if changed
- If no changes, exits 0 (saves CI minutes)

`cloudflare-worker/wrangler.toml [triggers]`:
- Backup cron at same time
- Only fires `dispatchWorkflow()` if `env.GH_PAT` is set
- Polls GH Actions run status, returns to `/refresh-status`

## Required Secrets

### GitHub Actions (`.github/workflows/incremental.yml`)
Set in repo Settings → Secrets → Actions:
- `GH_PAT` — PAT with `workflow` scope (for git push back)
- `TITAN_ENSEMBLEDATA_TOKEN` — for IG/TT scraper
- `TITAN_JINA_API_KEY` — for free enrichment (optional)

### Cloudflare Worker (`wrangler.toml`)
Set via `wrangler secret put`:
- `GH_PAT` — same PAT, for `/hard-refresh` endpoint
- `OPENROUTER_API_KEY` — LLM proxy
- `GOOGLE_KEYS` — Google AI keys (JSON array string)
- `HARD_REFRESH_PASSWORD` — shared with frontend `VITE_HARD_REFRESH_PASSWORD`

## Token Usage Math

**Full-scrape (old)**:
- 4 IG × ~700 posts × 1 /media-info call = **~2,800 calls/day**
- 5 TT × ~200 posts × 0.5 /user/posts call = **~1,000 calls/day**
- **Total: ~3,800 calls/day**
- Daily quota (ENSEMBLEDATA): 5,000 → **76% used**

**Incremental (new)**:
- 4 IG × ~5 new posts/day × 1 /media-info call = **~20 calls/day**
- 5 TT × ~2 new posts/day × 0.5 /user/posts call = **~5 calls/day**
- **Total: ~25 calls/day**
- Daily quota: **0.5% used**

**Savings: 99.3% on token consumption**

## Initial Setup (one-time)

```bash
# 1. Full-scrape all accounts (initial dataset)
node scrape-ig.mjs --force
node scrape-tt.mjs --force

# 2. Validate + merge
node validate-merge.mjs

# 3. Generate dashboard data
node generate-data.mjs

# 4. Commit
git add public/data/ scripts/scraped/
git commit -m "chore(data): initial full-scrape"
git push

# 5. After this, daily cron handles updates automatically
```

## Failure Recovery

If a scrape fails partway:
- `scraped/{slug}.json` still has previous data (atomic write)
- Next cron run will retry from the latest good `posts[0].timestamp`
- No data loss

If `accounts-full.json` gets corrupted:
- Run `node generate-data.mjs` to rebuild from `scraped/*.json`
- Commit + push
