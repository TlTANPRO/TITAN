# TITAN V31: Free-Provider Hybrid Scrape Pipeline — Design

**Date:** 2026-07-21
**Author:** Claude (brainstorming session with @syahfalah)
**Status:** Draft — pending user review

## Goal

Full re-scrape 9 akun (4 IG + 5 TT) untuk TITAN dashboard pakai **free providers saja** (no ENSEMBLEDATA), update file lokal, deploy manual setelah review.

## Background

- TITAN saat ini punya **3,705 posts** di live = local (verified 21 Jul 2026, no diff)
- ENSEMBLEDATA kill switch aktif (1/26 token valid), per V30.4 user directive "tanpa ensembledata"
- 25-provider test 21 Jul: **8 works** (P2, P4, P5, P6, P11, P18, P19, P19-per-post), **17 fails** (P3, P7 rate-limited, P12, P14, P15, P16, P17, P20, P21, P22, P23, P24, P25)
- IG: 100% save=0, 100% share=0 (semua 1779 IG posts, ENSEMBLEDATA-only)
- IG: 324 posts like=0, 357 view=0
- TT: 1004 comment=0, 921 save=0, 845 share=0
- Detail di [[titan-scrap-provider-cascade]]

## Scope (in)

- 4 IG accounts: majangmejeng_, syahfalahproperti, nisyanandaa, ardiantanah
- 5 TT accounts: majangmejeng_, syahfalahproperti, ardian.tanah, ardiantanahmenjawab, itsnisyananda
- Free providers: P4 (IG reels), P7 (IG image best-effort), P2-via-Jina (TT per-post), P19 (Jina TT profile)
- 4-pass pipeline (Pass 1a, 1b, 2a, 2b)
- Local file write only, manual `pnpm run deploy` after review

## Scope (out)

- ENSEMBLEDATA activation (kill switch tetap)
- IG save_count / share_count field (no free source)
- TT full user video list (no free method exists)
- Auto-deploy / GitHub Actions trigger
- Daily cron (V30.2 killed `incremental.yml`; not re-enabling)
- E2E GitHub Actions testing (per CLAUDE.md out-of-scope)
- Per-account post-floor check (out-of-scope per CLAUDE.md)

## Architecture

```
TITAN/scripts/
├── scrape-ig-free.mjs          (V28, EXISTING — Pass 1a)
├── scrape-tt-free.mjs          (V28, EXISTING — Pass 1b)
├── enrich-ig-ytdlp.mjs         (V28, EXISTING — Pass 2a)
├── enrich-tt-tikwm.mjs         (V28, EXISTING — Pass 2b)
├── scrape-hybrid-orchestrator.mjs  (NEW — run all 4 in sequence)
├── test-providers.mjs          (NEW — Layer 1 provider smoke test)
├── pre-flight-deploy.mjs       (NEW — pre-deploy validation)
└── daily-update-local.sh       (UPDATE — call orchestrator)
```

### Flow

1. **Pass 1a**: `scrape-ig-free.mjs` — for each of 4 IG accounts
   - P4: POST `/clips/user/` for reels (12/page, paginated unlimited via `max_id`)
   - P7: GET `/feed/user/{pk}/` for image posts (best-effort, rate-limited)
2. **Pass 1b**: `scrape-tt-free.mjs` — for each of 5 TT accounts
   - P19: Jina profile (follower, bio)
   - P2: TikWM `/api/` via Jina proxy (per-post detail when video_id known)
3. **Pass 2a**: `enrich-ig-ytdlp.mjs` — per-post yt-dlp for IG video
   - **Known limitation**: yt-dlp fails for IMAGE posts ("No video formats found")
4. **Pass 2b**: `enrich-tt-tikwm.mjs` — per-post TikWM enrichment
5. **Merge**: existing `mergePosts(existing, new)` in each script (MAX-merge, dedup by composite key)
6. **Output**: `TITAN/scraped/<slug>.json` updated per account
7. **Validate**: `validate-merge.mjs` (existing)
8. **Pre-flight**: `pre-flight-deploy.mjs` (new)
9. **Deploy**: `pnpm run deploy` (manual)

## Data Flow (per-field merge rules)

| Field | IG source | TT source | Merge rule |
|---|---|---|---|
| `id` | composite `${platform}:${shortcode}` | same | KEY (V29.1) |
| `shortcode` / `code` | P4 reels / P7 image | P2 | FIRST non-null |
| `caption` | P4 | P2 + P19 | FIRST non-null |
| `timestamp` | P4 | P2 | MAX |
| `likeCount` | P4 (reels only) | P2 | MAX |
| `commentCount` | P4 (reels only) | P2 | MAX |
| `viewCount` | P4 → `play_count` | P2 → `view_count` | MAX |
| `saveCount` | ❌ stays 0 | P2 | MAX (most stay 0) |
| `shareCount` | ❌ stays 0 | P2 | MAX (most stay 0) |
| `thumbnailUrl` | P4 | P2 | FIRST non-null |
| `videoUrl` | P4 | P2 | FIRST non-null |
| `mediaType` | P4 → 'REEL' / P7 → 'IMAGE' | P2 → 'VIDEO' | FIRST non-null |

**Numeric**: `if new > existing: replace` (MAX-merge, monotonic)
**String**: `if !existing || new: replace` (FIRST non-null)

## Error Handling

