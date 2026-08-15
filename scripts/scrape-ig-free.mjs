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
import { fetchWithRetry, HttpTerminalError, sleep } from './lib/http-retry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'scraped');
const DELAY_MS = 2000; // i.instagram.com cooldown
const MAX_PAGES = 12; // 12 pages × 12 reels = 144 reels max per akun

// UA pool — rotate deterministically by account slug hash so retries within
// one account's pagination don't switch mid-flight.
const IG_UA_POOL = [
  'Instagram 219.0.0.12.117 Android',
  'Instagram 275.0.0.16.108 Android',
  'Instagram 317.0.0.34.109 Android'
];
function uaForSlug(slug) {
  if (!slug) return IG_UA_POOL[0];
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
  return IG_UA_POOL[Math.abs(h) % IG_UA_POOL.length];
}

function igHeadersForSlug(slug) {
  return {
    'User-Agent': uaForSlug(slug),
    'x-ig-app-id': '936619743392459',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://www.instagram.com',
    'Referer': 'https://www.instagram.com/',
    'Content-Type': 'application/x-www-form-urlencoded'
  };
}

const BASE_URL = 'https://i.instagram.com/api/v1';

async function igPost(slug, path, body) {
  let res;
  try {
    res = await fetchWithRetry(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: igHeadersForSlug(slug),
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(30000)
    }, { tag: `IG@${slug}`, maxAttempts: 3 });
  } catch (err) {
    if (err instanceof HttpTerminalError) throw err;
    throw err;
  }
  const text = await res.text();
  if (text.includes('"login_required"') || text.includes('"require_login":true')) {
    throw new HttpTerminalError(`login_required at ${path}: ${text.slice(0, 100)}`);
  }
  return JSON.parse(text);
}

async function igGet(slug, path) {
  const res = await fetchWithRetry(`${BASE_URL}${path}`, {
    headers: igHeadersForSlug(slug),
    signal: AbortSignal.timeout(30000)
  }, { tag: `IG@${slug}`, maxAttempts: 3 });
  const text = await res.text();
  if (text.includes('"login_required"') || text.includes('"require_login":true')) {
    throw new HttpTerminalError(`login_required at ${path}: ${text.slice(0, 100)}`);
  }
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
async function getAllReels(slug, userId) {
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
      const raw = await igPost(slug, '/clips/user/', body);
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
      if (e instanceof HttpTerminalError && /login_required/i.test(e.message)) {
        console.log(`  clips/user login_required at page ${page + 1}, stopping`);
        break;
      }
      throw e;
    }
  }
  return all;
}

// Fetch all regular posts via GET /feed/user/{id}/ (paginated)
async function getAllPosts(slug, userId) {
  const all = [];
  let maxId = '';
  let moreAvailable = true;
  for (let page = 0; page < 10 && moreAvailable; page++) {
    let p = `/feed/user/${userId}/?count=12`;
    if (maxId) p += `&max_id=${encodeURIComponent(maxId)}`;
    try {
      const raw = await igGet(slug, p);
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
      if (e instanceof HttpTerminalError && /login_required/i.test(e.message)) {
        console.log(`  feed/user login_required at page ${page + 1}, stopping`);
        break;
      }
      throw e;
    }
  }
  return all;
}

// Merge existing scraped data with new free-scrape data.
// V34.14: key by shortcode (with id fallback) because i.instagram.com returns
// two different id formats for the same post:
//   - /clips/user/  → id = "3940192545837702711" (numeric)
//   - /feed/user/   → id = "3940192545837702711_3292893687" (composite)
// Same shortcode, different id → key-by-id created 158+ duplicate posts per
// account. Verifying: e.g. DauYD6RTF43 appears with both ids in the same
// scraped file merge. Key by shortcode instead — shortcode is the stable
// IG post identifier (same as instagram.com/p/{shortcode}/).
function mergePosts(existingPosts, newPosts) {
  const byKey = new Map();
  const keyFor = (p) => p?.shortcode ? `sc:${p.shortcode}` : (p?.id ? `id:${String(p.id)}` : null);
  for (const p of existingPosts || []) {
    const k = keyFor(p);
    if (k) byKey.set(k, { ...p });
  }
  let addedCount = 0;
  let upgradedCount = 0;
  for (const np of newPosts) {
    const key = keyFor(np);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      // Derive hashtags/mentions for new posts
      const enriched = {
        ...np,
        hashtags: np.hashtags || extractHashtags(np.caption),
        mentions: np.mentions || extractMentions(np.caption)
      };
      byKey.set(key, enriched);
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
  const merged = Array.from(byKey.values());
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
  const slug = account.slug;
  const outPath = path.join(OUT_DIR, `${slug}.json`);
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

  // Tiered fetch — fall through i.instagram → Jina → bundled preservation.
  const tier = await fetchIgPostsTiered(account, existing, userId);
  console.log(`  source: ${tier.source}`);

  // Merge (new posts from tier chain, then merged with existing)
  const allNew = [...(tier.reels ?? []), ...(tier.posts ?? [])];
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
    pk: userId || existingAcc.pk,
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
      enriched: tier.source !== 'bundled-preservation',
      enrichmentSource: tier.source,
      newPostsAdded: addedCount,
      metricsUpgraded: upgradedCount,
      enrichedLikeCount: enrichedCount,
      enrichedViewCount: enrichedViewCount,
      enrichedCommentCount: enrichedCommentCount
    }
  };

  await atomicWriteJson(outPath, out);
  const sec = Math.round((Date.now() - startTime) / 1000);
  console.log(`[IG-FREE] @${username} — DONE. ${merged.length} posts (${sec}s) source=${tier.source}`);
  return out;
}

