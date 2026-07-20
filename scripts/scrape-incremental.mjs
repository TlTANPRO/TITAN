// scrape-incremental.mjs — V11 incremental scraper
// Hemat token: hanya scrape post dengan createTime > latestTimestamp - 1 day
// (1-day safety window untuk catch post yang telat publish atau missed earlier).
// Append-only merge dengan existing data via dedup by post.id.
//
// Usage:
//   node scripts/scrape-incremental.mjs                 # all platforms
//   node scripts/scrape-incremental.mjs --platform=ig  # only Instagram
//   node scripts/scrape-incremental.mjs --platform=tt  # only TikTok
//   node scripts/scrape-incremental.mjs --days=7       # custom window (default 7)
//   node scripts/scrape-incremental.mjs --no-enrich    # skip /media/info enrichment
//
// Behavior:
//   - Baca scraped/{slug}.json → ambil posts[0].timestamp = latestTimestamp
//   - Hapus posts > 7 hari (optional, --prune)
//   - Panggil scrapeAccountIncremental() yang return hanya post baru
//   - Merge + dedup by id, sort by timestamp desc
//   - Atomic write back ke scraped/{slug}.json
//
// Cron recommendation: jalan tiap hari jam 23:00 WIB (16:00 UTC) — see
// .github/workflows/incremental.yml
//
// Cost comparison vs full-scrape (scrape-ig.mjs):
//   - 4 IG × 700 post = 2800 /media/info calls (~16% daily quota)
//   - With incremental: 4 IG × ~5 new post/day = 20 /media/info calls (~0.1%)
//   - 99% hemat token.

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TokenPool, sleep } from './lib/tokenPool.mjs';
import { ACCOUNTS_IG, ACCOUNTS_TT } from './accounts.mjs';

// We import from existing scrapers. To avoid re-implementing normalizePost etc,
// we require both scripts to be importable. The existing scrape-ig.mjs and
// scrape-tt.mjs use top-level `main()` calls — instead, we duplicate the
// minimal fetch logic here. This is intentional: the scrapers are CLI-first
// and refactoring them to be a library is out of scope for V11.
//
// For a long-term cleanup, extract fetchIgProfile/fetchIgPosts/fetchTtProfile
// to scripts/lib/scraper.mjs. See PLAN-titan-Jumat.md "Out of scope".

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'scraped');
const CHUNK_DELAY_MS = 1500;
const DEFAULT_DAYS = 7;
const SAFETY_BUFFER_DAYS = 1; // scrape back N days more than latestTimestamp

// Parse CLI flags
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    platform: 'all', // 'all' | 'ig' | 'tt'
    days: DEFAULT_DAYS,
    noEnrich: false,
    prune: false
  };
  for (const a of args) {
    if (a.startsWith('--platform=')) opts.platform = a.split('=')[1];
    else if (a.startsWith('--days=')) opts.days = parseInt(a.split('=')[1], 10);
    else if (a === '--no-enrich') opts.noEnrich = true;
    else if (a === '--prune') opts.prune = true;
  }
  return opts;
}

// Get latestTimestamp (ms) from existing scraped JSON, or 0 if file missing
async function getLatestTimestamp(slug) {
  const filePath = path.join(OUT_DIR, `${slug}.json`);
  try {
    const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    if (!Array.isArray(data.posts) || data.posts.length === 0) return 0;
    // posts are sorted desc by timestamp in scrape-ig.mjs; take [0]
    return data.posts[0].timestamp ?? 0;
  } catch {
    return 0;
  }
}

// Merge new posts into existing, dedup by id, sort desc
function mergePosts(existing, fresh) {
  const seen = new Set();
  const merged = [];
  for (const p of fresh) {
    if (p.id && !seen.has(p.id)) {
      seen.add(p.id);
      merged.push(p);
    }
  }
  for (const p of existing) {
    if (p.id && !seen.has(p.id)) {
      seen.add(p.id);
      merged.push(p);
    }
  }
  merged.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  return merged;
}

// Atomic write helper (write to .tmp, rename)
async function atomicWriteJson(filepath, data) {
  const tmp = filepath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, filepath);
}

// Prune posts older than cutoffMs (only with --prune flag)
function pruneOldPosts(posts, cutoffMs) {
  return posts.filter((p) => (p.timestamp ?? 0) >= cutoffMs);
}

// ============ Instagram incremental ============
import { ensembledataFetch } from './lib/tokenPool.mjs';

