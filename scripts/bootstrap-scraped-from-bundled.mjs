// bootstrap-scraped-from-bundled.mjs
//
// V27.12: Cold-start fix for the CI incremental workflow.
//
// Problem: scripts/scraped/ is gitignored, and the workflow's commit step
// only commits scraped/ AFTER successful scrape + generate. If any CI run
// ever fails between scrape and commit (which is exactly what happened on
// the V27.10/V27.11 fix-and-try cycle — pnpm install failed first, no
// scraped files written, no commit), every subsequent run starts from a
// fresh runner with an EMPTY scraped/ directory.
//
// Result: scrape-incremental.mjs reads "no existing → sinceMs=0 → days=7
// window", but its `cutoff = sinceMs - 1day` is still 0, so it should in
// theory bootstrap from 0. In practice, ENSEMBLEDATA tokens may be
// exhausted (V11/V13 chronic issue) and the scrape silently produces 0
// new posts for every account. Then generate-data finds 0 scrape files,
// writes an empty accounts-full.json, and the post-write guard fails.
//
// This script is the missing piece: at the START of the CI run, if
// scripts/scraped/ is empty or missing any expected slug, hydrate it
// from the bundled src/data/accounts-full.json. The bundled file is
// committed to the repo (it IS the source of truth for the static
// deployment), so it always exists on a fresh runner.
//
// Behavior:
//   - For each account in src/data/accounts-full.json:
//     - If scripts/scraped/{slug}.json already exists, skip (CI is
//       doing an incremental from a previously-committed baseline).
//     - If it doesn't exist, write the per-account file in the exact
//       shape scrape-incremental.mjs produces.
//   - Print a clear summary so the CI log shows what happened.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRAPED_DIR = path.join(__dirname, 'scraped');
const BUNDLED = path.join(__dirname, '..', 'src', 'data', 'accounts-full.json');

async function main() {
  let bundled;
  try {
    bundled = JSON.parse(await fs.readFile(BUNDLED, 'utf-8'));
  } catch (err) {
    console.error(`❌ Cannot read ${BUNDLED}: ${err.message}`);
    console.error('   This is unexpected — the bundled file should be in every commit.');
    process.exit(1);
  }

  if (!Array.isArray(bundled) || bundled.length === 0) {
    console.error(`❌ ${BUNDLED} is empty or not an array. Nothing to bootstrap from.`);
    process.exit(1);
  }

  await fs.mkdir(SCRAPED_DIR, { recursive: true });

  let hydrated = 0;
  let skipped = 0;
  const missing = [];

  for (const acc of bundled) {
    const slug = acc.account?.slug;
    if (!slug) continue;
    const outPath = path.join(SCRAPED_DIR, `${slug}.json`);

    // If a per-account file already exists on disk, the previous CI run
    // committed it — don't overwrite. We're bootstrap-from-cold-start only.
    try {
      const existing = JSON.parse(await fs.readFile(outPath, 'utf-8'));
      if (Array.isArray(existing.posts) && existing.posts.length > 0) {
        skipped++;
        continue;
      }
    } catch {
      // file doesn't exist or is empty — fall through to write
    }

    // Write in the exact shape scrape-incremental.mjs produces. The bundled
    // accounts-full.json has {platform, account, posts, scrapedAt, stats}
    // which is the same shape — we just add a `bootstrapFrom: bundled` marker
    // so we can see in the log when this path was taken.
    const out = {
      ...acc,
      stats: {
        ...(acc.stats ?? {}),
        isDummy: false,
        bootstrappedFromBundled: true,
        bootstrappedAt: new Date().toISOString()
      }
    };
    await fs.writeFile(outPath, JSON.stringify(out, null, 2));
    hydrated++;
  }

  // Verify all bundled accounts got a file (otherwise scrape-incremental +
  // generate-data will still fail)
  for (const acc of bundled) {
    const slug = acc.account?.slug;
    if (!slug) continue;
    const outPath = path.join(SCRAPED_DIR, `${slug}.json`);
    try {
      await fs.access(outPath);
    } catch {
      missing.push(slug);
    }
  }

  const totalPosts = bundled.reduce((s, a) => s + (a.posts?.length ?? 0), 0);
  console.log(`\n=== BOOTSTRAP COMPLETE ===`);
  console.log(`Bundled source: ${BUNDLED}`);
  console.log(`Bundled accounts: ${bundled.length} (${totalPosts} total posts)`);
  console.log(`Hydrated (new files): ${hydrated}`);
  console.log(`Skipped (already present): ${skipped}`);
  console.log(`Output dir: ${SCRAPED_DIR}`);
  if (missing.length > 0) {
    console.error(`❌ Missing after bootstrap: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (hydrated > 0) {
    console.log(`\n✅ Cold-start bootstrap: ${hydrated} accounts hydrated from bundled data.`);
    console.log(`   Subsequent scrape-incremental will add new posts on top of this baseline.`);
  } else {
    console.log(`\n✅ No bootstrap needed (all ${skipped} scraped files already present).`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
