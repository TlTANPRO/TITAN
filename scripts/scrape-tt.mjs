// TikTok scraper — pakai schema dari TIKTOKSCRAP repo (depth-based, response shape: data.stats, data.user, Object.values untuk posts)
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TokenPool, ensembledataFetch, sleep } from './lib/tokenPool.mjs';
import { ACCOUNTS_TT } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'scraped');
const CHUNK_DELAY_MS = 1500;
const FULL_SCRAPE_DEPTH = 50;

function parseTikTokUsername(input) {
  const trimmed = input.trim();
  return trimmed
    .replace(/^https?:\/\/(www\.)?tiktok\.com\/@/, '')
    .replace(/^@/, '')
    .replace(/\/$/, '')
    .split('/')[0]
    .split('?')[0];
}

function pickAvatarUrl(user) {
  if (!user) return '';
  return (
    user.avatarLarger ||
    user.avatar_larger?.url_list?.[0] ||
    user.avatarMedium ||
    user.avatar_medium?.url_list?.[0] ||
    user.avatarThumb ||
    user.avatar_thumb?.url_list?.[0] ||
    ''
  );
}

function normalizeTtPost(post) {
  const id = String(post.aweme_id ?? '');
  if (!id) return null;
  const stats = post.statistics ?? {};
  const video = post.video ?? {};
  const cover = video.cover;
  const originCover = video.origin_cover;

  // duration dari API dalam ms, convert ke seconds (1 TikTok video biasanya 15-60 detik)
  const durMs = Number(video.duration ?? 0);
  const durSec = durMs / 1000;
  // mediaType: VIDEO kalau ada video dan durasi > 0 detik
  const mediaType = video && durMs > 0 ? 'VIDEO' : 'IMAGE';

  return {
    id,
    description: String(post.desc ?? ''),
    caption: String(post.desc ?? ''),
    createTime: Number(post.create_time ?? 0),
    timestamp: Number(post.create_time ?? 0) * 1000,
    coverUrl: cover?.url_list?.[0] ?? originCover?.url_list?.[0] ?? '',
    // V26: normalize to postUrl (matches IG). Keep videoUrl as alias for
    // backward-compat with existing cached data.
    postUrl: String(post.share_url ?? `https://www.tiktok.com/@${post.author?.unique_id ?? ''}/video/${id}`),
    videoUrl: String(post.share_url ?? `https://www.tiktok.com/@${post.author?.unique_id ?? ''}/video/${id}`),
    playCount: Number(stats.play_count ?? 0),
    diggCount: Number(stats.digg_count ?? 0),
    likeCount: Number(stats.digg_count ?? 0),
    commentCount: Number(stats.comment_count ?? 0),
    shareCount: Number(stats.share_count ?? 0),
    collectCount: Number(stats.collect_count ?? 0),
    saveCount: Number(stats.collect_count ?? 0),
    durationSeconds: durSec,
    duration: durSec,
    mediaType,
    hashtags: extractHashtags(post.desc ?? ''),
    mentions: extractMentions(post.desc ?? ''),
    musicTitle: post.music?.title ?? '',
    musicAuthor: post.music?.author ?? ''
  };
}

