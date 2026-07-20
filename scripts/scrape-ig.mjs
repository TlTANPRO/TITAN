// Instagram scraper — pakai schema dari INSTAGRAMSCRAP repo (depth-based pagination, fallback chain untuk fields)
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TokenPool, ensembledataFetch, sleep } from './lib/tokenPool.mjs';
import { ACCOUNTS_IG } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'scraped');
const CHUNK_DELAY_MS = 1500;

// CLI flag (set in main, read by scrapeAccount)
let skipEnrich = false;

// Per plan Group A2: IG /user/posts dengan depth=50 untuk full-scrape
// (332 post / 12 per page = 28 depth, kita pakai 50 untuk safety margin)
const FULL_SCRAPE_DEPTH = 50;

function parseInstagramUsername(input) {
  const trimmed = input.trim();
  let candidate = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const match = url.pathname.match(/\/([^/]+)/);
      if (match?.[1]) candidate = match[1];
    } catch {}
  }
  return candidate.replace(/^@/, '').trim();
}

function extractThumbnail(post) {
  const displayUrl = post.display_url ?? post.displayUrl;
  if (typeof displayUrl === 'string' && displayUrl.length > 0) return displayUrl;
  const thumbnailSrc = post.thumbnail_src ?? post.thumbnailUrl;
  if (typeof thumbnailSrc === 'string' && thumbnailSrc.length > 0) return thumbnailSrc;
  const resources = post.thumbnail_resources;
  if (Array.isArray(resources) && resources.length > 0) {
    const last = resources[resources.length - 1];
    if (last?.src) return last.src;
  }
  const imageVersions = post.image_versions2;
  if (imageVersions?.candidates?.[0]?.url) return imageVersions.candidates[0].url;
  return '';
}

function extractViewCount(post) {
  if (typeof post.video_view_count === 'number') return post.video_view_count;
  if (typeof post.videoViewCount === 'number') return post.videoViewCount;
  if (typeof post.view_count === 'number') return post.view_count;
  if (typeof post.playCount === 'number') return post.playCount;
  return 0;
}

function extractMediaType(post) {
  const mediaType = post.media_type ?? post.mediaType;
  if (typeof mediaType === 'number') {
    // IG media_type: 1=IMAGE, 2=VIDEO, 8=CAROUSEL_ALBUM
    switch (mediaType) {
      case 1: return 'IMAGE';
      case 2: return post.product_type === 'clips' ? 'REEL' : 'VIDEO';
      case 8: return 'CAROUSEL_ALBUM';
    }
  }
  if (typeof mediaType === 'string') return mediaType.toUpperCase();
  if (post.is_video === true || post.isVideo === true) return 'VIDEO';
  return 'IMAGE';
}

function extractDuration(post) {
  const d = post.video_duration ?? post.videoDuration ?? post.duration;
  return typeof d === 'number' ? d : 0;
}

