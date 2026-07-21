// TITAN V31 — Scrapling IG integration (Pass 1c-IG) Node wrapper
//
// Spawns scrape-ig-scrapling.py to fetch IG posts + profile via Scrapling
// StealthyFetcher, then MAX-merges the result into scraped/<slug>.json.
//
// MAX-merge rules:
//   - per numeric field (likeCount, commentCount, followersCount, ...):
//     take MAX of (existing, new) — never overwrite higher with lower
//   - per string field (caption, postedAt, displayName): FIRST non-null
//     wins (don't overwrite existing)
//
// Per-account safety: one account failure does not block the next.
//
// Usage:
//   node scripts/scrape-ig-scrapling.mjs
//   node scripts/scrape-ig-scrapling.mjs only=ig-majangmejeng_
//   node scripts/scrape-ig-scrapling.mjs only=ig-majangmejeng_ limit=10  (smoke test, fast)
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ACCOUNTS_IG } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRAPED_DIR = path.join(__dirname, 'scraped');
const PYTHON = 'C:/Users/Syahfalah/AppData/Local/Programs/Python/Python314/python.exe';
const PY_SCRIPT = path.join(__dirname, 'scrape-ig-scrapling.py');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseArgv(argv) {
  return Object.fromEntries(
    argv.filter(a => a.includes('=')).map(a => {
      const idx = a.indexOf('=');
      return [a.slice(0, idx), a.slice(idx + 1)];
    })
  );
}

function pickMax(prev, next) {
  return (next ?? 0) > (prev ?? 0) ? next : prev;
}

function pickFirst(prev, next) {
  if (prev) return prev;
  return next || prev;
}

