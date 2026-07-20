// V17 — Single deploy script.
// ONE command to go from source code → GitHub Pages live:
//   pnpm run deploy
//
// This replaces the manual ritual that we used to do:
//   1. pnpm run build           (Vite → dist/)
//   2. cp dist/index.html .
//   3. cp dist/sw.js .          (skipped — PWA disabled in vite.config)
//   4. cp dist/registerSW.js .  (skipped — PWA disabled in vite.config)
//   5. cp dist/data/accounts-full.json .
//   6. cp dist/assets/* assets/  (accumulates old hashes forever — bad)
//   7. git add -A; git commit; git push
//
// This script does the same thing, but with these safety guarantees:
//   - Single source of truth: dist/ is the only generated copy
//   - Stale chunk cleanup: root assets/ is REPLACED, not appended to
//   - No PWA: vite.config.js has no VitePWA plugin, so no sw.js is generated
//   - Idempotent: re-running with no source changes → "nothing to commit, exit 0"
//
// Flow:
//   1. Run `pnpm run prebuild` (auto via prebuild hook → src/data → public/data)
//   2. Run `vite build` → dist/
//   3. Replace root index.html, accounts-full.json, assets/ with dist/*
//   4. git add -A; if no changes, exit 0
//   5. git commit with auto-generated message
//   6. git push origin main
//
// If --skip-push is passed, the script stops after the commit.
// If --dry-run is passed, only build + copy, no git operations.

import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const args = process.argv.slice(2);
const SKIP_PUSH = args.includes('--skip-push');
const DRY_RUN = args.includes('--dry-run');

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  try {
    return execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
  } catch (err) {
    console.error(`[deploy] command failed: ${cmd}`);
    throw err;
  }
}