function normalizePost(post) {
  const id = String(post.id ?? post.pk ?? post.shortcode ?? '');
  const shortcode = post.shortcode ?? post.code ?? id;
  const edgeLikes = post.edge_liked_by;
  const edgeComments = post.edge_media_to_comment;

  const likeCount = Number(edgeLikes?.count ?? post.like_count ?? post.likeCount ?? 0);
  const commentCount = Number(edgeComments?.count ?? post.comment_count ?? post.commentCount ?? 0);

  let caption = '';
  const captionRaw = post.caption ?? post.accessibility_caption;
  if (typeof captionRaw === 'string') {
    caption = captionRaw;
  } else if (captionRaw && typeof captionRaw === 'object') {
    caption = String(captionRaw.text ?? '');
  } else {
    const edgeCaption = post.edge_media_to_caption;
    caption = edgeCaption?.edges?.[0]?.node?.text ?? '';
  }

  const createTime = Number(post.taken_at ?? post.taken_at_timestamp ?? post.timestamp ?? post.createTime ?? 0);

  return {
    id,
    shortcode,
    caption,
    createTime,
    timestamp: createTime * 1000, // ms untuk JS Date
    thumbnailUrl: extractThumbnail(post),
    postUrl: `https://www.instagram.com/p/${shortcode}/`,
    mediaType: extractMediaType(post),
    isVideo: post.is_video === true || post.isVideo === true,
    likeCount,
    commentCount,
    viewCount: extractViewCount(post),
    saveCount: Number(post.saved_count ?? post.save_count ?? 0),
    durationSeconds: extractDuration(post),
    hashtags: extractHashtags(caption),
    mentions: extractMentions(caption)
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

async function fetchIgProfile(username, tokenPool) {
  // /user/info → dapat pk (user_id) + basic info
  const basicResult = await ensembledataFetch('instagram', '/user/info', { username }, tokenPool);
  const basicData = basicResult?.data;
  if (!basicData) throw new Error(`No data in profile response for @${username}`);

  // Repo pattern: const user = (data.user ?? data)
  const user = (basicData.user ?? basicData);
  if (!user || !user.username) throw new Error(`No user object in profile for @${username}`);

  // /user/info kadang nggak kasih follower/biography → fallback ke /user/detailed-info
  let detailedData = null;
  try {
    const detailedResult = await ensembledataFetch(
      'instagram',
      '/user/detailed-info',
      { username },
      tokenPool
    );
    detailedData = detailedResult?.data;
  } catch (err) {
    console.warn(`[IG] @${username} — detailed-info fetch failed: ${err.message}`);
  }

  const detailed = detailedData ? (detailedData.user ?? detailedData) : null;

  const edge_followed_by = user.edge_followed_by;
  const edge_follow = user.edge_follow;
  const edge_owner_to_timeline_media = user.edge_owner_to_timeline_media;

  return {
    username: String(user.username ?? username),
    fullName: String(user.full_name ?? user.fullName ?? ''),
    profilePicUrl: String(user.profile_pic_url_hd ?? user.profile_pic_url ?? user.profilePicUrl ?? ''),
    biography: String(detailed?.biography ?? user.biography ?? user.bio ?? ''),
    verified: Boolean(user.is_verified ?? user.verified ?? false),
    followerCount: Number(
      edge_followed_by?.count ??
      detailed?.follower_count ??
      detailed?.followerCount ??
      user.follower_count ??
      user.followerCount ??
      0
    ),
    followingCount: Number(
      edge_follow?.count ??
      detailed?.following_count ??
      detailed?.followingCount ??
      user.following_count ??
      user.followingCount ??
      0
    ),
    postCount: Number(
      edge_owner_to_timeline_media?.count ??
      detailed?.media_count ??
      detailed?.postCount ??
      user.media_count ??
      user.postCount ??
      0
    ),
    externalUrl: String(detailed?.external_url ?? user.external_url ?? user.externalUrl ?? ''),
    pk: String(user.pk ?? user.id ?? ''),
    isPrivate: Boolean(user.is_private ?? false)
  };
}

async function fetchIgPosts(userId, depth, tokenPool) {
  const result = await ensembledataFetch('instagram', '/user/posts', { user_id: userId, depth: String(depth) }, tokenPool);
  const data = result?.data;
  if (!data) return { posts: [], authorStatsOverride: {} };

  let rawPosts = [];
  if (Array.isArray(data)) {
    rawPosts = data;
  } else {
    const items = data.items ?? data.edges ?? data.posts;
    if (Array.isArray(items)) {
      rawPosts = items.map((item) => {
        if (item && typeof item === 'object') {
          return item.node ?? item;
        }
        return {};
      });
    } else {
      // Object of posts: Object.values(data) filter id/pk/shortcode
      rawPosts = Object.values(data).filter(
        (item) => item && typeof item === 'object' && ('id' in item || 'pk' in item || 'shortcode' in item)
      );
    }
  }

  const posts = rawPosts.map((p) => normalizePost(p)).filter((p) => p.id);

  // Author stats override dari first post
  const authorStatsOverride = {};
  const firstPost = rawPosts[0];
  if (firstPost) {
    const owner = firstPost.owner;
    if (owner) {
      const edgeFollowedBy = owner.edge_followed_by;
      if (typeof edgeFollowedBy?.count === 'number') authorStatsOverride.followerCount = edgeFollowedBy.count;
      if (typeof owner.media_count === 'number') authorStatsOverride.postCount = owner.media_count;
    }
  }

  return { posts, authorStatsOverride };
}

/**
 * Enrich IG posts with /post/details per post.
 * /user/posts tidak return likeCount, commentCount, viewCount — kita fetch per post
 * untuk dapat data real (bukan estimasi).
 *
 * Quota: 1 call per post. Untuk 4 akun × ~545 post = ~2180 call.
 * ENSEMBLEDATA /post/details endpoint: GET /apis/instagram/post/details?code=SHORTCODE&token=X
 * Returns: { data: { edge_media_preview_like.count, edge_media_to_comment.count,
 *                     video_play_count, video_view_count, ... } }
 * Catatan: saveCount TIDAK di-expose (hanya `viewer_has_saved` boolean).
 */
async function enrichIgMediaInfo(posts, tokenPool, { skip = false, onProgress = null } = {}) {
  if (skip) {
    console.log(`[IG] enrichment skipped (--no-enrich flag)`);
    return posts;
  }
  const enriched = [];
  let successCount = 0;
  let failCount = 0;
  const total = posts.length;
  const startTime = Date.now();

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    if (!post.shortcode) {
      enriched.push(post);
      continue;
    }
    try {
      const r = await ensembledataFetch('instagram', '/post/details', { code: post.shortcode }, tokenPool);
      const data = r?.data;
      // Response shape: data is object with GraphQL edges
      if (data && typeof data === 'object') {
        // Like count: edge_media_preview_like.count (GraphQL)
        const likeEdge = data.edge_media_preview_like;
        if (likeEdge && typeof likeEdge === 'object' && typeof likeEdge.count === 'number' && likeEdge.count > (post.likeCount || 0)) {
          post.likeCount = likeEdge.count;
        }
        // Comment count: edge_media_to_comment.count
        const cmtEdge = data.edge_media_to_comment;
        if (cmtEdge && typeof cmtEdge === 'object' && typeof cmtEdge.count === 'number' && cmtEdge.count > (post.commentCount || 0)) {
          post.commentCount = cmtEdge.count;
        }
        // View count: prefer video_play_count > video_view_count
        const playCount = data.video_play_count ?? data.video_view_count;
        if (typeof playCount === 'number' && playCount > (post.viewCount || 0)) {
          post.viewCount = playCount;
        }
        // Save count TIDAK di-expose di /post/details — skip
        successCount++;
      } else {
        failCount++;
      }
    } catch (err) {
      failCount++;
      // Don't spam logs — failures are common (private posts, deleted, etc.)
      if (failCount <= 3) {
        console.warn(`[IG] /post/details failed for ${post.shortcode}: ${err.message.slice(0, 60)}`);
      }
    }
    enriched.push(post);

    // Progress log every 50 posts
    if ((i + 1) % 50 === 0 && onProgress) {
      onProgress(i + 1, total, successCount, failCount, startTime);
    }

    // Rate limit: 750ms between calls (faster than /user/posts karena per-post)
    await sleep(750);
  }

  const durationSec = Math.round((Date.now() - startTime) / 1000);
  console.log(`[IG] enrichment done: ${successCount}/${total} success, ${failCount} failed, ${durationSec}s`);
  return enriched;
}

async function atomicWriteJson(filepath, data) {
  const tmp = filepath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, filepath);
}

