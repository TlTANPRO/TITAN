// scrape-tt-cookie.mjs — TikTok authenticated scraper via owner session cookie
//
// WHY: ALL free post-listing methods are dead since ~2026-08-25 (yt-dlp →
// "Unable to extract secondary user ID", Jina profile → CF 403, TikWM/Urlebird →
// CF challenge, native /rss → login wall, m.tiktok.com → 404 shell). The ONLY
// reliable way to get NEW posts (with stats) is the owner's logged-in session:
// the user profile page is served WITH embedded JSON (SIGI_STATE /
// __UNIVERSAL_DATA_FOR_REHYDRATION__) containing the latest ~30 videos incl.
// digg/comment/play counts + createTime.
//
// Tier B fallback: POST https://www.tiktok.com/api/post/item_list/ with cookies.
//
// Auth: env TT_SESSION_COOKIE = full cookie header from the owner's logged-in
// browser, e.g. "ttwid=...; msToken=...; passport_csrf_token=...; sessionid=..."
// (copy from DevTools → Application → Cookies → tiktok.com).
//
// Non-fatal: no cookie / invalid session / transient error → keep existing
// scraped data and exit 2 (workflow surfaces warning, deploy continues).
//
// Writes to scripts/scraped/tt-{slug}.json — the SSOT that generate-data.mjs
// reads (same as scrape-tt-free.mjs).
//
// Usage:
//   node scripts/scrape-tt-cookie.mjs            # all 5 TT accounts
//   node scripts/scrape-tt-cookie.mjs only=tt-majangmejeng_
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNTS_TT } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'scraped');
const DELAY_MS = 2000;
const TIMEOUT_MS = 25000;

const COOKIE = process.env.TT_SESSION_COOKIE || '';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function csrfFrom() {
  const m = COOKIE.match(/(?:^|;\s*)tt_csrf_token=([^;]+)/);
  if (m) return m[1];
  const m2 = COOKIE.match(/(?:^|;\s*)passport_csrf_token=([^;]+)/);
  return m2 ? m2[1] : '';
}

function pageHeaders() {
  return {
    'User-Agent': BROWSER_UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.tiktok.com/',
    'Cookie': COOKIE
  };
}

