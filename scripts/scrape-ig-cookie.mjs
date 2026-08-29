// scrape-ig-cookie.mjs — Instagram authenticated scraper via owner session cookie
//
// WHY: ALL free post-listing endpoints are dead since ~2026-08-25
// (i.instagram.com /clips/user/ + /feed/user/ → 401 login_required from any IP,
// web_profile_info → 400, profile HTML → login wall). The ONLY reliable way to
// get NEW posts is the account owner's own IG session cookie → android private API.
//
// Effect:
//   - GET https://i.instagram.com/api/v1/feed/user/{pk}/?count=12&max_id=... (paginated)
//   - Returns full posts: code, taken_at, like/comment/play counts, captions.
//   - Append-only merge into scripts/scraped/{slug}.json (same SSOT as scrape-ig-free).
//
// Auth: env IG_SESSION_COOKIE = full cookie header from the owner's logged-in
// browser, e.g. "sessionid=ABC...; csrftoken=XYZ...; mid=..." (copy from
// DevTools → Application → Cookies → instagram.com).
//
// Non-fatal: if no cookie / invalid session / transient error → keep existing
// scraped data and exit 2 (workflow surfaces warning, deploy continues).
//
// Usage:
//   node scripts/scrape-ig-cookie.mjs            # all 4 IG accounts
//   node scripts/scrape-ig-cookie.mjs only=ig-majangmejeng_
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNTS_IG } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'scraped');

const COOKIE = process.env.IG_SESSION_COOKIE || '';

const UA = 'Instagram 219.0.0.12.117 Android (26/8.0.0; 480dpi; 1080x1920; OnePlus; 6T Dev; devitron; qcom; en_US; 314665256)';
const BASE_URL = 'https://i.instagram.com/api/v1';

function csrftokenFrom() {
  const m = COOKIE.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return m ? m[1] : '';
}