async function fetchIgRecentOnly(account, sinceTimestamp, tokenPool) {
  // Call /user/posts with smaller depth — only need recent posts since sinceTimestamp
  // We use depth=20 (covers ~7 days for active accounts, ~30 for slow ones)
  // If we find posts older than sinceTimestamp, we stop early.
  const depth = 20;

  // 1. Get profile for user_id
  const basicResult = await ensembledataFetch('instagram', '/user/info', { username: account.username }, tokenPool);
  const basicData = basicResult?.data;
  if (!basicData) throw new Error(`No data in profile response for @${account.username}`);
  const user = (basicData.user ?? basicData);
  const userId = String(user.pk ?? user.id ?? '');
  if (!userId) throw new Error(`No pk for @${account.username}`);

  // 2. Get recent posts
  const postsResult = await ensembledataFetch('instagram', '/user/posts', { user_id: userId, depth: String(depth) }, tokenPool);
  const data = postsResult?.data;
  if (!data) return { newPosts: [], profile: null };

  let rawPosts = [];
  if (Array.isArray(data)) {
    rawPosts = data;
  } else {
    const items = data.items ?? data.edges ?? data.posts;
    if (Array.isArray(items)) {
      rawPosts = items.map((item) => (item && typeof item === 'object') ? (item.node ?? item) : {});
    }
  }

  // 3. Filter: only posts with timestamp > sinceTimestamp (with safety buffer)
  const cutoff = sinceTimestamp - SAFETY_BUFFER_DAYS * 86400_000;
  const fresh = [];
  for (const p of rawPosts) {
    const t = Number(p.taken_at ?? p.taken_at_timestamp ?? p.timestamp ?? 0) * 1000;
    if (t > cutoff) fresh.push(p);
  }

  return { newPosts: fresh, profile: user };
}

async function enrichIgRecent(posts, tokenPool) {
  // Same as enrichIgMediaInfo but only for new posts
  const enriched = [];
  for (let i = 0; i < posts.length; i++) {
    const post = posts;
    if (!post.shortcode) {
      enriched.push(post);
      continue;
    }
    try {
      const r = await ensembledataFetch('instagram', '/media/info', { code: post.shortcode }, tokenPool);
      const data = r?.data;
      let media = null;
      if (Array.isArray(data)) media = data[0];
      else if (data) media = data.media ?? data.items?.[0] ?? data;
      if (media && typeof media === 'object') {
        if (typeof media.like_count === 'number') post.likeCount = media.like_count;
        else if (typeof media.likeCount === 'number') post.likeCount = media.likeCount;
        if (typeof media.comment_count === 'number') post.commentCount = media.comment_count;
        else if (typeof media.commentCount === 'number') post.commentCount = media.commentCount;
        if (typeof media.view_count === 'number') post.viewCount = media.view_count;
        else if (typeof media.viewCount === 'number') post.viewCount = media.viewCount;
        else if (typeof media.play_count === 'number') post.viewCount = media.play_count;
        else if (typeof media.playCount === 'number') post.viewCount = media.playCount;
      }
    } catch (err) {
      // Soft fail — like/comment/view stay 0
    }
    enriched.push(post);
    await sleep(750);
  }
  return enriched;
}

