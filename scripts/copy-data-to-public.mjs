// prebuild: copy src/data/accounts-full.json → public/data/accounts-full.json
//
// Why: Vite imports src/data/accounts-full.json into a 6.6MB JS chunk. But the
// Cloudflare Worker V11 (and any future /data/ fetcher) expects a static JSON
// file at the site root. Vite auto-copies anything in `public/` to `dist/`,
// so we stage a copy in `public/data/` before `vite build` runs.
//
// Cost: data is shipped twice (once in JS chunk, once as static JSON) → ~14MB
// of data on Pages. Acceptable for the marketing-intelligence use case; we
// keep both because:
//   - JS import = guaranteed offline (PWA service worker caches the chunk)
//   - Static JSON = Worker can read for soft-refresh metadata without
//     re-importing the whole bundle
//
// Run automatically via `prebuild` in package.json. Safe to re-run.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'src', 'data', 'accounts-full.json');
const DEST_DIR = path.join(__dirname, '..', 'public', 'data');
const DEST = path.join(DEST_DIR, 'accounts-full.json');

async function main() {
  try {
    await fs.access(SRC);
  } catch {
    console.warn(`[prebuild] ${SRC} not found, skipping copy. Run \`pnpm generate\` first.`);
    return;
  }

  await fs.mkdir(DEST_DIR, { recursive: true });
  const stat = await fs.stat(SRC);
  await fs.copyFile(SRC, DEST);

  const sizeMB = (stat.size / 1024 / 1024).toFixed(2);
  console.log(`[prebuild] ${SRC} (${sizeMB} MB) → ${DEST}`);
}

main().catch((err) => {
  console.error('[prebuild] failed:', err);
  process.exit(1);
});