function extractHashtags(text) {
  const m = text.matchAll(/#([\p{L}0-9_]+)/gu);
  return [...m].map((x) => '#' + x[1].toLowerCase());
}

function extractMentions(text) {
  const m = text.matchAll(/@([\w.]+)/g);
  return [...m].map((x) => '@' + x[1].toLowerCase());
}

async function fetchTtProfile(username, tokenPool) {
  const result = await ensembledataFetch('tiktok', '/user/info', { username }, tokenPool);
  const data = result?.data;
  if (!data || !data.user) throw new Error(`No data.user in profile for @${username}`);
  const user = data.user;
  const stats = data.stats ?? {};
  return {
    uniqueId: String(user.uniqueId ?? user.unique_id ?? username),
    username: String(user.uniqueId ?? user.unique_id ?? username),
    nickname: String(user.nickname ?? username),
    fullName: String(user.nickname ?? username),
    avatarUrl: pickAvatarUrl(user),
    bio: String(user.signature ?? ''),
    biography: String(user.signature ?? ''),
    verified: Boolean(user.verified),
    followerCount: Number(stats.followerCount ?? 0),
    followingCount: Number(stats.followingCount ?? 0),
    heartCount: Number(stats.heartCount || stats.heart || 0),
    postCount: Number(stats.videoCount ?? 0),
    externalUrl: '',
    isPrivate: false
  };
}

async function fetchTtPosts(username, depth, tokenPool) {
  // Cursor-loop pagination: ENSEMBLEDATA returns ~50-600 posts per page.
  // Continue until no nextCursor (full scrape) atau safety cap reached.
  const MAX_PAGES = 20; // safety cap: 20 pages × 50 depth = 1000 posts max per akun
  const allPosts = [];
  let cursor = null;
  let authorStatsOverride = {};

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = { username, depth: String(depth) };
    if (cursor) params.start_cursor = String(cursor);

    const result = await ensembledataFetch('tiktok', '/user/posts', params, tokenPool);
    const data = result?.data;
    if (!data) break;

    // Repo pattern: Object.values(data).filter(item => 'aweme_id' in item)
    const rawPosts = Object.values(data).filter(
      (item) => item && typeof item === 'object' && 'aweme_id' in item
    );
    if (rawPosts.length === 0) break;

    const posts = rawPosts.map((p) => normalizeTtPost(p)).filter(Boolean);
    allPosts.push(...posts);

    // Capture author stats from first page's first post (most reliable)
    if (page === 0) {
      const author = rawPosts[0]?.author;
      if (author) {
        if (typeof author.follower_count === 'number') authorStatsOverride.followerCount = author.follower_count;
        if (typeof author.following_count === 'number') authorStatsOverride.followingCount = author.following_count;
        if (typeof author.total_favorited === 'number') authorStatsOverride.heartCount = author.total_favorited;
        if (typeof author.aweme_count === 'number') authorStatsOverride.postCount = author.aweme_count;
      }
    }

    // Pagination: try multiple cursor field names
    cursor = data.nextCursor ?? data.cursor ?? data.next_cursor ?? null;
    if (!cursor || cursor === '0' || cursor === 0) break;

    if (page < MAX_PAGES - 1) {
      console.log(`[TT] @${username} — page ${page + 1}: ${allPosts.length} posts so far, cursor active`);
      await sleep(CHUNK_DELAY_MS);
    }
  }

  return { posts: allPosts, authorStatsOverride };
}

async function atomicWriteJson(filepath, data) {
  const tmp = filepath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, filepath);
}