// Reuse the same normalizePost logic from scrape-ig.mjs
function normalizePostIg(post) {
  // Mirrors scrape-ig.mjs normalizePost
  const id = String(post.id ?? post.pk ?? post.shortcode ?? '');
  const shortcode = post.shortcode ?? post.code ?? id;
  const likeCount = Number(post.edge_liked_by?.count ?? post.like_count ?? post.likeCount ?? 0);
  const commentCount = Number(post.edge_media_to_comment?.count ?? post.comment_count ?? post.commentCount ?? 0);

  let caption = '';
  const captionRaw = post.caption ?? post.accessibility_caption;
  if (typeof captionRaw === 'string') caption = captionRaw;
  else if (captionRaw && typeof captionRaw === 'object') caption = String(captionRaw.text ?? '');
  else caption = post.edge_media_to_caption?.edges?.[0]?.node?.text ?? '';

  const createTime = Number(post.taken_at ?? post.taken_at_timestamp ?? post.timestamp ?? 0);
  const displayUrl = post.display_url ?? post.displayUrl;
  const thumbnailSrc = post.thumbnail_src ?? post.thumbnailUrl;

  const extractHashtags = (text) => {
    const m = String(text).matchAll(/#([\p{L}0-9_]+)/gu);
    return [...m].map((x) => '#' + x[1].toLowerCase());
  };
  const extractMentions = (text) => {
    const m = String(text).matchAll(/@([\w.]+)/g);
    return [...m].map((x) => '@' + x[1].toLowerCase());
  };

  let viewCount = 0;
  if (typeof post.video_view_count === 'number') viewCount = post.video_view_count;
  else if (typeof post.videoViewCount === 'number') viewCount = post.videoViewCount;
  else if (typeof post.view_count === 'number') viewCount = post.view_count;
  else if (typeof post.playCount === 'number') viewCount = post.playCount;

  let mediaType = 'IMAGE';
  const mt = post.media_type ?? post.mediaType;
  if (typeof mt === 'number') {
    if (mt === 1) mediaType = 'IMAGE';
    else if (mt === 2) mediaType = post.product_type === 'clips' ? 'REEL' : 'VIDEO';
    else if (mt === 8) mediaType = 'CAROUSEL_ALBUM';
  } else if (typeof mt === 'string') mediaType = mt.toUpperCase();
  else if (post.is_video === true || post.isVideo === true) mediaType = 'VIDEO';

  return {
    id,
    shortcode,
    caption,
    createTime,
    timestamp: createTime * 1000,
    thumbnailUrl: displayUrl || thumbnailSrc || '',
    postUrl: `https://www.instagram.com/p/${shortcode}/`,
    mediaType,
    isVideo: post.is_video === true || post.isVideo === true,
    likeCount,
    commentCount,
    viewCount,
    saveCount: Number(post.saved_count ?? post.save_count ?? 0),
    durationSeconds: Number(post.video_duration ?? post.videoDuration ?? 0),
    hashtags: extractHashtags(caption),
    mentions: extractMentions(caption)
  };
}

async function incrementalIg(account, opts, tokenPool) {
  const slug = account.slug;
  const outPath = path.join(OUT_DIR, `${slug}.json`);

  // Load existing
  let existing = { posts: [], account: {}, platform: 'instagram' };
  try {
    existing = JSON.parse(await fs.readFile(outPath, 'utf-8'));
  } catch {}

  const sinceMs = (existing?.posts?.[0]?.timestamp ?? 0);
  const sinceDays = sinceMs > 0
    ? Math.round((Date.now() - sinceMs) / 86400_000)
    : opts.days;

  console.log(`[IG] @${account.username} — incremental from ${sinceMs > 0 ? `${sinceDays}d ago` : 'scratch'}`);

  const { newPosts, profile } = await fetchIgRecentOnly(account, sinceMs, tokenPool);
  if (newPosts.length === 0) {
    console.log(`[IG] @${account.username} — 0 new posts, skipping`);
    return { slug, ok: true, added: 0, total: existing.posts.length };
  }

  let normalized = newPosts.map(normalizePostIg).filter((p) => p.id);

  if (!opts.noEnrich) {
    normalized = await enrichIgRecent(normalized, tokenPool);
  }

  // Update profile stats if changed
  const updatedAccount = existing.account && profile
    ? { ...existing.account, followerCount: profile.edge_followed_by?.count ?? existing.account.followerCount }
    : existing.account;

  // Merge
  let merged = mergePosts(existing.posts ?? [], normalized);

  // Optional prune: keep only posts within window
  if (opts.prune) {
    const cutoffMs = Date.now() - opts.days * 86400_000;
    merged = pruneOldPosts(merged, cutoffMs);
  }

  // Update postCount to follow actual merged length
  const out = {
    ...existing,
    platform: 'instagram',
    account: { ...updatedAccount, postCount: merged.length },
    posts: merged,
    scrapedAt: new Date().toISOString(),
    incremental: true,
    lastIncrementalAt: new Date().toISOString(),
    addedThisRun: normalized.length,
    stats: {
      ...(existing.stats ?? {}),
      totalPosts: merged.length,
      isDummy: false,
      enriched: !opts.noEnrich,
      lastIncrementalAdded: normalized.length
    }
  };

  await atomicWriteJson(outPath, out);
  console.log(`[IG] @${account.username} — added ${normalized.length}, total ${merged.length}`);
  return { slug, ok: true, added: normalized.length, total: merged.length };
}

// ============ TikTok incremental (placeholder — reuse scrape-tt.mjs pattern) ============
// For V11 MVP, TT incremental reuses the same /user/posts pattern via TikWM.
// We import from scrape-tt.mjs if it exposes fetchTtRecent; if not, we run
// the full-scrape (acceptable since TT has fewer posts per call).
async function incrementalTt(account, opts, tokenPool) {
  // V11 simplified: invoke scrape-tt.mjs but with a small depth (--depth flag).
  // The existing scrape-tt.mjs doesn't accept --depth, so we call it once
  // and rely on dedup at validate-merge.mjs to skip existing posts.
  // For a real incremental, would need a separate fetchTtRecentOnly() function.
  // TODO: refactor scrape-tt.mjs to expose fetchTtRecentOnly (Out of scope for V11).

  const slug = account.slug;
  const outPath = path.join(OUT_DIR, `${slug}.json`);

  let existing = { posts: [], account: {}, platform: 'tiktok' };
  try {
    existing = JSON.parse(await fs.readFile(outPath, 'utf-8'));
  } catch {}

  // For now, use lastTimestamp as marker but re-fetch recent 30 posts via
  // the existing scraper. Cheaper than full-scrape (was 50+ per account).
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);
  try {
    await exec('node', [path.join(__dirname, 'scrape-tt.mjs'), `only=${slug}`], {
      env: { ...process.env, TITAN_INCREMENTAL: '1' }
    });
  } catch (err) {
    console.error(`[TT] @${account.username} — scrape failed: ${err.message}`);
    return { slug, ok: false, error: err.message };
  }

  // Re-read and compare
  const updated = JSON.parse(await fs.readFile(outPath, 'utf-8'));
  const added = (updated.posts?.length ?? 0) - (existing.posts?.length ?? 0);
  console.log(`[TT] @${account.username} — added ${added}, total ${updated.posts?.length}`);
  return { slug, ok: true, added, total: updated.posts?.length };
}