| Failure | Behavior |
|---|---|
| P4 rate-limit / login_required (IG) | Stop pagination, keep partial reels, log warning, exit 0 for account |
| P7 /feed/user/ rate-limit (IG) | Skip image fetch, reels still saved, log warning |
| P2 TikWM via Jina per-post fail | Log error, skip post, continue next |
| P19 Jina profile fail | Log error, skip account, continue next |
| yt-dlp per-post fail (no video formats) | Skip post, log, continue |
| Disk write fail (atomic) | Abort, no partial file (atomic rename) |
| All 9 accounts fail | Log all errors, exit 1 |

**Per-account safety**: failure in one account does NOT block next account (try/catch + log).

**Idempotency**: re-running on same data = same result (MAX-merge is monotonic on numeric).

## Testing Strategy

### Layer 1 — Provider smoke test (new: `scripts/test-providers.mjs`)

- Tests 1 known post: IG `DavGLefkwbZ` (majangmejeng_), TT `7664121536290327816` (majangmejeng_)
- Asserts P4, P7, P2, P19, yt-dlp each return valid shape
- Per-provider PASS/FAIL summary
- Duration: ~30s. Run BEFORE real scrape.

### Layer 2 — Per-account dry-run

```bash
node scripts/scrape-hybrid-orchestrator.mjs --dry-run only=ig-majangmejeng_
```

- Runs full Pass 1+2 for 1 akun, no file write
- Computes diff: added (new posts), upgraded (metric naik), total
- Prints summary, returns exit 0
- User inspects before full real run

### Layer 3 — Full real run

```bash
node scripts/scrape-hybrid-orchestrator.mjs
```

- All 9 accounts, writes to `scraped/<slug>.json`
- Logs added/upgraded per account
- Exit 0 on success, 1 if all 9 fail

### Post-scrape validation (existing: `validate-merge.mjs`)

- 9 akun
- Total posts > 0
- No cross-dup
- likeCount+commentCount non-zero ratio improved

## Deployment

### Manual flow

```bash
# 1. Layer 1 smoke test
node scripts/test-providers.mjs

# 2. Layer 2 dry-run for 1 account
node scripts/scrape-hybrid-orchestrator.mjs --dry-run only=ig-majangmejeng_

# 3. Layer 3 full real run
node scripts/scrape-hybrid-orchestrator.mjs

# 4. Validate merge
node scripts/validate-merge.mjs

# 5. Pre-flight deploy
node scripts/pre-flight-deploy.mjs

# 6. Tag pre-deploy
git tag pre-v31-scrape-21jul

# 7. Build + deploy
pnpm run deploy

# 8. Tag post-deploy
git tag post-v31-scrape-21jul
```

### Pre-flight check (new: `scripts/pre-flight-deploy.mjs`)

- 9 akun loaded
- Total posts ≥ 3705 (current live baseline)
- cross-dup == 0
- VITE_LLM_PROXY_URL not empty
- Bundle hash stable
- Returns exit 0 = OK to deploy, exit 1 = abort

### Rollback plan

- **Pre-deploy tag**: `pre-v31-scrape-21jul` for `git reset --hard`
- **Post-deploy tag**: `post-v31-scrape-21jul` for marking milestone
- **Live rollback**: previous `vite-index.template-*.js` in `gh-pages` history; revert commit on `gh-pages` restores live state

### V30.4 lesson applied

> "JANGAN pnpm run deploy manual setelah workflow sukses deploy"
> — Risk: duplicate commits / data loss

Mitigation: We do NOT trigger `daily-update` workflow. All work is manual pipeline + manual deploy.

## Out-of-scope (CLAUDE.md reminder)

- Cleanup file dead/duplicate (V30 separate pass)
- Auto-rollback (manual only)
- Multi-region Worker
- E2E test GitHub Actions (act tool)
- Per-account post-floor check

## Success Criteria

1. ✅ All 9 accounts have non-zero `posts.length` after run
2. ✅ `likeCount`, `commentCount`, `viewCount` non-zero count increased (vs pre-scrape baseline)
3. ✅ cross-dup == 0 (no regression from V29.1)
4. ✅ Live bundle hash changes (deploy verified)
5. ✅ `accounts-full.json` JSON valid, parses in 9 elements
6. ✅ Total posts ≥ 3705 (no data loss)
7. ⚠️ Acceptable: `saveCount`, `shareCount` stay 0 for IG (no free source)

## Failure Criteria (abort + revert)

- Any account has 0 new posts AND 0 upgrades (silent pipeline break)
- Total posts DECREASED (regression — caused by silent account failure: pre-flight detects, abort)
- cross-dup > 0 (V29.1 regression)
- `validate-merge` exit 1
- Pre-flight deploy exit 1

**Silent-failure detection**: orchestrator MUST report per-account outcome (added/upgraded/errors). If total posts < pre-scrape baseline, pre-flight ABORTs deploy.

## Reference

- [[titan-scrap-provider-cascade]] — definitive 25-provider test
- [[project-titan-v30-batch-shipped]] — V30.4 lesson (no manual deploy after workflow)
- [[titan-v28-chatpanel-workflow-fix]] — V28 free scrapers (Pass 1a/1b base)
- [[project-titan-v29-history]] — V29.1 composite-key dedup
- [[feedback-titan-audit-contract-v1]] — 7 audit principles applied
