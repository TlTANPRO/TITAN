// Instagram scraper via FREE method (i.instagram.com /clips/user/ endpoint)
// Based on Fullscrap/src/instagram-web/instagram.ts
//
// Strategy:
//   1. Load existing scraped data (from ENSEMBLEDATA previous scrape)
//   2. Fetch reels via /clips/user/ (12 per page, paginated) — has REAL like/comment/view
//   3. Optional: Fetch posts via /feed/user/ if accessible (skipped if rate-limited)
//   4. Append-only merge: keep existing posts, add new ones, take MAX for like/comment/view per post id
//
// Use when ENSEMBLEDATA tokens exhausted. No API key needed.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNTS_IG } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'scraped');
const DELAY_MS = 2000; // i.instagram.com cooldown
const MAX_PAGES = 12; // 12 pages × 12 reels = 144 reels max per akun

const IG_HEADERS = {
  'User-Agent': 'Instagram 219.0.0.12.117 Android',
  'x-ig-app-id': '936619743392459',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.instagram.com',
  'Referer': 'https://www.instagram.com/',
  'Content-Type': 'application/x-www-form-urlencoded',
};

const BASE_URL = 'https://i.instagram.com/api/v1';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function igPost(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: IG_HEADERS,
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(30000)
  });
  const text = await res.text();
  if (text.includes('"login_required"') || text.includes('"require_login":true')) {
    throw new Error(`login_required at ${path}: ${text.slice(0, 100)}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} at ${path}: ${text.slice(0, 150)}`);
  return JSON.parse(text);
}

async function igGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: IG_HEADERS, signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  if (text.includes('"login_required"') || text.includes('"require_login":true')) {
    throw new Error(`login_required at ${path}: ${text.slice(0, 100)}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} at ${path}: ${text.slice(0, 150)}`);
  return JSON.parse(text);
}

function extractHashtags(text) {
  const m = text.matchAll(/#([\p{L}0-9_]+)/gu);
  return [...m].map((x) => '#' + x[1].toLowerCase());
}
function extractMentions(text) {
  const m = text.matchAll(/@([\w.]+)/g);
  return [...m].map((x) => '@' + x[1].toLowerCase());
}

// Fetch all reels (paginated via POST /clips/user/)
async function getAllReels(userId) {
  const all = [];
  let maxId = '';
  let moreAvailable = true;
  for (let page = 0; page < MAX_PAGES && moreAvailable; page++) {
    const body = {
      target_user_id: userId,
      page_size: '12',
      include_feed_video: 'true'
    };
    if (maxId) body.max_id = maxId;
    try {
      const raw = await igPost('/clips/user/', body);
      const items = (raw.items ?? []).map((it) => it.media).filter(Boolean);
      if (items.length === 0) break;
      const normalized = items.map((m) => ({
        id: String(m.id ?? m.pk ?? ''),
        shortcode: m.code ?? '',
        caption: m.caption?.text ?? '',
        timestamp: m.taken_at ?? m.device_timestamp ?? 0,
        likeCount: m.like_count ?? 0,
        commentCount: m.comment_count ?? 0,
        viewCount: m.view_count ?? m.play_count ?? 0,
        saveCount: m.save_count ?? m.saved_count ?? 0,
        thumbnailUrl: m.image_versions2?.candidates?.[0]?.url ?? m.cover_frame_url ?? '',
        videoUrl: m.video_versions?.[0]?.url ?? '',
        mediaType: 'REEL',
        isVideo: true,
        durationSeconds: m.video_duration ?? 0,
        postUrl: `https://www.instagram.com/reel/${m.code}/`
      }));
      all.push(...normalized);
      maxId = raw.paging_info?.max_id ?? '';
      moreAvailable = raw.paging_info?.more_available ?? false;
      console.log(`  reels page ${page + 1}: total ${all.length} so far, more=${moreAvailable}`);
      if (moreAvailable && maxId) await sleep(DELAY_MS);
      else break;
    } catch (e) {
      if (e.message.includes('login_required') || e.message.includes('require_login')) {
        console.log(`  clips/user login_required at page ${page + 1}, stopping`);
        break;
      }
      throw e;
    }
  }
  return all;
}

// Fetch all regular posts via GET /feed/user/{id}/ (paginated)
async function getAllPosts(userId) {
  const all = [];
  let maxId = '';
  let moreAvailable = true;
  for (let page = 0; page < 10 && moreAvailable; page++) {
    let p = `/feed/user/${userId}/?count=12`;
    if (maxId) p += `&max_id=${encodeURIComponent(maxId)}`;
    try {
      const raw = await igGet(p);
      const items = (raw.items ?? []).map((m) => ({
        id: String(m.id ?? ''),
        shortcode: m.code ?? '',
        caption: m.caption?.text ?? '',
        timestamp: m.taken_at ?? 0,
        likeCount: m.like_count ?? 0,
        commentCount: m.comment_count ?? 0,
        viewCount: m.view_count ?? m.play_count ?? 0,
        saveCount: m.save_count ?? 0,
        thumbnailUrl: m.image_versions2?.candidates?.[0]?.url ?? '',
        videoUrl: m.video_versions?.[0]?.url ?? '',
        mediaType: m.media_type === 2 ? (m.product_type === 'clips' ? 'REEL' : 'VIDEO') : m.media_type === 8 ? 'CAROUSEL_ALBUM' : 'IMAGE',
        isVideo: m.media_type === 2,
        durationSeconds: m.video_duration ?? 0,
        postUrl: `https://www.instagram.com/p/${m.code}/`
      }));
      if (items.length === 0) break;
      all.push(...items);
      maxId = raw.next_max_id ?? '';
      moreAvailable = raw.more_available ?? false;
      console.log(`  posts page ${page + 1}: total ${all.length} so far, more=${moreAvailable}`);
      if (moreAvailable && maxId) await sleep(DELAY_MS);
      else break;
    } catch (e) {
      if (e.message.includes('login_required') || e.message.includes('require_login')) {
        console.log(`  feed/user login_required at page ${page + 1}, stopping`);
        break;
      }
      throw e;
    }
  }
  return all;
}

// Merge existing scraped data with new free-scrape data
function mergePosts(existingPosts, newPosts) {
  const byId = new Map();
  for (const p of existingPosts || []) {
    if (p?.id) byId.set(String(p.id), { ...p });
  }
  let addedCount = 0;
  let upgradedCount = 0;
  for (const np of newPosts) {
    if (!np?.id) continue;
    const key = String(np.id);
    const existing = byId.get(key);
    if (!existing) {
      // Derive hashtags/mentions for new posts
      const enriched = {
        ...np,
        hashtags: np.hashtags || extractHashtags(np.caption),
        mentions: np.mentions || extractMentions(np.caption)
      };
      byId.set(key, enriched);
      addedCount++;
    } else {
      let changed = false;
      for (const f of ['likeCount', 'commentCount', 'viewCount', 'saveCount']) {
        const nVal = Number(np[f] ?? 0);
        const eVal = Number(existing[f] ?? 0);
        if (nVal > eVal) { existing[f] = nVal; changed = true; }
      }
      for (const f of ['thumbnailUrl', 'videoUrl', 'postUrl', 'mediaType', 'caption', 'shortcode']) {
        if (!existing[f] && np[f]) { existing[f] = np[f]; changed = true; }
      }
      if ((!existing.hashtags || existing.hashtags.length === 0) && np.caption) {
        existing.hashtags = extractHashtags(np.caption);
        existing.mentions = extractMentions(np.caption);
        changed = true;
      }
      if (changed) upgradedCount++;
    }
  }
  const merged = Array.from(byId.values());
  merged.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  return { merged, addedCount, upgradedCount };
}

async function atomicWriteJson(filepath, data) {
  const tmp = filepath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, filepath);
}

