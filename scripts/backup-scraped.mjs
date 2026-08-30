// backup-scraped.mjs — Dated snapshot of raw scraped JSON before processing/deploy.
//
// WHY: If a downstream step (generate/aggregate/deploy) misses or corrupts data,
// we can diff against the raw scrape instead of re-scraping (re-scrape risks
// IG feed cache / throttle / errors). Kept local-only under scripts/scraped/
// which is .gitignore'd, so it never bloats the repo or gh-pages.
//
// Usage:
//   node scripts/backup-scraped.mjs            # default date folder
//   node scripts/backup-scraped.mjs date=...   # explicit YYYY-MM-DD (idempotent)
//   node scripts/backup-scraped.mjs force=1    # overwrite existing same-date folder
//
// Copies scripts/scraped/*.json (NOT subfolders, NOT .tmp) into
// scripts/scraped/backup-YYYY-MM-DD/. Skips existing files unless force=1.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRAPED = path.join(__dirname, 'scraped');

function dateFolder() {
  const a = process.argv.find((x) => x.startsWith('date='));
  if (a) return a.split('=')[1];
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const force = process.argv.includes('force=1');
  const date = dateFolder();
  const destDir = path.join(SCRAPED, `backup-${date}`);

  const entries = await fs.readdir(SCRAPED, { withFileTypes: true });
  const files = entries.filter(
    (e) => e.isFile() && e.name.endsWith('.json') && !e.name.endsWith('.tmp')
  );
  if (files.length === 0) {
    console.log('[backup-scraped] no scraped *.json to back up');
    return;
  }

  await fs.mkdir(destDir, { recursive: true });
  let copied = 0;
  let skipped = 0;
  for (const f of files) {
    const src = path.join(SCRAPED, f.name);
    const dest = path.join(destDir, f.name);
    let exists = false;
    try { await fs.access(dest); exists = true; } catch { exists = false; }
    if (exists && !force) { skipped++; continue; }
    await fs.copyFile(src, dest);
    copied++;
  }
  console.log(`[backup-scraped] ${copied} file(s) → ${path.relative(process.cwd(), destDir)} (${skipped} skipped, force=${force})`);
}

main().catch((err) => {
  console.error('[backup-scraped] fatal:', err.message);
  process.exit(2);
});
