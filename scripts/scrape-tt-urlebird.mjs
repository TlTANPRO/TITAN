// scrape-tt-urlebird.mjs — TikTok scraper via Urlebird (tested working 2026-08-23)
//
// WHY: previous discovery (DDG/Bing via Jina) returned 0-5 random videos and
// TT accounts went stale up to 2 months. TikWM direct = Cloudflare challenge
// (tested). TikTok CDN/API = 403 from all our IPs (tested).
//
// PROVEN chain (each step verified live):
//   1. Jina reader -> urlebird.com/user/<u>/          = 20 latest videos
//      (id, caption, relative time "3 hours ago")
//   2. Video ID >> 32 = exact post timestamp (TikTok snowflake, verified:
//      7677130257551559954 -> 2026-08-23T07:46Z, page said "3 hours ago" ✓)
//   3. Jina reader -> urlebird.com/video/<id>/ detail = views/likes/comments/
//      shares/full caption/hashtags
//   4. Merge append-only into accounts-full.json by id (no dupes)
//
// Usage: node scripts/scrape-tt-urlebird.mjs [--force]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNTS_TT } from './accounts.mjs';
import { fetchWithRetry } from './lib/http-retry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'accounts-full.json');
const JINA_BASE = 'https://r.jina.ai';
const URLEBIRD_BASE = 'https://urlebird.com';
// Jina rate limit: detail-page fetches timed out at 3s delay (tested 2026-08-23).
// 8s between detail pages is stable; profile fetches are 1 per account.
const DELAY_MS = 8000;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function jinaGet(url, tag) {
  const r = await fetchWithRetry(`${JINA_BASE}/${url}`, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(60000),
  }, { tag, maxAttempts: 3 });
  const j = JSON.parse(await r.text());
  if (j?.code !== 200 || !j?.data?.content) throw new Error(`${tag}: Jina bad response: ${String(j?.message).slice(0, 100)}`);
  return j.data.content;
}

// ---- Step 1: profile page -> list of {id, caption, agoText, slug} ----
export function parseProfileListing(markdown) {
  const out = new Map(); // id -> {id, caption, agoText, slug}
  const re = /\[([^\]]*)\]\(https:\/\/urlebird\.com\/video\/([^)]*?)(\d{18,20})\/\)/g;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    const caption = m[1].trim();
    const slugPart = m[2]; // slug WITHOUT trailing id (may be empty for bare links)
    const id = m[3];
    const end = m.index + m[0].length;
    const tail = markdown.slice(end, end + 400);
    const ago = tail.match(/(\d+ \w+ ago|just now)/);
    if (!out.has(id)) {
      const slug = (slugPart + id).replace(/\/$/, '');
      out.set(id, { id, caption, agoText: ago ? ago[1] : null, slug });
    }
  }
  return [...out.values()];
}

// ---- Step 2: snowflake -> exact UTC date ----
export function idToTimestamp(id) {
  return new Date(Number(BigInt(id) >> 32n) * 1000).toISOString();
}