function apiHeaders(username) {
  const h = pageHeaders();
  h['Accept'] = 'application/json, text/plain, */*';
  h['Content-Type'] = 'application/json; charset=UTF-8';
  h['Referer'] = `https://www.tiktok.com/@${username}`;
  const csrf = csrfFrom();
  if (csrf) h['X-Secsdk-Csrf-Token'] = csrf;
  return h;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Profile page embedded JSON extraction ──────────────────────────────────
// Two known shapes:
//   A) <script id="SIGI_STATE" type="application/json">...</script>
//   B) <script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">...</script>
// Returns a normalized array of posts, newest first, or empty array.
function parsePagePosts(html, username) {
  // Shape A: SIGI_STATE json tag
  let sigi = null;
  const sigiMatch = html.match(
    /<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/
  );
  if (sigiMatch) {
    try { sigi = JSON.parse(sigiMatch[1]); } catch { sigi = null; }
  }
  if (sigi?.ItemModule) {
    const posts = [];
    for (const [id, m] of Object.entries(sigi.ItemModule)) {
      if (m.author?.uniqueId && m.author.uniqueId.toLowerCase() !== username.toLowerCase()) continue;
      posts.push(normalizeItem(m, username));
    }
    posts.sort((a, b) => b.createTime - a.createTime);
    if (posts.length > 0) return posts;
  }

  // Shape B: __UNIVERSAL_DATA_FOR_REHYDRATION__
  const universMatch = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (universMatch) {
    try {
      const data = JSON.parse(universMatch[1]);
      const itemArr = data?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.itemList?.vid ?? [];
      const posts = itemArr.map((m) => normalizeItem(m, username));
      posts.sort((a, b) => b.createTime - a.createTime);
      if (posts.length > 0) return posts;
    } catch {}
  }
  return [];
}

function normalizeItem(m, username) {
  const id = String(m.id ?? '');
  const desc = m.desc ?? '';
  const stats = m.stats ?? {};
  const cover = m.video?.cover?.urlList?.[0] ?? m.video?.cover ?? '';
  const playAddr = m.video?.playAddr?.urlList?.[0] ?? m.video?.UrlList?.[0] ?? '';
  return {
    id: `${username}-${id}`,
    shortcode: id,
    createTime: Number(m.createTime ?? 0),
    timestamp: Number(m.createTime ?? 0) * 1000,
    postedAt: new Date(Number(m.createTime ?? 0) * 1000).toISOString(),
    postUrl: `https://www.tiktok.com/@${username}/video/${id}`,
    mediaType: 'VIDEO',
    isVideo: true,
    platform: 'tiktok',
    source: 'tt-cookie',
    caption: desc,
    hashtags: hashtagsFrom(desc),
    likeCount: Number(stats.diggCount ?? 0),
    commentCount: Number(stats.commentCount ?? 0),
    viewCount: Number(stats.playCount ?? 0),
    saveCount: Number(stats.shareCount ?? 0),
    thumbnailUrl: cover,
    videoUrl: playAddr,
    durationSeconds: Number(m.video?.duration ?? 0) || undefined
  };
}

function hashtagsFrom(text) {
  return [...new Set((text.match(/#[^\s#]+/g) ?? []).map((t) => t.toLowerCase()))];
}

// ─── Tier B: authenticated item_list API ────────────────────────────────────
async function fetchItemListApi(username) {
  const params = new URLSearchParams({
    aid: '1988',
    app_language: 'en',
    app_name: 'tiktok_web',
    browser_language: 'en-US',
    browser_name: 'Mozilla',
    browser_online: 'true',
    browser_platform: 'Win32',
    channel: 'tiktok_web',
    cookie_enabled: 'true',
    device_platform: 'web_pc',
    focus_state: 'true',
    history_len: '2',
    is_fullscreen: 'false',
    is_page_visible: 'true',
    language: 'en',
    os: 'windows',
    priority_region: 'ID',
    region: 'ID',
    screen_height: '900',
    screen_width: '1600',
    timezone_name: 'Asia/Jakarta',
    is_my_profile: 'false',
    secUid: '',
    lang: 'en',
    uniqueId: username
  });
  const url = `https://www.tiktok.com/api/post/item_list/?${params.toString()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: apiHeaders(username),
    body: JSON.stringify({
      count: 30,
      cursor: 0,
      uniqueId: username,
      secUid: '',
      cookieEnabled: true,
      insertAudioItem: false,
      shareUid: '',
      isLeader: false,
      from_page: 'user',
      userProfile: '',
      webSearchSessionId: '',
      channelId: '',
      collectEvent: 1,
      tabType: 0
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`item_list HTTP ${res.status}`);
  const j = await res.json();
  if (!j?.itemList?.length) throw new Error('item_list returned no items');
  const posts = j.itemList.map((m) => normalizeItem(m, username));
  posts.sort((a, b) => b.createTime - a.createTime);
  return posts;
}

// ─── Merge + write ─────────────────────────────────────────────────────────
function mergePosts(existingPosts, newPosts) {
  const byKey = new Map();
  const keyFor = (p) => (p?.shortcode ? `sc:${p.shortcode}` : p?.id ? `id:${String(p.id)}` : null);
  for (const p of existingPosts || []) {
    const k = keyFor(p);
    if (k) byKey.set(k, { ...p });
  }
  let added = 0;
  let upgraded = 0;
  for (const np of newPosts) {
    const k = keyFor(np);
    if (!k) continue;
    const e = byKey.get(k);
    if (!e) {
      byKey.set(k, { ...np, hashtags: np.hashtags?.length ? np.hashtags : hashtagsFrom(np.caption) });
      added++;
    } else {
      let changed = false;
      for (const f of ['likeCount', 'commentCount', 'viewCount', 'saveCount']) {
        const n = Number(np[f] ?? 0);
        const o = Number(e[f] ?? 0);
        if (n > o) { e[f] = n; changed = true; }
      }
      for (const f of ['thumbnailUrl', 'videoUrl', 'caption', 'postedAt', 'durationSeconds']) {
        if (!e[f] && np[f]) { e[f] = np[f]; changed = true; }
      }
      if ((!e.hashtags || !e.hashtags.length) && np.caption) {
        e.hashtags = hashtagsFrom(np.caption);
        changed = true;
      }
      if (changed) upgraded++;
    }
  }
  const merged = Array.from(byKey.values());
  merged.sort((a, b) => (b.createTime ?? b.timestamp ?? 0) - (a.createTime ?? a.timestamp ?? 0));
  return { merged, added, upgraded };
}

async function atomicWriteJson(filepath, data) {
  const tmp = filepath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, filepath);
}

async function scrapeAccount(account) {
  const startTime = Date.now();
  const slug = account.slug;
  const username = account.username;
  const outPath = path.join(OUT_DIR, `${slug}.json`);

  let existing = null;
  try {
    existing = JSON.parse(await fs.readFile(outPath, 'utf-8'));
    console.log(`  loaded existing: ${(existing.posts ?? []).length} posts`);
  } catch {
    console.log(`  no existing file`);
  }

  // Tier A — user page with embedded JSON
  let fresh = [];
  let usedTier = 'page';
  try {
    const res = await fetch(`https://www.tiktok.com/@${username}`, {
      headers: pageHeaders(),
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const html = await res.text();
    fresh = parsePagePosts(html, username);
    if (fresh.length > 0) {
      console.log(`  page parse: ${fresh.length} posts`);
    } else {
      console.log(`  page parse returned 0 (challenge/login?) — trying item_list API`);
      usedTier = 'item_list';
      fresh = await fetchItemListApi(username);
      console.log(`  item_list API: ${fresh.length} posts`);
    }
  } catch (e) {
    console.log(`  tier A failed: ${e.message.slice(0, 100)} — trying item_list API`);
    usedTier = 'item_list';
    try {
      fresh = await fetchItemListApi(username);
    } catch (e2) {
      console.log(`  item_list API failed: ${e2.message.slice(0, 100)}`);
    }
  }

  if (fresh.length === 0) {
    console.log(`  no posts obtained — keeping existing data`);
    if (existing) {
      existing.stats = existing.stats || {};
      existing.stats.lastTtCookieAttempt = new Date().toISOString();
      existing.stats.ttCookieZero = true;
      await atomicWriteJson(outPath, existing);
    }
    return { ok: false, error: 'no_posts', added: 0 };
  }

  const { merged, added, upgraded } = mergePosts(existing?.posts, fresh);
  console.log(`  merge: +${added} new posts, ${upgraded} upgraded, total=${merged.length}`);

  const out = {
    platform: 'tiktok',
    account: { ...(existing?.account ?? account), slug, username, displayName: account.displayName },
    posts: merged,
    scrapedAt: new Date().toISOString(),
    lastTtCookieAt: new Date().toISOString(),
    stats: {
      totalPosts: merged.length,
      durationMs: Date.now() - startTime,
      isDummy: false,
      source: `tt-cookie-${usedTier}`,
      newPostsAdded: added,
      metricsUpgraded: upgraded
    }
  };
  await atomicWriteJson(outPath, out);
  console.log(`[TT-COOKIE] @${username} DONE: ${merged.length} posts (+${added}) tier=${usedTier}`);
  return { ok: true, added, total: merged.length, tier: usedTier };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const onlySlug = process.argv.find((a) => a.startsWith('only='))?.split('=')[1];
  if (!COOKIE) {
    console.error('::error::TT_SESSION_COOKIE env not set — skipping authenticated TT scrape.');
    console.error('   Set repo secret TT_SESSION_COOKIE (owner session cookie) or run free fallback.');
    process.exit(2);
  }
  const results = [];
  for (const account of ACCOUNTS_TT) {
    if (onlySlug && account.slug !== onlySlug) continue;
    try {
      const r = await scrapeAccount(account);
      results.push({ slug: account.slug, ...r });
    } catch (err) {
      console.error(`[TT-COOKIE] @${account.username} FAILED: ${err.message}`);
      results.push({ slug: account.slug, ok: false, error: err.message });
    }
    await sleep(DELAY_MS);
  }
  console.log(`\n=== TT-COOKIE SCRAPE COMPLETE ===`);
  console.log('Results:', JSON.stringify(results, null, 2));
  if (results.length > 0 && results.every((r) => !r.ok)) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

export { parsePagePosts, normalizeItem, mergePosts, hashtagsFrom };