async function scrapeAccount(account, tokenPool) {
  const startTime = Date.now();
  const username = account.username;
  console.log(`\n[IG] @${username} — starting (depth=${FULL_SCRAPE_DEPTH})`);

  let profile;
  try {
    profile = await fetchIgProfile(username, tokenPool);
  } catch (err) {
    console.error(`[IG] @${username} — profile fetch failed: ${err.message}`);
    throw err;
  }
  if (!profile.pk) {
    throw new Error(`No pk (user_id) in profile for @${username}`);
  }
  console.log(`[IG] @${username} — ${profile.followerCount} followers, ${profile.postCount} posts, user_id=${profile.pk}`);

  // /apis/instagram/user/posts BUTUH user_id (422 kalau pakai username)
  const { posts, authorStatsOverride } = await fetchIgPosts(profile.pk, FULL_SCRAPE_DEPTH, tokenPool);
  const merged = { ...profile, ...authorStatsOverride };

  // Dedupe by id
  const deduped = [];
  const seen = new Set();
  for (const p of posts) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      deduped.push(p);
    }
  }
  deduped.sort((a, b) => b.timestamp - a.timestamp);

  // Enrich with /post/details per post (1 call per post — adds like/comment/view counts)
  // Skip jika --no-enrich flag aktif
  const enrichedPosts = await enrichIgMediaInfo(deduped, tokenPool, { skip: skipEnrich });

  const out = {
    platform: 'instagram',
    account: {
      ...account,
      ...merged,
      username: merged.username || username
    },
    posts: enrichedPosts,
    scrapedAt: new Date().toISOString(),
    stats: {
      totalPosts: enrichedPosts.length,
      durationMs: Date.now() - startTime,
      isDummy: false,
      enriched: !skipEnrich
    }
  };

  const outPath = path.join(OUT_DIR, `${account.slug}.json`);
  await atomicWriteJson(outPath, out);
  console.log(`[IG] @${username} — DONE. ${enrichedPosts.length} posts → ${path.basename(outPath)} (${Math.round((Date.now() - startTime) / 1000)}s)`);
  return out;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  // V27.16: if ENSEMBLEDATA is skipped, the scraper is useless — every
  // fetchIgProfile call would throw. Exit 0 cleanly so the workflow
  // pipeline (validate → generate → deploy) still runs and produces a
  // stable dashboard based on the existing bundled data.
  if (process.env.ENSEMBLEDATA_TOKENS_SKIP === 'true') {
    console.log('[IG] ⚠️  ENSEMBLEDATA_TOKENS_SKIP=true — scraping skipped, no new posts will be added.');
    console.log('[IG] Bootstrap will use existing bundled data; pipeline continues with current state.');
    return;
  }
  const tokenPool = new TokenPool();

  // CLI flags (parity with scrape-tt.mjs):
  //   node scrape-ig.mjs --force                → re-scrape even if file exists
  //   node scrape-ig.mjs --no-enrich            → skip /post/details enrichment (faster, no like/comment/view data)
  //   node scrape-ig.mjs only=ig-majangmejeng_   → scrape just one account
  const args = process.argv.slice(2);
  const onlySlug = args.find((a) => a.startsWith('only='))?.split('=')[1];
  const skipExisting = !args.includes('--force');
  skipEnrich = args.includes('--no-enrich');
  if (skipEnrich) {
    console.log('[IG] --no-enrich flag set: skipping /media/info enrichment (no like/comment/view data)');
  }

  const results = [];
  for (const account of ACCOUNTS_IG) {
    if (onlySlug && account.slug !== onlySlug) continue;
    if (tokenPool.isAllExhausted()) {
      console.log(`[IG] All tokens exhausted, stopping`);
      break;
    }
    const outPath = path.join(OUT_DIR, `${account.slug}.json`);
    if (skipExisting) {
      try {
        const existing = JSON.parse(await fs.readFile(outPath, 'utf-8'));
        if (Array.isArray(existing.posts) && existing.posts.length > 0) {
          console.log(`[IG] @${account.username} — skip (already have ${existing.posts.length} posts). Use --force to re-scrape.`);
          results.push({ slug: account.slug, ok: true, count: existing.posts.length, skipped: true });
          continue;
        }
      } catch {}
    }
    try {
      const r = await scrapeAccount(account, tokenPool);
      results.push({ slug: account.slug, ok: true, count: r.posts.length });
    } catch (err) {
      console.error(`[IG] @${account.username} — FAILED: ${err.message}`);
      results.push({ slug: account.slug, ok: false, error: err.message });
    }
    await sleep(CHUNK_DELAY_MS);
  }

  console.log(`\n=== IG SCRAPE COMPLETE ===`);
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