// ---- Step 3: detail page -> stats + full caption ----
export function parseDetail(markdown) {
  const num = (label) => {
    const m = markdown.match(new RegExp(`([\\d.,]+[KkMm]?)\\s*\\n*\\s*${label}`, 'i'));
    if (!m) return 0;
    const v = parseFloat(m[1].replace(/,/g, ''));
    if (/m/i.test(m[1])) return Math.round(v * 1e6);
    if (/k/i.test(m[1])) return Math.round(v * 1e3);
    return Math.round(v);
  };
  const posted = markdown.match(/Posted ([^\n]+?)(?:\n|$)/);
  const captionBlock = markdown.match(/\n# ([^\n]+)/);
  const hashtags = captionBlock
    ? (captionBlock[1].match(/#[^\s#]+/g) ?? []).map((t) => t.toLowerCase())
    : [];
  const caption = captionBlock ? captionBlock[1] : '';
  const music = markdown.match(/\[([^\]]+)\]\(https:\/\/urlebird\.com\/song\//);
  return {
    viewCount: num('views'),
    likeCount: num('likes'),
    commentCount: num('comments'),
    shareCount: num('shares'),
    postedAgo: posted ? posted[1].trim() : null,
    caption,
    hashtags: [...new Set(hashtags)],
    music: music ? music[1] : null,
  };
}

function parseAgoToMs(agoText) {
  if (!agoText) return null;
  const m = agoText.match(/(\d+) (minute|hour|day|week|month)s? ago/);
  if (!m) return 0;
  const mult = { minute: 60e3, hour: 3600e3, day: 86400e3, week: 604800e3, month: 2592000e3 };
  return Date.now() - Number(m[1]) * mult[m[2]];
}

export async function scrapeUser(username, existingShortcodes = new Set(), opts = {}) {
  const profileMd = await jinaGet(`${URLEBIRD_BASE}/user/${username}/`, `urlebird-profile@${username}`);
  const listing = parseProfileListing(profileMd);
  if (listing.length === 0) throw new Error(`urlebird-profile@${username}: 0 videos found`);
  console.log(`  [${username}] ${listing.length} videos discovered`);
  // Detail pages are the rate-limit bottleneck (8s each via Jina). Only fetch
  // detail for NEW posts; refresh stats for at most MAX_STATS_REFRESH existing
  // posts per run (newest first).
  const MAX_STATS_REFRESH = opts.maxStatsRefresh ?? 5;
  const newItems = listing.filter((x) => !existingShortcodes.has(x.id));
  const refreshItems = listing
    .filter((x) => existingShortcodes.has(x.id))
    .slice(0, MAX_STATS_REFRESH);
  const detailTargets = new Map(newItems.map((x) => [x.id, 'new']));
  for (const x of refreshItems) detailTargets.set(x.id, 'refresh');
  const posts = [];
  for (const item of listing) {
    const mode = detailTargets.get(item.id); // 'new' | 'refresh' | undefined
    const postedAt = idToTimestamp(item.id);
    const base = {
      id: `${username}-${item.id}`,
      shortcode: item.id,
      createTime: Math.floor(Number(BigInt(item.id) >> 32n)),
      timestamp: Number(BigInt(item.id) >> 32n),
      postedAt,
      postUrl: `https://www.tiktok.com/@${username}/video/${item.id}`,
      mediaType: 'VIDEO',
      isVideo: true,
      platform: 'tiktok',
      source: 'urlebird',
      caption: item.caption,
    };
    if (!mode) {
      // Existing post, not in refresh window -> listing-level data only
      posts.push({ ...base, hashtags: (item.caption.match(/#[^\s#]+/g) ?? []).map((t) => t.toLowerCase()) });
      continue;
    }
    try {
      await sleep(DELAY_MS);
      const detailMd = await jinaGet(`${URLEBIRD_BASE}/video/${item.slug}/`, `urlebird-detail@${item.id}`);
      const d = parseDetail(detailMd);
      posts.push({
        ...base,
        caption: d.caption || item.caption,
        hashtags: d.hashtags.length ? d.hashtags : (item.caption.match(/#[^\s#]+/g) ?? []).map((t) => t.toLowerCase()),
        viewCount: d.viewCount,
        likeCount: d.likeCount,
        commentCount: d.commentCount,
        saveCount: d.shareCount,
        music: d.music,
      });
    } catch (e) {
      // detail failed -> keep listing-level data, enrichable later by enrich-tt-tikwm
      console.log(`    detail miss ${item.id}: ${String(e.message).slice(0, 60)}`);
      posts.push({ ...base, hashtags: (item.caption.match(/#[^\s#]+/g) ?? []).map((t) => t.toLowerCase()) });
    }
  }
  return posts;
}

async function main() {
  const force = process.argv.includes('--force');
  const data = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  const ttAccounts = data.filter((a) => a.platform === 'tiktok');
  let totalNew = 0;

  for (const acct of ttAccounts) {
    const username = acct.account.username;
    console.log(`Scraping TT @${username} ...`);
    try {
      const existingIds = new Set(acct.posts.map((p) => String(p.shortcode)));
      const fresh = await scrapeUser(username, existingIds);
      const newPosts = fresh.filter((p) => !existingIds.has(String(p.shortcode)));
      // merge stats into existing posts (only refresh-window posts have stats)
      const byId = new Map(fresh.map((p) => [String(p.shortcode), p]));
      let updated = 0;
      for (const p of acct.posts) {
        const f = byId.get(String(p.shortcode));
        if (f && f.likeCount !== undefined && (f.likeCount !== p.likeCount || f.commentCount !== p.commentCount || f.viewCount !== p.viewCount)) {
          p.likeCount = f.likeCount; p.commentCount = f.commentCount; p.viewCount = f.viewCount;
          updated++;
        }
      }
      acct.posts.push(...newPosts);
      acct.posts.sort((a, b) => (b.createTime ?? 0) - (a.createTime ?? 0));
      totalNew += newPosts.length;
      console.log(`  [${username}] +${newPosts.length} new, ${updated} stats refreshed`);
    } catch (e) {
      console.error(`  [${username}] FAILED: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }

  if (totalNew > 0 || force) {
    data._meta = { ...(data._meta ?? {}), lastTtUrlebirdScrape: new Date().toISOString() };
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2) + '\n');
    console.log(`Saved: +${totalNew} new TT posts`);
  } else {
    console.log('No new posts, file untouched');
  }
}

// Run only when executed directly (tests import the parsers)
const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
