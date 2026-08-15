// prebuild: copy src/data/*.json → public/data/*.json
//
// Why: Vite imports src/data/accounts-full.json into a large JS chunk. But
// the Cloudflare Worker /data/ fetcher (and Komentar Admin UI) expects static
// JSON files at the site root. Vite auto-copies anything in `public/` to
// `dist/`, so we stage copies in `public/data/` before `vite build` runs.
//
// Loop over every JSON file in src/data/ — auto-handles new datasets such as
// admin-comments.json without script edits.
//
// Cost: large datasets are shipped twice (once in JS chunk, once as static
// JSON). Acceptable for the marketing-intelligence use case; we keep both
// because:
//   - JS import = guaranteed offline (PWA service worker caches the chunk)
//   - Static JSON = Worker / public assets can read for soft-refresh metadata
//     without re-importing the whole bundle
//
// Run automatically via `prebuild` in package.json. Safe to re-run.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, '..', 'src', 'data');
const DEST_DIR = path.join(__dirname, '..', 'public', 'data');

async function main() {
  await fs.mkdir(DEST_DIR, { recursive: true });

  let entries;
  try {
    entries = await fs.readdir(SRC_DIR);
  } catch (err) {
    console.warn(`[prebuild] ${SRC_DIR} not readable, skipping copy.`);
    return;
  }

  const jsonFiles = entries.filter((f) => f.endsWith('.json'));
  if (jsonFiles.length === 0) {
    console.warn(`[prebuild] no JSON files in ${SRC_DIR}, nothing to copy.`);
    return;
  }

  for (const file of jsonFiles) {
    const src = path.join(SRC_DIR, file);
    const dest = path.join(DEST_DIR, file);
    try {
      const stat = await fs.stat(src);
      await fs.copyFile(src, dest);
      const sizeKB = (stat.size / 1024).toFixed(1);
      console.log(`[prebuild] ${src} (${sizeKB} KB) → ${dest}`);
    } catch (err) {
      console.warn(`[prebuild] skip ${src}: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error('[prebuild] failed:', err);
  process.exit(1);
});
