#!/usr/bin/env node
/**
 * enrich-ig-postdetails.mjs
 *
 * Targeted enrichment: fill likeCount / commentCount / viewCount for IG posts
 * that still have 0 (or low) values, using ENSEMBLEDATA /post/details endpoint
 * (NOT /media/info which returns 404 on this API).
 *
 * Endpoint: GET https://ensembledata.com/apis/instagram/post/details?code=SHORTCODE&token=X
 * Response: { data: { edge_media_preview_like.count, edge_media_to_comment.count, video_play_count } }
 *
 * Fields filled (MAX merge, never overwrite):
 *   - likeCount   ← edge_media_preview_like.count
 *   - commentCount ← edge_media_to_comment.count
 *   - viewCount   ← video_play_count (for VIDEO/REEL)
 *   - saveCount   NOT exposed (skip)
 *
 * Idempotent: safe to re-run, MAX pattern preserves higher values.
 * Rate limit: 750ms between calls.
 *
 * Usage:
 *   node scripts/enrich-ig-postdetails.mjs                    # all 4 IG accounts
 *   node scripts/enrich-ig-postdetails.mjs only=ig-ardiantanah  # one account
 *   node scripts/enrich-ig-postdetails.mjs only-zero            # only posts with view=0
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, globSync } from 'fs';
import { TokenPool, ensembledataFetch, sleep } from './lib/tokenPool.mjs';

const args = process.argv.slice(2);
const onlySlug = args.find((a) => a.startsWith('only='))?.split('=')[1];
const onlyZero = args.includes('only-zero');
const IG_DIR = 'scripts/scraped';

const tokenPool = new TokenPool();

function loadScrapedFiles() {
  const files = globSync(`${IG_DIR}/ig-*.json`);
  if (onlySlug) {
    return files.filter((f) => f.includes(`${onlySlug}.json`));
  }
  return files;
}

async function enrichPost(post) {
  if (!post.shortcode) return { updated: false, reason: 'no-shortcode' };
  if (onlyZero && (post.viewCount || 0) > 0 && (post.likeCount || 0) > 0) {
    return { updated: false, reason: 'skip-non-zero' };
  }

  try {
    const r = await ensembledataFetch('instagram', '/post/details', { code: post.shortcode }, tokenPool);
    const data = r?.data;
    if (!data || typeof data !== 'object') return { updated: false, reason: 'no-data' };

    const before = { like: post.likeCount || 0, cmt: post.commentCount || 0, view: post.viewCount || 0 };
    const after = { ...before };

    const likeEdge = data.edge_media_preview_like;
    if (likeEdge && typeof likeEdge === 'object' && typeof likeEdge.count === 'number') {
      if (likeEdge.count > after.like) {
        post.likeCount = likeEdge.count;
        after.like = likeEdge.count;
      }
    }
    const cmtEdge = data.edge_media_to_comment;
    if (cmtEdge && typeof cmtEdge === 'object' && typeof cmtEdge.count === 'number') {
      if (cmtEdge.count > after.cmt) {
        post.commentCount = cmtEdge.count;
        after.cmt = cmtEdge.count;
      }
    }
    const playCount = data.video_play_count ?? data.video_view_count;
    if (typeof playCount === 'number' && playCount > after.view) {
      post.viewCount = playCount;
      after.view = playCount;
    }

    const changed = before.like !== after.like || before.cmt !== after.cmt || before.view !== after.view;
    return { updated: changed, before, after };
  } catch (err) {
    return { updated: false, reason: 'error', error: err.message.slice(0, 80) };
  }
}

async function processAccount(filePath) {
  const data = JSON.parse(readFileSync(filePath, 'utf-8'));
  const slug = data.account?.username || filePath.split('/').pop().replace('.json', '');
  const posts = data.posts || [];
  const eligible = onlyZero
    ? posts.filter((p) => (p.viewCount || 0) === 0 || (p.likeCount || 0) === 0)
    : posts.filter((p) => p.shortcode);

  console.log(`\n=== ${slug} (${posts.length} posts, ${eligible.length} eligible) ===`);

  let updatedCount = 0;
  let failCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < eligible.length; i++) {
    const post = eligible[i];
    const r = await enrichPost(post);
    if (r.updated) updatedCount++;
    else if (r.reason === 'error' || r.reason === 'no-data') failCount++;

    if ((i + 1) % 25 === 0) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const rate = ((i + 1) / elapsed).toFixed(2);
      console.log(`  [${i + 1}/${eligible.length}] updated=${updatedCount} fail=${failCount} elapsed=${elapsed}s rate=${rate}/s`);
    }

    await sleep(750);
  }

  // Atomic write
  const tmpPath = filePath + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  writeFileSync(filePath, readFileSync(tmpPath, 'utf-8'), 'utf-8');

  const duration = Math.round((Date.now() - startTime) / 1000);
  console.log(`  → ${slug}: ${updatedCount} updated, ${failCount} failed, ${duration}s`);
  return { slug, updated: updatedCount, failed: failCount, total: posts.length };
}

const files = loadScrapedFiles();
console.log(`Found ${files.length} IG files to process\n`);

const results = [];
for (const f of files) {
  try {
    results.push(await processAccount(f));
  } catch (err) {
    console.error(`Error processing ${f}: ${err.message}`);
  }
}

console.log('\n=== SUMMARY ===');
for (const r of results) {
  console.log(`  ${r.slug}: ${r.updated} updated, ${r.failed} failed, ${r.total} posts`);
}
console.log(`\nToken pool final: ${JSON.stringify({ total: tokenPool.tokens.length, exhausted: tokenPool.exhausted.size, available: tokenPool.tokens.length - tokenPool.exhausted.size })}`);
