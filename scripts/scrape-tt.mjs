// TikTok scraper — V28 wrapper.
//
// V28: ENSEMBLEDATA tokens exhausted (only 1 of 34 still valid on 20 Jul 2026).
// This script used to call ENSEMBLEDATA's TikTok endpoints.
// Now it forwards to scripts/scrape-tt-free.mjs which uses FREE methods:
//   - Jina reader for tiktok.com/@user web profile (NEW V28: follower/like counts)
//   - TikWM /api/user/info via Jina proxy (fallback profile source)
//   - TikWM /api/feed/search via Jina proxy (post discovery)
//
// CLI flags (forwarded to scrape-tt-free.mjs):
//   --force        → ignored (free scraper always merges incrementally)
//   --merge        → ignored (free scraper is always append-only merge)
//   only=tt-slug   → restrict to one account
//   --days=N       → ignored (free scraper is unbounded; 2-3 pages is typical)
//
// The ENSEMBLEDATA_TOKENS_SKIP flag is still respected for backward compat
// (does nothing now since the wrapper never touches ENSEMBLEDATA).
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  if (process.env.ENSEMBLEDATA_TOKENS_SKIP === 'true') {
    console.log('[TT] ⚠️  ENSEMBLEDATA_TOKENS_SKIP=true — but V28 uses free methods, scraping will run');
  }

  const forward = process.argv.slice(2).filter((a) => {
    if (a === '--force' || a === '--merge') {
      console.log(`[TT] V28 wrapper: ignoring legacy flag "${a}" (free scraper always re-fetches)`);
      return false;
    }
    if (a.startsWith('--days=')) {
      console.log(`[TT] V28 wrapper: ignoring --days (free scraper is unbounded; 2-3 pages is typical)`);
      return false;
    }
    return true;
  });

  console.log('[TT] V28: routing to scrape-tt-free.mjs (Jina web profile + TikWM search via Jina)');
  console.log('[TT] No API key required. Append-only merge with existing data.');

  const child = spawn(
    process.execPath,
    [path.join(__dirname, 'scrape-tt-free.mjs'), ...forward],
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
