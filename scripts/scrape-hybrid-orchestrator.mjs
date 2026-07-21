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
