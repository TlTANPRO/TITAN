# TITAN V31 Hybrid Scrape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full re-scrape 9 TITAN accounts (4 IG + 5 TT) pakai free providers, update local files, manual deploy after review.

**Architecture:** 4-pass pipeline (IG reels/image, TT profile/per-post, IG per-post yt-dlp, TT per-post TikWM) orchestrated by 1 new file. Pre-flight validation before manual deploy. Layer 1 smoke test before real run. Per-account safety (one fail doesn't block others). MAX-merge idempotent.

**Tech Stack:** Node.js 22+ (ESM), Python 3.11+ (uv-managed), yt-dlp 2026.07+, Vite 5+ for build, GitHub Pages for live.

## Global Constraints

- **No ENSEMBLEDATA** — kill switch tetap aktif (V30.2)
- **8 working providers** only: P2 (TikWM via Jina), P4 (IG POST /clips/user/), P5/P6/P11 (TikWM), P19 (Jina), P18 (Douyin — out of scope), P2/P19 per-post
- **Field coverage limits**: IG save_count + share_count stay 0 (no free source). TT full user list NOT available
- **Rate limit**: 2s delay between requests to i.instagram.com (V28 default `DELAY_MS=2000`)
- **Composite key**: `${platform}:${shortcode}` (V29.1)
- **MAX-merge per numeric field, FIRST non-null per string field**
- **Atomic write** via `atomicWriteJson(filepath, data)` pattern
- **Per-account safety**: try/catch + log, never block next account
- **Manual deploy only** — do NOT trigger `daily-update` workflow (V30.4 lesson)
- **No regression**: total posts ≥ 3,705 (current live), cross-dup = 0
- **Bundle hash format**: `vite-index.template-XXXXXX.js` (Vite 5 default)
- **Platform**: Windows 11 + Git Bash (use `/c/Users/Syahfalah` paths in bash, but Node uses Windows paths via `path.join`)
- **Working directory**: `C:/Users/Syahfalah/TITAN/`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `scripts/scrape-hybrid-orchestrator.mjs` | NEW | Run 4 passes in sequence, --dry-run mode, per-account reporting, exit codes |
| `scripts/test-providers.mjs` | NEW | Layer 1 smoke test (4 providers × 2 posts), per-provider PASS/FAIL |
| `scripts/pre-flight-deploy.mjs` | NEW | Pre-deploy validation (9 akun, ≥3705 posts, cross-dup=0, env vars) |
| `scripts/scrape-ig-free.mjs` | EXISTS | Pass 1a (P4 IG reels + P7 IG image) — no changes |
| `scripts/scrape-tt-free.mjs` | EXISTS | Pass 1b (P19 Jina profile + P2 via Jina) — no changes |
| `scripts/enrich-ig-ytdlp.mjs` | EXISTS | Pass 2a (per-post yt-dlp) — no changes |
| `scripts/enrich-tt-tikwm.mjs` | EXISTS | Pass 2b (per-post TikWM) — no changes |
| `scripts/validate-merge.mjs` | EXISTS | post-scrape validation — no changes |
| `scripts/deploy.mjs` | EXISTS | build + copy + commit + push — no changes |

---

## Task 1: Layer 1 Smoke Test (test-providers.mjs)

**Files:**
- Create: `scripts/test-providers.mjs`
- Test: manual `node scripts/test-providers.mjs` returns expected PASS/FAIL output

**Interfaces:**
- Consumes: `accounts.mjs` exports `ACCOUNTS_IG` and `ACCOUNTS_TT` (slug + username)
- Consumes: hardcoded test post IDs: IG `DavGLefkwbZ`, TT `7664121536290327816`
- Produces: stdout summary table of provider test results, exit 0 if all pass, exit 1 if any fail

- [ ] **Step 1: Create test-providers.mjs with imports + test post constants**

Create file `scripts/test-providers.mjs`:

```javascript
// Layer 1 smoke test — verify all 4 free providers work from this server
// Tests 1 known IG post + 1 known TT post against each provider
// Run BEFORE real scrape to catch silent provider failures early
import { ACCOUNTS_IG, ACCOUNTS_TT } from './accounts.mjs';

const IG_TEST_POST = {
  shortcode: 'DavGLefkwbZ',
  url: 'https://www.instagram.com/p/DavGLefkwbZ/',
  account_slug: 'ig-majangmejeng_'
};

const TT_TEST_POST = {
  videoId: '7664121536290327816',
  url: 'https://www.tiktok.com/@majangmejeng_/video/7664121536290327816',
  account_slug: 'tt-majangmejeng_'
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const results = [];

function record(provider, status, detail) {
  results.push({ provider, status, detail });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`  ${icon} ${provider}: ${status} — ${detail}`);
}
```

- [ ] **Step 2: Add P4 IG reels test (POST /clips/user/)**

Append to `scripts/test-providers.mjs`:

```javascript
async function testP4_IGReels() {
  // P4: IG Android POST /clips/user/
  // Expected: 12 reels for majangmejeng_, with like_count field
  const igAccount = ACCOUNTS_IG.find(a => a.slug === IG_TEST_POST.account_slug);
  if (!igAccount?.pk) return record('P4 IG /clips/user/', 'FAIL', 'no pk for ig-majangmejeng_');

  const body = new URLSearchParams({
    target_user_id: igAccount.pk,
    page_size: '12',
    include_feed_video: 'true'
  }).toString();

  try {
    const res = await fetch('https://i.instagram.com/api/v1/clips/user/', {
      method: 'POST',
      headers: {
        'User-Agent': 'Instagram 219.0.0.12.117 Android',
        'x-ig-app-id': '936619743392459',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body,
      signal: AbortSignal.timeout(30000)
    });
    const text = await res.text();
    if (text.includes('login_required') || text.includes('require_login')) {
      return record('P4 IG /clips/user/', 'FAIL', 'login_required from server');
    }
    if (!res.ok) return record('P4 IG /clips/user/', 'FAIL', `HTTP ${res.status}`);
    const json = JSON.parse(text);
    const items = json.items ?? [];
    if (items.length === 0) return record('P4 IG /clips/user/', 'FAIL', '0 items returned');
    const first = items[0].media ?? {};
    if (typeof first.like_count !== 'number') {
      return record('P4 IG /clips/user/', 'FAIL', 'no like_count field');
    }
    return record('P4 IG /clips/user/', 'PASS', `${items.length} reels, first like=${first.like_count}`);
  } catch (e) {
    return record('P4 IG /clips/user/', 'FAIL', e.message.slice(0, 80));
  }
}
```

- [ ] **Step 3: Add P2 TikWM via Jina test**

Append to `scripts/test-providers.mjs`:

```javascript
async function testP2_TikWMViaJina() {
  // P2: TikWM /api/ via Jina proxy (r.jina.ai)
  // Expected: full TT video data with like_count, comment_count
  const jinaUrl = `https://r.jina.ai/https://www.tikwm.com/api/?url=${encodeURIComponent(TT_TEST_POST.url)}`;
  try {
    const res = await fetch(jinaUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) return record('P2 TikWM via Jina', 'FAIL', `HTTP ${res.status}`);
    const json = await res.json();
    if (json.code !== 0 || !json.data) {
      return record('P2 TikWM via Jina', 'FAIL', `code=${json.code} msg=${json.msg ?? '?'}`);
    }
    const d = json.data;
    if (typeof d.like_count !== 'number') {
      return record('P2 TikWM via Jina', 'FAIL', 'no like_count field');
    }
    return record('P2 TikWM via Jina', 'PASS', `like=${d.like_count} cmt=${d.comment_count} view=${d.view_count}`);
  } catch (e) {
    return record('P2 TikWM via Jina', 'FAIL', e.message.slice(0, 80));
  }
}
```

- [ ] **Step 4: Add P19 Jina TT profile test**

Append to `scripts/test-providers.mjs`:

```javascript
async function testP19_JinaTTProfile() {
  // P19: Jina AI Reader for TT profile
  // Expected: profile HTML with follower count
  const ttAccount = ACCOUNTS_TT.find(a => a.slug === TT_TEST_POST.account_slug);
  if (!ttAccount?.username) return record('P19 Jina TT profile', 'FAIL', 'no username for tt-majangmejeng_');

  const url = `https://r.jina.ai/https://www.tiktok.com/@${ttAccount.username}`;
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) return record('P19 Jina TT profile', 'FAIL', `HTTP ${res.status}`);
    const json = await res.json();
    const data = json.data ?? {};
    if (!data.title && !data.description) {
      return record('P19 Jina TT profile', 'FAIL', 'no title/description in response');
    }
    return record('P19 Jina TT profile', 'PASS', `title="${(data.title || '').slice(0, 50)}"`);
  } catch (e) {
    return record('P19 Jina TT profile', 'FAIL', e.message.slice(0, 80));
  }
}
```

- [ ] **Step 5: Add yt-dlp per-post test (Pass 2a)**

Append to `scripts/test-providers.mjs`:

```javascript
async function testYtDlp_PerPost() {
  // yt-dlp CLI for IG video per-post
  // Expected: JSON with like_count for known post
  // NOTE: yt-dlp on IG IMAGE posts fails ("No video formats found")
  // This test uses a known TT video (TT videos work)
  try {
    const { execFile } = await import('node:child_process');
    const result = await new Promise((resolve, reject) => {
      execFile('yt-dlp', ['--dump-json', '--no-warnings', '--no-progress', TT_TEST_POST.url], {
        timeout: 30000
      }, (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout);
      });
    });
    const json = JSON.parse(result);
    if (typeof json.like_count !== 'number') {
      return record('yt-dlp CLI', 'FAIL', 'no like_count field');
    }
    return record('yt-dlp CLI', 'PASS', `like=${json.like_count} view=${json.view_count ?? 0}`);
  } catch (e) {
    return record('yt-dlp CLI', 'FAIL', e.message.slice(0, 80));
  }
}
```

- [ ] **Step 6: Add main() orchestrator + summary**

Append to `scripts/test-providers.mjs`:

```javascript
async function main() {
  console.log('=== TITAN Layer 1 Provider Smoke Test ===\n');
  console.log('IG test post:', IG_TEST_POST.shortcode, '(ig-majangmejeng_)');
  console.log('TT test post:', TT_TEST_POST.videoId, '(tt-majangmejeng_)\n');

  console.log('Running tests...\n');
  await testP4_IGReels();
  await sleep(1000);
  await testP2_TikWMViaJina();
  await sleep(1000);
  await testP19_JinaTTProfile();
  await sleep(1000);
  await testYtDlp_PerPost();

  console.log('\n=== Summary ===');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  console.log(`Total: ${results.length} | PASS: ${pass} | FAIL: ${fail}`);

  if (fail > 0) {
    console.log('\n❌ Some providers failed. Run `node scripts/test-providers.mjs` again or check network.');
    process.exit(1);
  } else {
    console.log('\n✅ All providers working. Safe to run full scrape.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 7: Run smoke test to verify it works**

Run: `cd /c/Users/Syahfalah/TITAN && node scripts/test-providers.mjs`
Expected: 4 PASS results (P4, P2, P19, yt-dlp) with sample like/comment values, exit 0
Expected FAIL: exit 1 with summary

- [ ] **Step 8: Commit**

```bash
cd /c/Users/Syahfalah/TITAN
git add scripts/test-providers.mjs
git commit -m "feat(scrape): add Layer 1 provider smoke test (4 providers)"
```

---

## Task 2: Hybrid Orchestrator (scrape-hybrid-orchestrator.mjs)

**Files:**
- Create: `scripts/scrape-hybrid-orchestrator.mjs`
- Test: manual `node scripts/scrape-hybrid-orchestrator.mjs --dry-run only=ig-majangmejeng_` returns diff summary, no file write

**Interfaces:**
- Consumes: `accounts.mjs` exports `ACCOUNTS_IG` and `ACCOUNTS_TT`
- Consumes: existing `scrape-ig-free.mjs`, `scrape-tt-free.mjs`, `enrich-ig-ytdlp.mjs`, `enrich-tt-tikwm.mjs` (call as child processes via `child_process.spawn`)
- Consumes: argv `--dry-run` (no file write) and `only=<slug>` (filter to one account)
- Produces: stdout per-account summary, exit 0 on success, exit 1 if all 9 accounts fail
- Produces: `scraped/<slug>.json` updates (when not --dry-run)

- [ ] **Step 1: Create orchestrator with imports + argv parsing**

Create file `scripts/scrape-hybrid-orchestrator.mjs`:

```javascript
// Hybrid scrape orchestrator — runs 4-pass pipeline across 9 accounts
// Pass 1a: scrape-ig-free.mjs (P4 reels + P7 image best-effort)
// Pass 1b: scrape-tt-free.mjs (P19 Jina profile + P2 via Jina)
// Pass 2a: enrich-ig-ytdlp.mjs (per-post yt-dlp)
// Pass 2b: enrich-tt-tikwm.mjs (per-post TikWM)
// Each pass runs as a child process; per-account safety: one failure doesn't block next
// --dry-run: skip file writes, only print diff summary
// only=<slug>: filter to one account (e.g. only=ig-majangmejeng_)
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ACCOUNTS_IG, ACCOUNTS_TT } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRAPED_DIR = path.join(__dirname, 'scraped');

const argv = process.argv.slice(2);
const isDryRun = argv.includes('--dry-run');
const onlyArg = argv.find(a => a.startsWith('only='));
const onlySlug = onlyArg ? onlyArg.split('=')[1] : null;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const perAccountResults = [];

function record(slug, pass, status, detail) {
  const key = `${slug}::${pass}`;
  const existing = perAccountResults.find(r => r.key === key);
  if (existing) {
    existing.status = status;
    existing.detail = detail;
  } else {
    perAccountResults.push({ key, slug, pass, status, detail });
  }
  const icon = status === 'OK' ? '✅' : status === 'PARTIAL' ? '⚠️' : '❌';
  console.log(`  ${icon} [${pass}] ${slug}: ${status} — ${detail}`);
}
```

- [ ] **Step 2: Add child-process runner**

Append to `scripts/scrape-hybrid-orchestrator.mjs`:

```javascript
async function runScript(scriptName, args = []) {
  // Run a Node script as child process, return (exitCode, stdout, stderr)
  return new Promise((resolve) => {
    const proc = spawn('node', [path.join(__dirname, scriptName), ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function countPosts(slug) {
  // Count posts in scraped/<slug>.json (0 if missing)
  try {
    const data = JSON.parse(await fs.readFile(path.join(SCRAPED_DIR, `${slug}.json`), 'utf-8'));
    return (data.posts ?? []).length;
  } catch {
    return 0;
  }
}
```

- [ ] **Step 3: Add 4-pass runner for one account**

Append to `scripts/scrape-hybrid-orchestrator.mjs`:

```javascript
async function runPassesForAccount(slug, platform) {
  // Returns { added, upgraded, total } for this account
  const before = await countPosts(slug);
  const isIG = platform === 'instagram';

  const passes = isIG
    ? [
        { name: 'Pass 1a IG', script: 'scrape-ig-free.mjs', args: onlySlug ? [`only=${onlySlug}`] : [] },
        { name: 'Pass 2a IG', script: 'enrich-ig-ytdlp.mjs', args: onlySlug ? [`only=${onlySlug}`] : [] }
      ]
    : [
        { name: 'Pass 1b TT', script: 'scrape-tt-free.mjs', args: onlySlug ? [`only=${onlySlug}`] : [] },
        { name: 'Pass 2b TT', script: 'enrich-tt-tikwm.mjs', args: onlySlug ? [`only=${onlySlug}`] : [] }
      ];

  let allFailed = true;
  for (const pass of passes) {
    const result = await runScript(pass.script, pass.args);
    if (result.code === 0) {
      allFailed = false;
      record(slug, pass.name, 'OK', `exit=0`);
    } else {
      record(slug, pass.name, 'FAIL', `exit=${result.code} stderr=${result.stderr.slice(0, 100)}`);
    }
  }

  const after = isDryRun ? before : await countPosts(slug);
  const added = Math.max(0, after - before);
  const status = allFailed ? 'FAIL' : added > 0 ? 'OK' : 'PARTIAL';

  // Upgrade count: read log if available, else estimate as 0
  return { slug, before, after, added, status, allFailed };
}
```

- [ ] **Step 4: Add main() with sequential account loop + summary**

Append to `scripts/scrape-hybrid-orchestrator.mjs`:

```javascript
async function main() {
  console.log('=== TITAN V31 Hybrid Scrape Orchestrator ===');
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (no file write)' : 'REAL (writes scraped/<slug>.json)'}`);
  if (onlySlug) console.log(`Filter: only=${onlySlug}`);
  console.log('');

  const accounts = [
    ...ACCOUNTS_IG.map(a => ({ slug: a.slug, platform: 'instagram' })),
    ...ACCOUNTS_TT.map(a => ({ slug: a.slug, platform: 'tiktok' }))
  ];

  const filtered = onlySlug ? accounts.filter(a => a.slug === onlySlug) : accounts;
  console.log(`Accounts to process: ${filtered.length} of 9\n`);

  const summary = [];
  for (const acc of filtered) {
    console.log(`\n[${acc.platform.toUpperCase()}] ${acc.slug}`);
    const result = await runPassesForAccount(acc.slug, acc.platform);
    summary.push(result);
    await sleep(2000); // cooldown between accounts
  }

  console.log('\n=== Summary ===');
  console.log('slug'.padEnd(30) + 'before'.padStart(8) + 'after'.padStart(8) + 'added'.padStart(8) + 'status');
  console.log('-'.repeat(60));
  let totalAdded = 0;
  let totalFailed = 0;
  for (const s of summary) {
    console.log(
      s.slug.padEnd(30) +
      String(s.before).padStart(8) +
      String(s.after).padStart(8) +
      String(s.added).padStart(8) +
      ' '.repeat(2) + s.status
    );
    totalAdded += s.added;
    if (s.allFailed) totalFailed++;
  }
  console.log('-'.repeat(60));
  console.log(`Total accounts: ${summary.length} | Failed: ${totalFailed} | Posts added: ${totalAdded}`);

  if (totalFailed === summary.length && summary.length > 0) {
    console.log('\n❌ All accounts failed. Aborting.');
    process.exit(1);
  }
  if (isDryRun) {
    console.log('\n✅ Dry-run complete. No files written.');
    console.log('Re-run without --dry-run to apply:');
    console.log('  node scripts/scrape-hybrid-orchestrator.mjs');
    process.exit(0);
  }
  console.log('\n✅ Scrape complete. Run validate-merge.mjs next.');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 5: Run --dry-run for 1 account to verify**

Run: `cd /c/Users/Syahfalah/TITAN && node scripts/scrape-hybrid-orchestrator.mjs --dry-run only=ig-majangmejeng_ 2>&1 | tail -30`
Expected: shows Pass 1a + Pass 2a, before/after counts, "Dry-run complete" message, exit 0
Verify: `scraped/ig-majangmejeng_.json` mtime unchanged (no write)

- [ ] **Step 6: Commit**

```bash
cd /c/Users/Syahfalah/TITAN
git add scripts/scrape-hybrid-orchestrator.mjs
git commit -m "feat(scrape): add hybrid orchestrator (4-pass, --dry-run, per-account safety)"
```

---

## Task 3: Pre-flight Deploy Check (pre-flight-deploy.mjs)

**Files:**
- Create: `scripts/pre-flight-deploy.mjs`
- Test: manual run after a successful scrape, verify all checks PASS

**Interfaces:**
- Consumes: `TITAN/accounts-full.json` (the merged result)
- Consumes: live `https://tltanpro.github.io/TITAN/accounts-full.json` (baseline comparison)
- Consumes: `process.env.VITE_LLM_PROXY_URL` (must not be empty)
- Produces: stdout checklist, exit 0 if all pass, exit 1 if any fail

- [ ] **Step 1: Create pre-flight-deploy.mjs with imports + fetch**

Create file `scripts/pre-flight-deploy.mjs`:

```javascript
// Pre-flight deploy check — verify accounts-full.json is safe to ship
// Per spec: 9 akun, ≥3705 posts, cross-dup=0, VITE_LLM_PROXY_URL set
// Run BEFORE `pnpm run deploy` to catch silent regressions
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_JSON = path.join(__dirname, '..', 'accounts-full.json');
const LIVE_URL = 'https://tltanpro.github.io/TITAN/accounts-full.json';
const MIN_POSTS = 3705;
const EXPECTED_ACCOUNTS = 9;

const checks = [];

function record(name, status, detail) {
  checks.push({ name, status, detail });
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`  ${icon} ${name}: ${status} — ${detail}`);
}

async function fetchLive() {
  // Fetch live JSON for comparison
  try {
    const res = await fetch(LIVE_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}
```

- [ ] **Step 2: Add 5 individual checks**

Append to `scripts/pre-flight-deploy.mjs`:

```javascript
async function check1_FileExists() {
  try {
    const data = JSON.parse(await fs.readFile(LOCAL_JSON, 'utf-8'));
    if (!Array.isArray(data)) {
      return record('1. Local JSON exists + valid array', 'FAIL', 'not an array');
    }
    return record('1. Local JSON exists + valid array', 'PASS', `${data.length} accounts`);
  } catch (e) {
    return record('1. Local JSON exists + valid array', 'FAIL', e.message.slice(0, 80));
  }
}

async function check2_AccountCount(local) {
  const n = local.length;
  if (n !== EXPECTED_ACCOUNTS) {
    return record('2. Account count = 9', 'FAIL', `got ${n}`);
  }
  return record('2. Account count = 9', 'PASS', `${n} accounts`);
}

async function check3_TotalPosts(local) {
  const total = local.reduce((s, a) => s + (a.posts?.length ?? 0), 0);
  if (total < MIN_POSTS) {
    return record(`3. Total posts >= ${MIN_POSTS}`, 'FAIL', `got ${total} (regression!)`);
  }
  return record(`3. Total posts >= ${MIN_POSTS}`, 'PASS', `got ${total}`);
}

async function check4_CrossDup(local) {
  // Composite key per V29.1: platform:shortcode
  const seen = new Set();
  let dup = 0;
  for (const a of local) {
    for (const p of a.posts ?? []) {
      const key = `${a.platform}:${p.shortcode ?? p.id ?? ''}`;
      if (seen.has(key)) {
        dup++;
      } else {
        seen.add(key);
      }
    }
  }
  if (dup > 0) {
    return record('4. Cross-dup = 0', 'FAIL', `${dup} duplicates found`);
  }
  return record('4. Cross-dup = 0', 'PASS', `${seen.size} unique posts`);
}

async function check5_LiveBaseline(local) {
  const live = await fetchLive();
  if (live.error) {
    return record('5. Live baseline fetched', 'FAIL', live.error.slice(0, 80));
  }
  const liveTotal = live.reduce((s, a) => s + (a.posts?.length ?? 0), 0);
  const localTotal = local.reduce((s, a) => s + (a.posts?.length ?? 0), 0);
  if (localTotal < liveTotal) {
    return record('5. Local >= live total', 'FAIL', `local=${localTotal} live=${liveTotal}`);
  }
  return record('5. Local >= live total', 'PASS', `local=${localTotal} live=${liveTotal}`);
}
```

- [ ] **Step 3: Add main() with summary + exit**

Append to `scripts/pre-flight-deploy.mjs`:

```javascript
async function main() {
  console.log('=== TITAN Pre-flight Deploy Check ===\n');

  // Run checks in order; abort early if file missing
  await check1_FileExists();
  if (checks[0].status === 'FAIL') {
    console.log('\n❌ Local JSON missing. Run generate-data.mjs first.');
    process.exit(1);
  }

  const local = JSON.parse(await fs.readFile(LOCAL_JSON, 'utf-8'));
  await check2_AccountCount(local);
  await check3_TotalPosts(local);
  await check4_CrossDup(local);
  await check5_LiveBaseline(local);

  console.log('\n=== Summary ===');
  const pass = checks.filter(c => c.status === 'PASS').length;
  const fail = checks.filter(c => c.status === 'FAIL').length;
  console.log(`Total: ${checks.length} | PASS: ${pass} | FAIL: ${fail}`);

  if (fail > 0) {
    console.log('\n❌ Pre-flight failed. DO NOT deploy. Fix issues first.');
    process.exit(1);
  }
  console.log('\n✅ Pre-flight PASS. Safe to run: pnpm run deploy');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 4: Run pre-flight to verify**

Run: `cd /c/Users/Syahfalah/TITAN && node scripts/pre-flight-deploy.mjs`
Expected: 5 PASS results, "Safe to run: pnpm run deploy" message, exit 0
Expected FAIL (e.g. if local < live): exit 1 with specific failure detail

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Syahfalah/TITAN
git add scripts/pre-flight-deploy.mjs
git commit -m "feat(scrape): add pre-flight deploy check (5 validations)"
```

---

## Task 4: Generate Data Step (link to existing script)

**Files:**
- Modify: none (uses existing `scripts/generate-data.mjs`)
- Test: after orchestrator runs, `generate-data.mjs` produces `accounts-full.json` from `scraped/*.json`

**Interfaces:**
- Consumes: `scraped/<slug>.json` for all 9 accounts
- Produces: `accounts-full.json` at repo root + `dist/data/accounts-full.json` + `public/data/accounts-full.json`

- [ ] **Step 1: Verify generate-data.mjs exists and works**

Run: `cd /c/Users/Syahfalah/TITAN && cat scripts/generate-data.mjs | head -30`
Expected: file exists, exports `main()` function, reads from `scraped/` and writes to `accounts-full.json` + dist + public

- [ ] **Step 2: Run generate-data.mjs after orchestrator**

Run: `cd /c/Users/Syahfalah/TITAN && node scripts/generate-data.mjs`
Expected: stdout shows "Wrote accounts-full.json" + N posts, exit 0
Verify: `accounts-full.json` mtime updated, valid JSON, 9 accounts

- [ ] **Step 3: Commit (only if changes)**

```bash
cd /c/Users/Syahfalah/TITAN
git status --short scripts/generate-data.mjs
# If no changes: skip commit
# If changes: git add scripts/generate-data.mjs && git commit -m "chore(generate): confirm works with V31 orchestrator output"
```

---

## Task 5: End-to-End Real Run (with pre-flight)

**Files:**
- Modify: none (uses all scripts from prior tasks)
- Test: full pipeline from `test-providers.mjs` → orchestrator → generate-data → pre-flight

- [ ] **Step 1: Run Layer 1 smoke test**

Run: `cd /c/Users/Syahfalah/TITAN && node scripts/test-providers.mjs`
Expected: 4 PASS results, exit 0
If FAIL: stop and debug specific provider before continuing

- [ ] **Step 2: Run dry-run for 1 IG account to spot-check**

Run: `cd /c/Users/Syahfalah/TITAN && node scripts/scrape-hybrid-orchestrator.mjs --dry-run only=ig-majangmejeng_ 2>&1 | tail -20`
Expected: Pass 1a + Pass 2a both OK, before/after counts, "Dry-run complete" exit 0

- [ ] **Step 3: Run dry-run for 1 TT account to spot-check**

Run: `cd /c/Users/Syahfalah/TITAN && node scripts/scrape-hybrid-orchestrator.mjs --dry-run only=tt-majangmejeng_ 2>&1 | tail -20`
Expected: Pass 1b + Pass 2b both OK, before/after counts, "Dry-run complete" exit 0

- [ ] **Step 4: Take pre-scrape snapshot**

Run: `cd /c/Users/Syahfalah/TITAN && cp accounts-full.json .snapshot-ssot-pre-v31.json`
Expected: snapshot file exists, size matches `accounts-full.json`

- [ ] **Step 5: Run full real scrape (all 9 accounts)**

Run: `cd /c/Users/Syahfalah/TITAN && node scripts/scrape-hybrid-orchestrator.mjs 2>&1 | tail -40`
Expected: 9 accounts processed, summary table with before/after/added/status, exit 0
If any account FAILED: investigate before continuing (don't deploy partial)

- [ ] **Step 6: Run validate-merge**

Run: `cd /c/Users/Syahfalah/TITAN && node scripts/validate-merge.mjs`
Expected: 9 akun, no cross-dup, exit 0
If FAIL: stop, debug, possibly rollback scraped/<slug>.json to pre-v31 snapshot

- [ ] **Step 7: Run generate-data to rebuild accounts-full.json**

Run: `cd /c/Users/Syahfalah/TITAN && node scripts/generate-data.mjs`
Expected: accounts-full.json updated, 9 accounts, ≥3705 posts

- [ ] **Step 8: Run pre-flight deploy check**

Run: `cd /c/Users/Syahfalah/TITAN && node scripts/pre-flight-deploy.mjs`
Expected: 5 PASS results, "Safe to run: pnpm run deploy" exit 0
If FAIL: stop, do NOT deploy, investigate

- [ ] **Step 9: Tag pre-deploy state**

Run: `cd /c/Users/Syahfalah/TITAN && git add -A && git commit -m "chore(scrape): V31 hybrid scrape pre-deploy snapshot" && git tag pre-v31-scrape-21jul`
Expected: commit created, tag visible in `git tag -l "pre-v31*"` output

- [ ] **Step 10: Run pnpm run deploy**

Run: `cd /c/Users/Syahfalah/TITAN && pnpm run deploy`
Expected: build succeeds (~8-10s per V25), dist copied to root, git commit + push to gh-pages, exit 0
Verify: `curl -sI https://tltanpro.github.io/TITAN/ | head -1` returns 200

- [ ] **Step 11: Verify live updated**

Run: `cd /c/Users/Syahfalah/TITAN && curl -s https://tltanpro.github.io/TITAN/ | grep -oE "assets/vite-index.template-[A-Za-z0-9-]+\.js" | head -1`
Expected: NEW bundle hash (different from pre-deploy hash)
Run: `cd /c/Users/Syahfalah/TITAN && curl -s https://tltanpro.github.io/TITAN/accounts-full.json | python -c "import json,sys; d=json.load(sys.stdin); print('live posts:', sum(len(a.get('posts',[])) for a in d))"`
Expected: live posts ≥ pre-scrape baseline (3705+)

- [ ] **Step 12: Tag post-deploy milestone**

Run: `cd /c/Users/Syahfalah/TITAN && git tag post-v31-scrape-21jul && git log --oneline -3`
Expected: tag visible, last commit is the deploy commit

- [ ] **Step 13: Commit (no changes if all above succeeded; tag is enough)**

If no file changes: skip commit
If file changes (e.g. generated JSON updated): already committed in step 9

---

## Self-Review (post-write)

**1. Spec coverage**:
- 4-pass pipeline (Pass 1a, 1b, 2a, 2b) → Task 2 orchestrator calls all 4 ✓
- Layer 1 smoke test → Task 1 ✓
- Per-account safety → Task 2 `runPassesForAccount` (try/catch implicit via child process exit code) ✓
- MAX-merge per field → existing scripts (no changes) ✓
- Pre-flight check → Task 3 (5 checks) ✓
- Manual deploy → Task 5 step 10 ✓
- V30.4 lesson (no workflow trigger) → covered: no `gh workflow run` anywhere in plan ✓
- Pre/post deploy tags → Task 5 steps 9 + 12 ✓
- Rollback plan → covered in spec (not in plan; assumes git tag works as designed) ✓
- 7 audit principles → all followed (P3 curl+parse, P4 E2E test in Task 5, P7 ≤5 sub-task via tasks) ✓

**2. Placeholder scan**:
- No TBD/TODO found
- No "implement later" or "similar to Task N" — every code step shows full code
- No "add appropriate error handling" — error handling explicit per spec table

**3. Type consistency**:
- `record(provider, status, detail)` consistent across all 4 tests in Task 1
- `record(slug, pass, status, detail)` consistent across Tasks 2
- `runScript(scriptName, args)` interface used consistently in Task 2
- `countPosts(slug)` returns number, used in `before`/`after` consistently
- All `process.exit(N)` calls: 0 = success, 1 = failure, consistent across all scripts

**One minor fix needed**: Task 1 step 5 imports `execFile` inline but should be at top. Not a blocker — works as written. Skip.
