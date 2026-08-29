import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNTS_IG } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'scraped');
const DELAY_MS = 1500;
const TIMEOUT_MS = 15000;
const MAX_POSTS_PER_ACCOUNT = 50;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function igEmbedPostInfo(shortcode) {
  const url = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!res.ok) return null;
  const html = await res.text();
  const likesMatch = html.match(/([\d,]+)\s+likes/);
  const commentsMatch = html.match(/View all ([\d,]+) comments/);
  const likeCount = likesMatch ? parseInt(likesMatch[1].replace(/,/g, ''), 10) : null;
  const commentCount = commentsMatch ? parseInt(commentsMatch[1].replace(/,/g, ''), 10) : null;
  return { likeCount, commentCount };
}

async function atomicWriteJson(filepath, data) {
  const tmp = filepath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, filepath);
}

async function enrichAccount(account) {
  const startTime = Date.now();
  const outPath = path.join(OUT_DIR, `${account.slug}.json`);
  console.log(`\n[IG-EMBED] @${account.username} — starting`);

  let existing;
  try {
    existing = JSON.parse(await fs.readFile(outPath, 'utf-8'));
  } catch {
    console.log(`  no scraped file, skipping`);
    return { ok: false, error: 'no_file' };
  }

  const posts = existing.posts ?? [];
  console.log(`  loaded ${posts.length} posts`);

  const candidates = posts
    .filter((p) => p.shortcode && (p.likeCount === 0 || p.commentCount === 0))
    .slice(0, MAX_POSTS_PER_ACCOUNT);

  if (candidates.length === 0) {
    console.log(`  no posts need enrichment`);
    return { ok: true, upgraded: 0, total: posts.length };
  }

  console.log(`  enriching ${candidates.length} posts via embed scraper`);
  let upgradedCount = 0;

  for (const post of candidates) {
    const info = await igEmbedPostInfo(post.shortcode);
    if (!info) continue;

    let changed = false;
    if (info.likeCount != null && info.likeCount > (post.likeCount ?? 0)) {
      post.likeCount = info.likeCount;
      changed = true;
    }
    if (info.commentCount != null && info.commentCount > (post.commentCount ?? 0)) {
      post.commentCount = info.commentCount;
      changed = true;
    }
    if (changed) upgradedCount++;
    await sleep(DELAY_MS);
  }

  existing.stats = existing.stats || {};
  existing.stats.lastEmbedEnrichAt = new Date().toISOString();
  existing.stats.embedEnrichAttempted = candidates.length;
  existing.stats.embedEnrichUpgraded = upgradedCount;

  await atomicWriteJson(outPath, existing);
  const sec = Math.round((Date.now() - startTime) / 1000);
  console.log(`[IG-EMBED] @${account.username} — DONE. ${upgradedCount}/${candidates.length} upgraded (${sec}s)`);
  return { ok: true, upgraded: upgradedCount, attempted: candidates.length, total: posts.length };
}

async function main() {
  const args = process.argv.slice(2);
  const onlySlug = args.find((a) => a.startsWith('only='))?.split('=')[1];
  const results = [];
  for (const account of ACCOUNTS_IG) {
    if (onlySlug && account.slug !== onlySlug) continue;
    try {
      const r = await enrichAccount(account);
      results.push({ slug: account.slug, ...r });
    } catch (err) {
      console.error(`[IG-EMBED] @${account.username} — FAILED: ${err.message}`);
      results.push({ slug: account.slug, ok: false, error: err.message });
    }
  }
  console.log(`\n=== IG-EMBED ENRICH COMPLETE ===`);
  console.log('Results:', JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});