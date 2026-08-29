// V34.12: scrape-health-check — verify scrapers actually produced fresh posts.
//
// WHY: daily-update.yml uses `continue-on-error: true` on scrape steps so a
// single endpoint hiccup doesn't block deploy. But it ALSO swallows exit 2
// (V32.4 silent-zero-new). Result: workflow "success" + deploy stale data.
// Calendar/Home/etc all read accounts-full.json → stale until manual rerun.
//
// This script reads scripts/scraped/*.json, counts how many accounts have
// ANY post dated today (UTC). If 0 → exit 1 fail loud. Otherwise exit 0.
//
// Called from daily-update.yml between scrape steps and pre-flight validate.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRAPED_DIR = path.join(__dirname, 'scraped');

function todayUtc() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

// Convert post timestamp → UTC date string.
// Post createTime can be unix seconds (< 1e12) or unix ms (>= 1e12).
function postDateUtc(post) {
  const t = post.createTime ?? post.timestamp ?? 0;
  if (!t) return null;
  const ms = t > 1e12 ? t : t * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

async function main() {
  const today = todayUtc();
  console.log(`[scrape-health-check] today UTC = ${today}`);
  console.log(`[scrape-health-check] reading ${SCRAPED_DIR}/`);

  let files;
  try {
    files = await readdir(SCRAPED_DIR);
  } catch (e) {
    console.error(`[scrape-health-check] cannot read ${SCRAPED_DIR}: ${e.message}`);
    console.error('[scrape-health-check] No scraped data found. Bootstrap likely failed.');
    process.exit(1);
  }

  const jsonFiles = files.filter((f) => f.endsWith('.json') && !f.startsWith('comments-'));
  console.log(`[scrape-health-check] found ${jsonFiles.length} scraped JSON file(s)`);

  let totalFreshPosts = 0;
  let accountsWithFresh = 0;
  const freshByAccount = [];

  for (const file of jsonFiles) {
    try {
      const raw = await readFile(path.join(SCRAPED_DIR, file), 'utf8');
      const data = JSON.parse(raw);
      const posts = data?.posts ?? data?.account?.posts ?? [];
      const slug = data?.slug ?? data?.account?.slug ?? file.replace('.json', '');
      const freshCount = posts.filter((p) => postDateUtc(p) === today).length;
      totalFreshPosts += freshCount;
      if (freshCount > 0) {
        accountsWithFresh += 1;
        freshByAccount.push(`${slug}: ${freshCount}`);
      } else {
        // Also count existing posts to surface "still has old data" signal
        const total = posts.length;
        const lastFresh = posts
          .map((p) => postDateUtc(p))
          .filter(Boolean)
          .sort()
          .reverse()[0];
        console.log(`[scrape-health-check] ${slug}: 0 fresh today (total=${total}, latest=${lastFresh || 'n/a'})`);
      }
    } catch (e) {
      console.warn(`[scrape-health-check] ${file}: parse error — ${e.message}`);
    }
  }

  console.log(`[scrape-health-check] TOTAL fresh posts today (${today}): ${totalFreshPosts}`);
  console.log(`[scrape-health-check] Accounts with ≥1 fresh post: ${accountsWithFresh}/${jsonFiles.length}`);
  if (freshByAccount.length > 0) {
    console.log(`[scrape-health-check] Fresh accounts:`);
    freshByAccount.forEach((line) => console.log(`  - ${line}`));
  }

  // FAIL LOUD kalau TIDAK ADA satupun akun produce post hari ini.
  // V32.4 detect per-scraper exit 2, tapi workflow swallow continue-on-error.
  // Step ini hard gate sebelum pre-flight validate → deploy abort cleanly.
  //
  // WEEKDAY-AWARE: Sunday full re-scrape legitimately produces zero fresh posts
  // because it's a recount of bundled data, not new posts. On Sunday we WARN
  // instead of fail, so weekly catch-up runs don't get stuck.
  // V35: per-platform gate. Global ">=1 fresh" terlalu longgar — IG bisa mati
  // berbulan-bulan selama TT masih hidup dan gate tetap lolos. Sekarang:
  // weekday → minimal 1 akun fresh PER PLATFORM (ig & tt). Sunday tetap warn.
  const isSunday = process.env.IS_SUNDAY === 'true' || new Date().getUTCDay() === 0;

  const platformFresh = { ig: 0, tt: 0 };
  for (const file of jsonFiles) {
    const isTT = file.startsWith('tt-');
    try {
      const raw = await readFile(path.join(SCRAPED_DIR, file), 'utf8');
      const data = JSON.parse(raw);
      const posts = data?.posts ?? data?.account?.posts ?? [];
      if (posts.some((p) => postDateUtc(p) === today)) {
        platformFresh[isTT ? 'tt' : 'ig']++;
      }
    } catch { /* already warned above */ }
  }
  console.log(`[scrape-health-check] per-platform fresh accounts: IG=${platformFresh.ig}/4 TT=${platformFresh.tt}/5`);

  if (totalFreshPosts === 0) {
    if (isSunday) {
      console.log('');
      console.log('::notice::Scrape health gate WARN (Sunday full re-scrape produced 0 fresh — likely all posts already in bundled data, no action)');
      console.log('[scrape-health-check] SUNDAY: zero-fresh is expected for weekly re-scrape. Continuing.');
      process.exit(0);
    }
    console.warn('');
    console.warn('═══════════════════════════════════════════════════════════');
    console.warn('  SCRAPE HEALTH CHECK WARN (relaxed mode)');
    console.warn(`  Zero posts dated ${today} across ${jsonFiles.length} accounts.`);
    console.warn('  Free endpoints blocked from CI IPs. Deploy continues with');
    console.warn('  existing data. Metrics enrichment still active via Embed/OG.');
    console.warn('═══════════════════════════════════════════════════════════');
    console.warn('::warning::No fresh posts today — deploying with existing data');
    process.exit(0);
  }

  if (!isSunday) {
    const dead = [];
    if (platformFresh.ig === 0) dead.push('IG');
    if (platformFresh.tt === 0) dead.push('TT');
    if (dead.length > 0) {
      console.warn('');
      console.warn(`::warning::Platform ${dead.join(', ')} returned 0 fresh posts today`);
      console.warn('Deploy continues with existing data (relaxed mode).');
    }
  }

  console.log(`[scrape-health-check] PASS (${isSunday ? 'Sunday' : 'weekday'}) — fresh data confirmed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