async function runPython(args) {
  return new Promise((resolve) => {
    const proc = spawn(PYTHON, [PY_SCRIPT, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
    proc.on('error', err => resolve({ code: 1, stdout, stderr: String(err) }));
  });
}

async function processAccount(acc) {
  console.log(`\n[Scrapling IG] ${acc.slug}`);
  const scrapedPath = path.join(SCRAPED_DIR, `${acc.slug}.json`);

  let data;
  try {
    const raw = await fs.readFile(scrapedPath, 'utf-8');
    data = JSON.parse(raw);
  } catch (e) {
    console.log(`  SKIP: cannot read scraped/${acc.slug}.json: ${e.message.slice(0, 80)}`);
    return { slug: acc.slug, updated: 0, enriched: 0, totalPosts: 0, profileUpdated: false };
  }

  const allPosts = data.posts ?? [];
  // Write a temp JSON of {shortcode, url} for the Python script
  const postList = allPosts
    .map(p => ({ shortcode: p.shortcode, url: p.postUrl || p.url }))
    .filter(p => p.shortcode && p.url);

  if (postList.length === 0) {
    console.log(`  SKIP: 0 posts with URLs in scraped file`);
    return { slug: acc.slug, updated: 0, enriched: 0, totalPosts: 0, profileUpdated: false };
  }

  // Apply --limit=<N> argv to subset posts (for fast smoke testing).
  // Each StealthyFetcher fetch is 4-6s, so 500 posts = 30-50 minutes.
  // limit=10 = ~1 minute per account, fast enough to verify integration works.
  const argv = parseArgv(process.argv.slice(2));
  const limit = argv.limit ? parseInt(argv.limit, 10) : null;
  const subset = limit ? postList.slice(0, limit) : postList;
  if (limit) {
    console.log(`  limit=${limit} → fetching ${subset.length} of ${postList.length} posts (use --limit=N or omit for full run)`);
  }

  const tmpPath = path.join(os.tmpdir(), `scrapling-${acc.slug}-${Date.now()}.json`);
  await fs.writeFile(tmpPath, JSON.stringify(subset), 'utf-8');

  const profileUrl = `https://www.instagram.com/${acc.username}/`;
  const result = await runPython([
    `slug=${acc.slug}`,
    `account-url=${profileUrl}`,
    `posts-json=${tmpPath}`,
  ]);

  await fs.unlink(tmpPath).catch(() => {});

  if (result.code !== 0) {
    console.log(`  FAIL: Python exit=${result.code} stderr=${result.stderr.slice(0, 200).replace(/\n/g, ' ')}`);
    return { slug: acc.slug, updated: 0, enriched: 0, totalPosts: subset.length, profileUpdated: false };
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (e) {
    console.log(`  FAIL: bad JSON from Python: ${e.message.slice(0, 80)}`);
    return { slug: acc.slug, updated: 0, enriched: 0, totalPosts: subset.length, profileUpdated: false };
  }

  // MAX-merge: posts
  let updated = 0;
  const postMap = new Map((parsed.posts ?? []).map(p => [p.shortcode, p]));
  for (const p of allPosts) {
    const enriched = postMap.get(p.shortcode);
    if (!enriched) continue;
    if ((enriched.likeCount ?? 0) > (p.likeCount ?? 0)) { p.likeCount = enriched.likeCount; updated++; }
    if ((enriched.commentCount ?? 0) > (p.commentCount ?? 0)) { p.commentCount = enriched.commentCount; updated++; }
    if (enriched.caption && !p.caption) { p.caption = enriched.caption; updated++; }
    if (enriched.postedAt && !p.postedAt) { p.postedAt = enriched.postedAt; updated++; }
  }

  // MAX-merge: profile
  let profileUpdated = false;
  if (parsed.profile) {
    if (!data.account) data.account = {};
    const a = data.account;
    const np = parsed.profile;
    // Scraper returns followersCount/followingCount/postsCount; scraped file uses
    // followerCount/followingCount/postCount. Map both names.
    const newFollowers = np.followersCount ?? 0;
    const newFollowing = np.followingCount ?? 0;
    const newPostsCount = np.postsCount ?? 0;
    if (newFollowers > (a.followerCount ?? 0)) { a.followerCount = newFollowers; profileUpdated = true; }
    if (newFollowing > (a.followingCount ?? 0)) { a.followingCount = newFollowing; profileUpdated = true; }
    if (newPostsCount > (a.postCount ?? 0)) { a.postCount = newPostsCount; profileUpdated = true; }
    if (np.displayName && !a.displayName) { a.displayName = np.displayName; profileUpdated = true; }
  }

  await fs.writeFile(scrapedPath, JSON.stringify(data, null, 2), 'utf-8');

  const enrichedCount = (parsed.posts ?? []).length;
  console.log(
    `  OK: ${updated} field updates, profile=${parsed.profile ? 'yes' : 'no'}, posts enriched=${enrichedCount}/${subset.length}`
  );

  return {
    slug: acc.slug,
    updated,
    enriched: enrichedCount,
    totalPosts: subset.length,
    profileUpdated,
  };
}

async function main() {
  const argv = parseArgv(process.argv.slice(2));
  const onlySlug = argv.only;

  const accounts = onlySlug
    ? ACCOUNTS_IG.filter(a => a.slug === onlySlug)
    : ACCOUNTS_IG;

  if (accounts.length === 0) {
    console.error(`No IG accounts matched${onlySlug ? ` (only=${onlySlug})` : ''}`);
    process.exit(1);
  }

  console.log(`=== TITAN V31 Scrapling IG Pass ===`);
  console.log(`Accounts: ${accounts.length}${onlySlug ? ` (only=${onlySlug})` : ''}`);

  let totalUpdated = 0;
  let totalEnriched = 0;
  let totalPosts = 0;
  let profileYes = 0;

  for (const acc of accounts) {
    const r = await processAccount(acc);
    totalUpdated += r.updated;
    totalEnriched += r.enriched;
    totalPosts += r.totalPosts;
    if (r.profileUpdated) profileYes++;
    await sleep(2000); // cooldown between accounts
  }

  console.log(`\n=== Scrapling IG Summary ===`);
  console.log(`Field updates: ${totalUpdated} | Posts enriched: ${totalEnriched}/${totalPosts} | Profile updates: ${profileYes}`);

  if (totalUpdated === 0 && totalEnriched === 0 && profileYes === 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
