// Incremental scraper — V28 wrapper.
//
// V28: ENSEMBLEDATA tokens exhausted (only 1 of 34 still valid on 20 Jul 2026).
// This script used to fetch only "posts newer than latestTimestamp" via
// ENSEMBLEDATA's /user/posts + /post/details endpoints.
//
// The FREE scrapers (scripts/scrape-ig-free.mjs, scripts/scrape-tt-free.mjs)
// are already incremental by design — they append-only merge with existing
// data and only write posts that are new. Re-running them gives the same
// effect as an "incremental" run, plus they upgrade stale metrics on
// existing posts (e.g. a post with 0 likeCount that now has likes).
//
// So V28 simply spawns the free scrapers in sequence. CLI flags:
//   --platform=ig|tt|all    → forward to free scrapers
//   --days=N                → ignored (free scrapers are unbounded; 1-3 pages typical)
//   --prune                 → ignored (free scrapers never delete posts)
//   --no-enrich             → ignored (free scraper doesn't have separate enrich pass)
//
// V27.16 ENSEMBLEDATA_TOKENS_SKIP flag is still respected for backward compat
// (no-op now since the wrapper never touches ENSEMBLEDATA).

import 'dotenv/config';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { platform: 'all' };
  for (const a of args) {
    if (a.startsWith('--platform=')) opts.platform = a.split('=')[1];
  }
  return opts;
}

function runChild(scriptPath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath], { stdio: 'inherit' });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function main() {
  if (process.env.ENSEMBLEDATA_TOKENS_SKIP === 'true') {
    console.log('[INCREMENTAL] ENSEMBLEDATA_TOKENS_SKIP=true — V28 uses free methods, scraping will run');
  }
  const opts = parseArgs();
  console.log(`[INCREMENTAL] V28: routing to free scrapers (platform=${opts.platform})`);
  console.log(`[INCREMENTAL] No API key required. Append-only merge with existing data.\n`);

  const targets = [];
  if (opts.platform === 'all' || opts.platform === 'ig') {
    targets.push({ platform: 'ig', script: path.join(__dirname, 'scrape-ig-free.mjs') });
  }
  if (opts.platform === 'all' || opts.platform === 'tt') {
    targets.push({ platform: 'tt', script: path.join(__dirname, 'scrape-tt-free.mjs') });
  }

  let anyFailed = false;
  for (const t of targets) {
    console.log(`\n=== ${t.platform.toUpperCase()} FREE SCRAPE ===`);
    const code = await runChild(t.script);
    if (code !== 0) {
      console.error(`[INCREMENTAL] ${t.platform.toUpperCase()} free scraper exited with code ${code}`);
      anyFailed = true;
    }
  }

  if (anyFailed) process.exit(1);
  console.log('\n=== INCREMENTAL (V28 free) DONE ===');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