async function scrapeAccount(account, tokenPool, opts = {}) {
  const startTime = Date.now();
  const username = account.username;
  console.log(`\n[TT] @${username} — starting (depth=${FULL_SCRAPE_DEPTH}, merge=${opts.merge ?? false})`);

  let profile;
  try {
    profile = await fetchTtProfile(username, tokenPool);
  } catch (err) {
    console.error(`[TT] @${username} — profile fetch failed: ${err.message}`);
    throw err;
  }
  console.log(`[TT] @${username} — ${profile.followerCount} followers, ${profile.postCount} posts`);

  const { posts, authorStatsOverride } = await fetchTtPosts(username, FULL_SCRAPE_DEPTH, tokenPool);
  const merged = { ...profile, ...authorStatsOverride };

  // Dedupe in fresh fetch
  const deduped = [];
  const seen = new Set();
  for (const p of posts) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      deduped.push(p);
    }
  }
  deduped.sort((a, b) => b.timestamp - a.timestamp);

  // If --merge, baca existing dan merge (preserve existing, add new)
  let finalPosts = deduped;
  let existingPreserved = 0;
  let newAdded = deduped.length;
  if (opts.merge) {
    const outPath = path.join(OUT_DIR, `${account.slug}.json`);
    let existing = null;
    try {
      existing = JSON.parse(await fs.readFile(outPath, 'utf-8'));
    } catch {}
    if (existing && Array.isArray(existing.posts) && existing.posts.length > 0) {
      const existingIds = new Set(existing.posts.map(p => p.id));
      const newPosts = deduped.filter(p => !existingIds.has(p.id));
      finalPosts = [...existing.posts, ...newPosts];
      finalPosts.sort((a, b) => b.timestamp - a.timestamp);
      existingPreserved = existing.posts.length;
      newAdded = newPosts.length;
      console.log(`[TT] @${username} — MERGE: ${existing.posts.length} existing preserved, ${newPosts.length} new added`);
    }
  }

  const out = {
    platform: 'tiktok',
    account: {
      ...account,
      ...merged,
      username: merged.username || username
    },
    posts: finalPosts,
    scrapedAt: new Date().toISOString(),
    stats: {
      totalPosts: finalPosts.length,
      durationMs: Date.now() - startTime,
      isDummy: false,
      mergeMode: !!opts.merge,
      existingPreserved,
      newAdded
    }
  };

  const outPath = path.join(OUT_DIR, `${account.slug}.json`);
  await atomicWriteJson(outPath, out);
  console.log(`[TT] @${username} — DONE. ${finalPosts.length} posts → ${path.basename(outPath)} (${Math.round((Date.now() - startTime) / 1000)}s)`);
  return out;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  // V27.16: if ENSEMBLEDATA is skipped, exit cleanly so the workflow
  // pipeline (validate → generate → deploy) still runs. Bootstrap will
  // use the existing bundled data; no new posts will be collected.
  if (process.env.ENSEMBLEDATA_TOKENS_SKIP === 'true') {
    console.log('[TT] ⚠️  ENSEMBLEDATA_TOKENS_SKIP=true — scraping skipped, no new posts will be added.');
    console.log('[TT] Bootstrap will use existing bundled data; pipeline continues with current state.');
    return;
  }
  const tokenPool = new TokenPool();

  // Skip accounts that already have a complete scrape file
  const args = process.argv.slice(2);
  const onlySlug = args.find((a) => a.startsWith('only='))?.split('=')[1];
  const skipExisting = !args.includes('--force');
  const mergeMode = args.includes('--merge'); // append-only merge: preserve existing posts, add new

  const results = [];
  for (const account of ACCOUNTS_TT) {
    if (onlySlug && account.slug !== onlySlug) continue;
    if (tokenPool.isAllExhausted()) {
      console.log(`[TT] All tokens exhausted, stopping`);
      break;
    }
    const outPath = path.join(OUT_DIR, `${account.slug}.json`);
    if (skipExisting && !mergeMode) {
      try {
        const existing = JSON.parse(await fs.readFile(outPath, 'utf-8'));
        if (Array.isArray(existing.posts) && existing.posts.length > 0) {
          console.log(`[TT] @${account.username} — skip (already have ${existing.posts.length} posts)`);
          results.push({ slug: account.slug, ok: true, count: existing.posts.length, skipped: true });
          continue;
        }
      } catch {}
    }
    try {
      const r = await scrapeAccount(account, tokenPool, { merge: mergeMode });
      results.push({ slug: account.slug, ok: true, count: r.posts.length, mergeMode, newAdded: r.stats.newAdded, existingPreserved: r.stats.existingPreserved });
    } catch (err) {
      console.error(`[TT] @${account.username} — FAILED: ${err.message}`);
      results.push({ slug: account.slug, ok: false, error: err.message });
    }
    await sleep(CHUNK_DELAY_MS);
  }

  console.log(`\n=== TT SCRAPE COMPLETE ===`);
  console.log(`Token pool final: ${JSON.stringify(tokenPool.stats())}`);
  console.log(`Results:`, results);
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log(`\n${failed.length} account(s) failed:`, failed);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