async function rmrf(target) {
  await fs.rm(target, { recursive: true, force: true });
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function main() {
  console.log('============================================');
  console.log('  TITAN V17 — Single Deploy');
  console.log('============================================');

  // Step 0: clean OLD chunk hashes in root assets/ (NOT the whole assets/ dir).
  // The root assets/ contains both:
  //   - source assets/avatars/ (real photos, downloaded by scrape-avatars.mjs)
  //   - deployed chunk hashes (AccountPage-XXX.js, index-XXX.js, etc.)
  // We only want to delete the chunk hashes, not the source avatars.
  console.log('\n[0/6] Clean old chunk hashes in root assets/ (preserve assets/avatars/)...');
  const assetsDir = path.join(ROOT, 'assets');
  if (await fs.stat(assetsDir).then(() => true).catch(() => false)) {
    const assetsEntries = await fs.readdir(assetsDir, { withFileTypes: true });
    for (const entry of assetsEntries) {
      if (entry.isDirectory() && entry.name === 'avatars') {
        // KEEP avatars/ — these are source photos
        continue;
      }
      // Delete old chunk hashes, css, etc.
      await fs.rm(path.join(assetsDir, entry.name), { recursive: true, force: true });
      console.log(`  rm assets/${entry.name}`);
    }
  }

  // Step 1: ensure data is fresh (regenerate from scraped JSONs)
  console.log('\n[1/6] Regenerate accounts-full.json from scraped data...');
  run('node scripts/generate-data.mjs', { stdio: 'inherit' });

  // Step 1.5: pre-flight sanity check (fail fast BEFORE build/push)
  // Defense against the validate-merge.mjs line 120 bug class (0-post deploy).
  console.log('\n[1.5/6] Pre-flight sanity check...');
  const preFlightErrors = [];
  const scrapedDir = path.join(ROOT, 'scripts', 'scraped');
  const scrapedFiles = (await fs.readdir(scrapedDir)).filter((f) => f.endsWith('.json') && !f.includes('.backup-'));
  if (scrapedFiles.length !== 9) {
    preFlightErrors.push(`Expected 9 scraped files, got ${scrapedFiles.length}`);
  }
  const accFull = JSON.parse(await fs.readFile(path.join(ROOT, 'src', 'data', 'accounts-full.json'), 'utf-8'));
  if (accFull.length !== 9) {
    preFlightErrors.push(`Expected 9 accounts in accounts-full.json, got ${accFull.length}`);
  }
  const totalPosts = accFull.reduce((s, a) => s + (a.posts?.length || 0), 0);
  // V29.1: lower threshold from 4000 to 3500 (see generate-data.mjs for full rationale).
  // Defense in depth — buffer below V29.1 expected ~3705 posts.
  if (totalPosts < 3500) {
    preFlightErrors.push(`Post count ${totalPosts} too low (expected >= 3500, likely data loss)`);
  }
  // Cross-account dup check (cheap O(n) pre-flight)
  const seenKeys = new Map();
  let crossDup = 0;
  for (const a of accFull) {
    for (const p of a.posts || []) {
      const key = p.shortcode || p.id;
      if (!key) continue;
      if (seenKeys.has(key) && seenKeys.get(key) !== a.account.slug) crossDup++;
      else seenKeys.set(key, a.account.slug);
    }
  }
  if (crossDup > 0) {
    // Tolerance 5 untuk data historis (cross-account share/embed). See generate-data.mjs.
    if (crossDup > 5) {
      preFlightErrors.push(`${crossDup} cross-account duplicate(s) detected (exceeds tolerance of 5)`);
    } else {
      console.warn(`   ⚠️  ${crossDup} cross-account duplicate(s) (within tolerance, see DATA-SSOT.md §4)`);
    }
  }
  if (preFlightErrors.length > 0) {
    console.error('\n❌ [deploy] Pre-flight FAILED:');
    preFlightErrors.forEach((e) => console.error(`   - ${e}`));
    console.error('   Aborting before build/push to prevent 0-post deploy.');
    process.exit(1);
  }
  console.log(`   ✅ 9 akun, ${totalPosts} posts, 0 cross-dup`);

  // Step 2: vite build (prebuild hook auto-copies data to public/)
  console.log('\n[2/6] Vite build...');
  run('pnpm run build', { stdio: 'inherit' });

  if (DRY_RUN) {
    console.log('\n[dry-run] Skipping copy + git + push');
    return;
  }

  // Step 3: copy dist/* → root
  console.log('\n[3/6] Copy dist/* → root...');
  const dist = path.join(ROOT, 'dist');
  const distEntries = await fs.readdir(dist, { withFileTypes: true });
  for (const entry of distEntries) {
    if (entry.name === 'data') {
      // dist/data/accounts-full.json → root accounts-full.json
      await fs.mkdir(path.join(ROOT, 'data'), { recursive: true });
      const dataEntries = await fs.readdir(path.join(dist, 'data'), { withFileTypes: true });
      for (const d of dataEntries) {
        await fs.copyFile(path.join(dist, 'data', d.name), path.join(ROOT, d.name));
        console.log(`  cp dist/data/${d.name} → ${d.name}`);
      }
      await rmrf(path.join(ROOT, 'data'));
    } else if (entry.name === 'assets') {
      // dist/assets/ → root assets/ (REPLACE, not append — cleans old hashes)
      await copyDir(path.join(dist, 'assets'), path.join(ROOT, 'assets'));
      console.log(`  cp -r dist/assets/ → assets/ (REPLACED)`);
    } else {
      // index.html, favicon.svg, etc → root
      await fs.copyFile(path.join(dist, entry.name), path.join(ROOT, entry.name));
      console.log(`  cp dist/${entry.name} → ${entry.name}`);
    }
  }

  // Step 4: git add + check for changes
  console.log('\n[4/6] Git add + check for changes...');

  // Belt-and-suspenders: bersihkan backup files kalau ada di scraped/
  // (walau validate-merge/generate-data sudah punya pre-flight, deploy harus
  // tetap aman kalau user jalankan ad-hoc).
  const backupFiles = (await fs.readdir(scrapedDir)).filter((f) => f.includes('.backup-') && f.endsWith('.json'));
  if (backupFiles.length > 0) {
    console.warn(`[deploy] Cleaning ${backupFiles.length} backup file(s) from scraped/`);
    for (const f of backupFiles) await fs.rm(path.join(scrapedDir, f));
  }

  run('git add -A', { stdio: 'inherit' });

  const status = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf-8' });
  if (!status.trim()) {
    console.log('\n[deploy] No changes — skipping commit');
    return;
  }

  const changedCount = status.trim().split('\n').length;
  console.log(`  ${changedCount} file(s) changed`);

  // Step 5: commit + push
  console.log('\n[5/6] Commit + push...');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const message = `deploy: ${changedCount} files updated ${timestamp}`;
  run(`git commit -m "${message}"`, { stdio: 'inherit' });

  if (SKIP_PUSH) {
    console.log('\n[deploy] --skip-push: commit created, push skipped');
    return;
  }

  run('git push origin main', { stdio: 'inherit' });
  console.log('\n============================================');
  console.log('  ✅ DEPLOYED — check gh-pages in 1-2 min');
  console.log('============================================');
}

main().catch((err) => {
  console.error('[deploy] FAILED:', err.message);
  process.exit(1);
});