function igHeaders() {
  return {
    'User-Agent': UA,
    'X-IG-App-ID': '936619743392459',
    'X-CSRFToken': csrftokenFrom(),
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://www.instagram.com',
    'Referer': 'https://www.instagram.com/',
    'Cookie': COOKIE,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site'
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Cheap human-style jitter so request timing doesn't look like a bot burst.
const jitter = (base) => base + Math.random() * 1500;

// slow=1 → very conservative pacing (6-7.5s/page, 30s gap/account) for
// full-depth backfill. Normal daily runs use the fast path (3s/page, 8s gap).
const SLOW = process.argv.includes('slow=1');
const pageDelayMs = SLOW ? 6000 : 3000;
const accountGapDefault = SLOW ? 30000 : 8000;

// Extra wait between accounts (IG throttles rapid multi-account bursts and
// replies with a FAKE `login_required`). Override per run: gap=10.
function accountGapMs() {
  const a = process.argv.find((x) => x.startsWith('gap='));
  const n = Number(a?.split('=')[1]);
  return Number.isFinite(n) && n > 0 ? n * 1000 : accountGapDefault;
}

// Max pages. feed/user returns count/media per page → pages*count posts max.
// Default 12 (144 posts) is plenty for a daily incremental + slow backfill.
// Override per run: pages=20
function MAX_PAGES() {
  const a = process.argv.find((x) => x.startsWith('pages='));
  const n = Number(a?.split('=')[1]);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 12;
}

// Items per page. Android API happily returns more than 12 (e.g. 32-33) which
// CUTS request count — important to stay far under IG's throttle. count=32
// default for backfill runs; keep 12 if IG rejects higher.
function PAGE_COUNT() {
  const a = process.argv.find((x) => x.startsWith('count='));
  const n = Number(a?.split('=')[1]);
  return Number.isFinite(n) && n > 0 ? Math.max(12, Math.min(n, 50)) : 12;
}

// login_required can mean (a) session really expired → persists across retries,
// or (b) IG throttle → clears after a pause. Retry with backoff, then classify.
async function igGet(path, { pageRetries = 0 } = {}) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: igHeaders(),
      signal: AbortSignal.timeout(30000)
    });
  } catch (e) {
    throw new Error(`network: ${e.message}`);
  }
  const text = await res.text();
  const isLoginWall =
    text.includes('"login_required"') || text.includes('"require_login":true') ||
    (res.status === 401 && /login/i.test(text.slice(0, 200)));
  const throttled = res.status === 429 || res.status === 403 || (res.status === 401 && !isLoginWall);
  if (isLoginWall && pageRetries < 2) {
    console.log(`  [retry] login_required at page ${path} — likely throttle, waiting ${10 * (pageRetries + 1)}s`);
    await sleep(10000 * (pageRetries + 1));
    return igGet(path, { pageRetries: pageRetries + 1 });
  }
  if (isLoginWall) {
    throw Object.assign(new Error(`login_required at ${path}`), { terminal: true });
  }
  if (throttled) {
    throw new Error(`HTTP ${res.status} at ${path}: ${text.slice(0, 120)}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} at ${path}: ${text.slice(0, 120)}`);
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

// Normalize one feed/user media item to TITAN post shape
// (identical to scrape-ig-free.mjs getAllPosts mapping).
function normalizeMedia(m) {
  const thumb = m.image_versions2?.candidates?.[0]?.url ?? m.cover_frame_url ?? '';
  const videoUrl = m.video_versions?.[0]?.url ?? '';
  const mediaType =
    m.media_type === 2
      ? (m.product_type === 'clips' ? 'REEL' : 'VIDEO')
      : m.media_type === 8
        ? 'CAROUSEL_ALBUM'
        : 'IMAGE';
  return {
    id: String(m.id ?? ''),
    shortcode: m.code ?? '',
    caption: m.caption?.text ?? '',
    timestamp: m.taken_at ?? 0,
    likeCount: m.like_count ?? 0,
    commentCount: m.comment_count ?? 0,
    viewCount: m.view_count ?? m.play_count ?? 0,
    saveCount: m.save_count ?? 0,
    thumbnailUrl: thumb,
    videoUrl,
    mediaType,
    isVideo: m.media_type === 2,
    durationSeconds: m.video_duration ?? 0,
    postUrl: `https://www.instagram.com/${m.code ? `p/${m.code}` : 'p/'}`,
    source: 'ig-cookie'
  };
}

// Best-effort pagination: keeps whatever pages we already got if a later page
// is throttled, instead of throwing away the whole account.
async function fetchAllFeedPosts(userId) {
  const all = [];
  let maxId = '';
  let moreAvailable = true;
  let lastError = null;
  const pages = MAX_PAGES();
  for (let page = 0; page < pages && moreAvailable; page++) {
    let p = `/feed/user/${userId}/?count=${PAGE_COUNT()}`;
    if (maxId) p += `&max_id=${encodeURIComponent(maxId)}`;
    let raw;
    try {
      raw = await igGet(p);
    } catch (e) {
      lastError = e;
      console.log(`  stop pagination after ${all.length} posts: ${e.message.slice(0, 90)}`);
      break;
    }
    const items = raw.items ?? [];
    if (items.length === 0) break;
    all.push(...items.map(normalizeMedia));
    maxId = raw.next_max_id ?? '';
    moreAvailable = raw.more_available ?? false;
    console.log(`  feed/user page ${page + 1}: ${all.length} so far, more=${moreAvailable}`);
    if (moreAvailable && maxId) await sleep(jitter(pageDelayMs));
  }
  return { posts: all, error: lastError };
}

// Append-only merge keyed by shortcode (stable IG post identifier).
// Same semantics as scrape-ig-free.mjs mergePosts (V34.14).
function mergePosts(existingPosts, newPosts) {
  const byKey = new Map();
  const keyFor = (p) => (p?.shortcode ? `sc:${p.shortcode}` : p?.id ? `id:${String(p.id)}` : null);
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
      byKey.set(key, {
        ...np,
        hashtags: extractHashtags(np.caption),
        mentions: extractMentions(np.caption)
      });
      addedCount++;
    } else {
      let changed = false;
      for (const f of ['likeCount', 'commentCount', 'viewCount', 'saveCount']) {
        const nVal = Number(np[f] ?? 0);
        const eVal = Number(existing[f] ?? 0);
        if (nVal > eVal) { existing[f] = nVal; changed = true; }
      }
      for (const f of ['thumbnailUrl', 'videoUrl', 'mediaType', 'caption', 'timestamp', 'postUrl']) {
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
  const slug = account.slug;
  const outPath = path.join(OUT_DIR, `${slug}.json`);

  let existing = null;
  try {
    existing = JSON.parse(await fs.readFile(outPath, 'utf-8'));
    console.log(`  loaded existing: ${(existing.posts ?? []).length} posts`);
  } catch {
    console.log(`  no existing file`);
  }

  const userId = existing?.account?.pk || account.pk;
  if (!userId) {
    console.log(`  no userId (pk) available, touching existing data only`);
    if (!existing) return { ok: false, error: 'no_pk', added: 0 };
    existing.stats = existing.stats || {};
    existing.stats.lastIgCookieAttempt = new Date().toISOString();
    existing.stats.igCookieError = 'no_pk';
    await atomicWriteJson(outPath, existing);
    return { ok: true, added: 0, error: 'no_pk' };
  }

  const { posts: fresh, error: feedError } = await fetchAllFeedPosts(userId);
  if (fresh.length === 0) {
    console.log(`  feed/user returned 0 items — keeping existing data`);
    if (existing) {
      existing.stats = existing.stats || {};
      existing.stats.lastIgCookieAttempt = new Date().toISOString();
      existing.stats.igCookieZero = true;
      if (feedError) existing.stats.igCookieError = feedError.message.slice(0, 160);
      await atomicWriteJson(outPath, existing);
    }
    return { ok: false, error: 'empty_feed', added: 0, feedError: feedError?.message };
  }

  const { merged, addedCount, upgradedCount } = mergePosts(existing?.posts, fresh);
  console.log(`  merge: +${addedCount} new posts, ${upgradedCount} upgraded, total=${merged.length}`);

  const existingAcc = existing?.account ?? account;
  const out = {
    platform: 'instagram',
    account: { ...existingAcc, username: account.username, pk: userId },
    posts: merged,
    scrapedAt: new Date().toISOString(),
    lastIgCookieAt: new Date().toISOString(),
    stats: {
      totalPosts: merged.length,
      durationMs: Date.now() - startTime,
      isDummy: false,
      source: 'ig-cookie-authenticated',
      newPostsAdded: addedCount,
      metricsUpgraded: upgradedCount,
      ...(feedError ? { igCookiePartialError: feedError.message.slice(0, 160) } : {})
    }
  };
  await atomicWriteJson(outPath, out);
  console.log(`[IG-COOKIE] @${account.username} DONE: ${merged.length} posts (+${addedCount})`);
  return { ok: true, added: addedCount, total: merged.length };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const onlySlug = process.argv.find((a) => a.startsWith('only='))?.split('=')[1];
  if (!COOKIE) {
    console.error('::error::IG_SESSION_COOKIE env not set — skipping authenticated IG scrape.');
    console.error('   Set repo secret IG_SESSION_COOKIE (owner session cookie) or run free fallback.');
    process.exit(2);
  }
  const results = [];
  for (const account of ACCOUNTS_IG) {
    if (onlySlug && account.slug !== onlySlug) continue;
    try {
      const r = await scrapeAccount(account);
      results.push({ slug: account.slug, ...r });
    } catch (err) {
      console.error(`[IG-COOKIE] @${account.username} FAILED: ${err.message}`);
      results.push({ slug: account.slug, ok: false, error: err.message });
    }
    await sleep(accountGapMs());
  }
  console.log(`\n=== IG-COOKIE SCRAPE COMPLETE ===`);
  console.log('Results:', JSON.stringify(results, null, 2));
  // A *persistent* login_required everywhere = cookie dead. But partial success
  // (some accounts filled, even with throttled pages) = keep data, exit 0 so
  // the health gate judges from the merged files.
  const terminals = results.filter((r) => !r.ok && /login_required/i.test(r.error || ''));
  const allFailed = results.length > 0 && results.every((r) => !r.ok);
  if (allFailed && terminals.length === results.length) {
    console.error('::error::IG session cookie invalid/expired for all accounts — refresh IG_SESSION_COOKIE secret');
    process.exit(2);
  }
  if (results.length > 0 && allFailed) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

export { normalizeMedia, mergePosts, extractHashtags, extractMentions };