// Tier chain — i.instagram → Jina web → bundled preservation.
// Tier 1 fails on cloud CI (login_required). Tier 2 falls back to Jina-rendered
// profile markdown (just shortcodes, no like/comment counts). Tier 3 keeps
// existing data intact so deploy still has fresh-by-date presence.
async function fetchIgPostsTiered(account, existing, userId) {
  const slug = account.slug;
  const username = account.username;

  // Tier 1 — i.instagram.com /clips/user/ + /feed/user/
  if (userId) {
    try {
      const reels = await getAllReels(slug, userId);
      let posts = [];
      try {
        posts = await getAllPosts(slug, userId);
      } catch (e) {
        console.log(`  tier1 posts skipped: ${e.message.slice(0, 60)}`);
      }
      if (reels.length > 0 || posts.length > 0) {
        return { source: 'i.instagram-clips', reels, posts };
      }
      console.log(`  tier1 returned 0 items, falling through`);
    } catch (e) {
      const term = e instanceof HttpTerminalError && /login_required/i.test(e.message);
      console.log(`  tier1 ${term ? 'login_required' : 'errored'}: ${e.message.slice(0, 80)}`);
    }
  } else {
    console.log(`  tier1 skipped: no userId (pk) in existing data`);
  }

  // Tier 2 — Jina proxy of instagram.com/{username}/
  try {
    const jinaPosts = await getIgPostsViaJina(username);
    if (jinaPosts.length > 0) {
      return { source: 'jina-web', reels: [], posts: jinaPosts };
    }
    console.log(`  tier2 returned 0 shortcodes, falling through`);
  } catch (e) {
    console.log(`  tier2 jina failed: ${e.message.slice(0, 80)}`);
  }

  // Tier 3 — bundled preservation (no new data, but file is rewritten so
  // scrapedAt advances and health gate still sees a fresh attempt marker).
  return { source: 'bundled-preservation', reels: [], posts: [] };
}

// Tier 2 helper — parse Jina-rendered Instagram profile page for shortcodes.
// Input: rendered markdown. Output: minimal post placeholders (no like/comment
// counts, just enough for the calendar/heatmap and dedup).
async function getIgPostsViaJina(username) {
  const url = `https://r.jina.ai/https://www.instagram.com/${username}/`;
  const res = await fetchWithRetry(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TITAN-Scraper/1.0)',
      'Accept': 'text/plain'
    },
    signal: AbortSignal.timeout(30000)
  }, { tag: `Jina-IG@${username}`, maxAttempts: 3 });
  const md = await res.text();
  if (/Log into|Sign up · Instagram|Login Required/i.test(md)) {
    throw new HttpTerminalError(`Login wall returned for @${username}`);
  }
  // Match /p/{code}/ and /reel/{code}/ shortcode links.
  const codes = new Set();
  for (const re of [/\/p\/([A-Za-z0-9_-]{6,15})\//g, /\/reel\/([A-Za-z0-9_-]{6,15})\//g]) {
    let m;
    while ((m = re.exec(md)) !== null) codes.add(m[1]);
  }
  return [...codes].map((code) => ({
    id: `jina-${code}`,
    shortcode: code,
    caption: '',
    timestamp: 0,
    likeCount: 0,
    commentCount: 0,
    viewCount: 0,
    saveCount: 0,
    thumbnailUrl: '',
    videoUrl: '',
    mediaType: code.length > 0 ? 'REEL' : 'IMAGE', // best guess; jina profile mixes
    isVideo: true,
    durationSeconds: 0,
    postUrl: `https://www.instagram.com/p/${code}/`,
    source: 'jina-web'
  }));
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
      results.push({ slug: account.slug, ok: true, total: r.posts.length, added: r.stats?.newPostsAdded ?? 0 });
    } catch (err) {
      console.error(`[IG-FREE] @${account.username} — FAILED: ${err.message}`);
      results.push({ slug: account.slug, ok: false, error: err.message });
    }
    await sleep(DELAY_MS);
  }
  console.log(`\n=== IG-FREE SCRAPE COMPLETE ===`);
  console.log('Results:', JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok);
  // V32.4: detect silent zero-new scrape (free endpoints returned empty for
  // every account — usually means i.instagram.com is rate-limiting the CI IP).
  // Don't fail the whole run (existing posts are still useful), but warn loudly
  // and exit non-zero so daily-update.yml surfaces the problem instead of
  // deploying the same stale data with no indication.
  const okResults = results.filter((r) => r.ok);
  const zeroNew = okResults.filter((r) => (r.added ?? 0) === 0).length;
  if (okResults.length > 0 && zeroNew === okResults.length) {
    console.log(`\n⚠️  V32.4: ${zeroNew}/${okResults.length} IG account(s) returned 0 new posts.`);
    console.log(`   Likely cause: i.instagram.com /clips/user/ or /feed/user/ rate-limited or empty.`);
    console.log(`   Existing data preserved, but this means today's deploy has the SAME posts as yesterday.`);
    process.exit(2);
  }
  if (failed.length > 0) {
    console.log(`\n${failed.length} account(s) failed:`, failed);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