async function scrapeAccount(account) {
  const startTime = Date.now();
  const username = account.username;
  const outPath = path.join(OUT_DIR, `${account.slug}.json`);
  console.log(`\n[IG-FREE] @${username} — starting`);

  // Load existing
  let existing = null;
  try {
    existing = JSON.parse(await fs.readFile(outPath, 'utf-8'));
    console.log(`  loaded existing: ${(existing.posts ?? []).length} posts`);
  } catch {
    console.log(`  no existing file`);
  }

  const userId = existing?.account?.pk;
  if (!userId) throw new Error(`No pk in existing data for @${username}`);

  // Fetch reels (PRIMARY — confirmed works)
  console.log(`  fetching reels via /clips/user/...`);
  const reels = await getAllReels(userId);
  console.log(`  got ${reels.length} reels`);

  // Try regular posts (best effort, often rate-limited)
  console.log(`  fetching posts via /feed/user/...`);
  let posts = [];
  try {
    posts = await getAllPosts(userId);
    console.log(`  got ${posts.length} posts`);
  } catch (e) {
    console.log(`  posts fetch skipped: ${e.message.slice(0, 60)}`);
  }

  // Merge (reels + posts combined, then merged with existing)
  const allNew = [...reels, ...posts];
  const { merged, addedCount, upgradedCount } = mergePosts(existing?.posts, allNew);
  console.log(`  merge: +${addedCount} new posts, ${upgradedCount} upgraded metrics, total=${merged.length}`);

  // Recompute account-level stats from merged posts
  const existingAcc = existing?.account ?? account;
  const enrichedCount = merged.filter((p) => (p.likeCount || 0) > 0).length;
  const enrichedViewCount = merged.filter((p) => (p.viewCount || 0) > 0).length;
  const enrichedCommentCount = merged.filter((p) => (p.commentCount || 0) > 0).length;

  const newAccount = {
    ...existingAcc,
    username,
    pk: userId,
    // keep followerCount, biography, etc. from existing (only refresh if we have new data)
  };

  const out = {
    platform: 'instagram',
    account: newAccount,
    posts: merged,
    scrapedAt: new Date().toISOString(),
    lastFreeEnrichAt: new Date().toISOString(),
    stats: {
      totalPosts: merged.length,
      durationMs: Date.now() - startTime,
      isDummy: false,
      enriched: true,
      enrichmentSource: 'i.instagram.com',
      newPostsAdded: addedCount,
      metricsUpgraded: upgradedCount,
      enrichedLikeCount: enrichedCount,
      enrichedViewCount: enrichedViewCount,
      enrichedCommentCount: enrichedCommentCount
    }
  };

  await atomicWriteJson(outPath, out);
  const sec = Math.round((Date.now() - startTime) / 1000);
  console.log(`[IG-FREE] @${username} — DONE. ${merged.length} posts (${sec}s)`);
  return out;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const args = process.argv.slice(2);
  const onlySlug = args.find((a) => a.startsWith('only='))?.split('=')[1];
  const results = [];
  for (const account of ACCOUNTS_IG) {
    if (onlySlug && account.slug !== onlySlug) continue;
    try {
      const r = await scrapeAccount(account);
      results.push({ slug: account.slug, ok: true, total: r.posts.length });
    } catch (err) {
      console.error(`[IG-FREE] @${account.username} — FAILED: ${err.message}`);
      results.push({ slug: account.slug, ok: false, error: err.message });
    }
    await sleep(DELAY_MS);
  }
  console.log(`\n=== IG-FREE SCRAPE COMPLETE ===`);
  console.log('Results:', JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log(`\n${failed.length} account(s) failed:`, failed);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