// ============ Main ============
async function main() {
  const opts = parseArgs();
  await fs.mkdir(OUT_DIR, { recursive: true });
  // V27.16: if ENSEMBLEDATA is skipped, exit cleanly so the workflow
  // pipeline (validate → generate → deploy) still runs. Bootstrap will
  // use the existing bundled data; no new posts will be collected.
  if (process.env.ENSEMBLEDATA_TOKENS_SKIP === 'true') {
    console.log('[INCREMENTAL] ⚠️  ENSEMBLEDATA_TOKENS_SKIP=true — scraping skipped, no new posts will be added.');
    console.log('[INCREMENTAL] Bootstrap will use existing bundled data; pipeline continues with current state.');
    return;
  }
  const tokenPool = new TokenPool();

  const targets = [];
  if (opts.platform === 'all' || opts.platform === 'ig') {
    for (const a of ACCOUNTS_IG) targets.push({ ...a, platform: 'instagram' });
  }
  if (opts.platform === 'all' || opts.platform === 'tt') {
    for (const a of ACCOUNTS_TT) targets.push({ ...a, platform: 'tiktok' });
  }

  console.log(`\n=== INCREMENTAL SCRAPE (window=${opts.days}d, platform=${opts.platform}) ===`);
  console.log(`Targets: ${targets.length} akun\n`);

  const results = [];
  for (const account of targets) {
    if (tokenPool.isAllExhausted()) {
      console.log('All tokens exhausted, stopping');
      break;
    }
    try {
      const r = account.platform === 'instagram'
        ? await incrementalIg(account, opts, tokenPool)
        : await incrementalTt(account, opts, tokenPool);
      results.push(r);
    } catch (err) {
      console.error(`[${account.platform.toUpperCase()}] @${account.username} — FAILED: ${err.message}`);
      results.push({ slug: account.slug, ok: false, error: err.message });
    }
    await sleep(CHUNK_DELAY_MS);
  }

  const totalAdded = results.reduce((acc, r) => acc + (r.added ?? 0), 0);
  const totalSkipped = results.filter((r) => r.added === 0).length;
  const failed = results.filter((r) => !r.ok);

  console.log(`\n=== INCREMENTAL DONE ===`);
  console.log(`Added: ${totalAdded} new posts across ${results.length} accounts`);
  console.log(`Skipped (no new posts): ${totalSkipped}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Token pool: ${JSON.stringify(tokenPool.stats())}`);

  // Exit 0 if anything succeeded or no new posts. Exit 1 only if all failed.
  const anyOk = results.some((r) => r.ok);
  process.exit(anyOk ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
