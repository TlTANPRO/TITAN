// Instagram scraper — V28 wrapper.
//
// V28: ENSEMBLEDATA tokens exhausted (only 1 of 34 still valid on 20 Jul 2026).
// This script used to call ENSEMBLEDATA's /user/posts + /post/details endpoints.
// Now it forwards to scripts/scrape-ig-free.mjs which uses the FREE
// i.instagram.com /clips/user/ and /feed/user/ endpoints (no API key needed).
//
// CLI flags (forwarded to scrape-ig-free.mjs):
//   --force        → ignored (free scraper always merges incrementally)
//   only=ig-slug   → restrict to one account
//   --no-enrich    → ignored (free scraper doesn't have a separate enrich pass)
//
// The ENSEMBLEDATA_TOKENS_SKIP flag is still respected for backward compat
// (does nothing now since the wrapper never touches ENSEMBLEDATA).
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  // V28: If user explicitly set the skip flag, exit cleanly. This is a
  // no-op safety net — the free scraper doesn't depend on ENSEMBLEDATA.
  if (process.env.ENSEMBLEDATA_TOKENS_SKIP === 'true') {
    console.log('[IG] ⚠️  ENSEMBLEDATA_TOKENS_SKIP=true — but V28 uses free methods, scraping will run');
  }

  // Filter out flags that were meaningful for the old ENSEMBLEDATA version
  // but are not understood by the free scraper. Keep `only=` for account
  // selection; drop --force and --no-enrich (free scraper always re-fetches
  // and merges incrementally — no separate "enrich" pass).
  const forward = process.argv.slice(2).filter((a) => {
    if (a === '--force' || a === '--no-enrich') {
      console.log(`[IG] V28 wrapper: ignoring legacy flag "${a}" (free scraper always re-fetches)`);
      return false;
    }
    if (a === '--days=N') {
      // free scraper doesn't have a day-window option
      console.log(`[IG] V28 wrapper: ignoring --days (free scraper is unbounded; 1-2 pages is typical)`);
      return false;
    }
    return true;
  });

  console.log('[IG] V28: routing to scrape-ig-free.mjs (i.instagram.com /clips/user/ + /feed/user/)');
  console.log('[IG] No API key required. Append-only merge with existing data.');

  // Spawn the free scraper as a child process, inherit stdio.
  const child = spawn(
    process.execPath,
    [path.join(__dirname, 'scrape-ig-free.mjs'), ...forward],
    { stdio: 'inherit' }
  );

  const exitCode = await new Promise((resolve) => {
    child.on('exit', (code) => resolve(code ?? 1));
  });
  process.exit(exitCode);
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
