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

  // V36: accounts-full.json SSOT lives at REPO ROOT (not src/data — it was
  // removed from the bundle). Copy it explicitly from root.
  const ROOT_SSOT = path.join(__dirname, '..', 'accounts-full.json');
  try {
    const stat = await fs.stat(ROOT_SSOT);
    const dest = path.join(DEST_DIR, 'accounts-full.json');
    await fs.copyFile(ROOT_SSOT, dest);
    console.log(`[prebuild] ${ROOT_SSOT} (${(stat.size / 1024).toFixed(1)} KB) → ${dest}`);
  } catch (err) {
    console.warn(`[prebuild] root SSOT copy failed: ${err.message}`);
  }

  const jsonFiles = entries.filter((f) => f.endsWith('.json'));
  if (jsonFiles.length === 0) {
    console.warn(`[prebuild] no JSON files in ${SRC_DIR}, skipping the src/data copy.`);
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

  // V39: derive manifest.json + per-account split payloads from the root SSOT.
  // The app loads the manifest first so Home can render real freshness numbers
  // before the 12MB full dataset finishes downloading. A manifest failure must
  // NOT block the build: the app falls back to the full dataset.
  try {
    const { spawnSync } = await import('node:child_process');
    const result = spawnSync(process.execPath, [path.join(__dirname, 'build-data-manifest.mjs')], {
      stdio: 'inherit'
    });
    if (result.status !== 0) {
      console.warn('[prebuild] manifest build failed — app will fall back to the full dataset.');
    }
  } catch (err) {
    console.warn(`[prebuild] could not run build-data-manifest.mjs: ${err.message}`);
  }

  // V39: stage the web app manifest into public/ so `dist/` is self-contained.
  // It previously existed only at the repo root, which means `vite preview`
  // served the SPA fallback for /manifest.webmanifest and a local check could
  // not verify the link that scripts/vite-index.template.html declares.
  for (const asset of ['manifest.webmanifest', 'favicon.svg']) {
    const from = path.join(__dirname, '..', asset);
    const to = path.join(__dirname, '..', 'public', asset);
    try {
      await fs.copyFile(from, to);
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn(`[prebuild] could not stage ${asset}: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error('[prebuild] failed:', err);
  process.exit(1);
});
