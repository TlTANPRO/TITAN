// Instagram per-post detail enrichment via i.instagram.com /api/v1/feed/user/
// (uses Android UA which returns play_count even for /feed/user/ endpoint)
//
// Strategy:
//   1. Load existing scraped/{slug}.json
//   2. Fetch /feed/user/{pk}/ paginated (12 posts per page)
//   3. Match incoming posts to existing posts by shortcode
//   4. Merge like_count, comment_count, play_count via MAX
//
// Endpoint: GET /api/v1/feed/user/{userId}/?count=12&max_id={cursor}
// UA: Instagram 219.0.0.12.117 Android (returns play_count on feed/user)
//
// IMPORTANT: /feed/user/ is RATE-LIMITED (HTTP 401 after a few calls).
// Set DELAY_MS >= 5000 (5 sec) and limit total calls per session.
//
// Usage:
//   node scripts/enrich-ig-android-feed.mjs           # all 4 IG accounts
//   node scripts/enrich-ig-android-feed.mjs only=ig-majangmejeng_

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNTS_IG } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'scraped');
const DELAY_MS = 4500; // 4.5s — /feed/user/ aggressively rate-limits
const TIMEOUT_MS = 15000;
const MAX_PAGES = 30; // 30 pages × 12 = 360 posts max
const BACKOFF_BASE_MS = 15000; // exponential backoff base on 401/429

const ANDROID_HEADERS = {
  'User-Agent': 'Instagram 219.0.0.12.117 Android (26/8.0.0; 480dpi; 1080x1920; OnePlus; 6T Dev; devitron; qcom; en_US; 314665256)',
  'x-ig-app-id': '936619743392459',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Origin': 'https://www.instagram.com',
  'Referer': 'https://www.instagram.com/',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
};

const BASE_URL = 'https://i.instagram.com/api/v1';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function igGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: ANDROID_HEADERS,
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const text = await res.text();
  if (text.includes('"login_required"') || text.includes('"require_login":true')) {
    return { ok: false, error: 'login_required', rateLimited: true };
  }
  if (res.status === 401 || res.status === 429) {
    return { ok: false, error: `HTTP ${res.status}`, rateLimited: true, body: text.slice(0, 200) };
  }
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}`, rateLimited: false, body: text.slice(0, 200) };
  }
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: 'json_parse: ' + e.message, rateLimited: false };
  }
}

async function atomicWriteJson(filepath, data) {
  const tmp = filepath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, filepath);
}

async function enrichAccount(account) {
  const startTime = Date.now();
  const outPath = path.join(OUT_DIR, `${account.slug}.json`);
  console.log(`\n[IG-ANDROID-FEED] @${account.username} — starting`);

  const existing = JSON.parse(await fs.readFile(outPath, 'utf-8'));
  const posts = existing.posts ?? [];
  console.log(`  loaded ${posts.length} posts`);

  const userId = existing.account?.pk;
  if (!userId) {
    console.log(`  no userId (pk) in existing data, skipping`);
    return { ok: 0, fail: 0, upgraded: 0, skipped: 'no_pk' };
  }
  console.log(`  pk: ${userId}`);

  // Build a shortcode → post lookup for matching
  const byShortcode = new Map();
  for (const p of posts) {
    if (p.shortcode) byShortcode.set(p.shortcode, p);
  }

  // Fetch all pages
  let maxId = '';
  let moreAvailable = true;
  let page = 0;
  let okCount = 0;
  let failCount = 0;
  let upgradedCount = 0;
  let rateLimited = false;

  while (moreAvailable && page < MAX_PAGES && !rateLimited) {
    page++;
    const path = maxId
      ? `/feed/user/${userId}/?count=12&max_id=${encodeURIComponent(maxId)}`
      : `/feed/user/${userId}/?count=12`;

    let result = await igGet(path);
    if (!result.ok && result.rateLimited) {
      // Exponential backoff: 15s, 30s, 60s, 120s
      const waitMs = BACKOFF_BASE_MS * Math.pow(2, Math.min(page, 4));
      console.log(`  page ${page}: RATE LIMITED (${result.error}) — backing off ${waitMs / 1000}s`);
      await sleep(waitMs);
      result = await igGet(path);
      if (!result.ok) {
        rateLimited = true;
        break;
      }
    }
    if (!result.ok) {
      if (result.rateLimited) {
        rateLimited = true;
        break;
      }
      failCount++;
      console.log(`  page ${page}: error ${result.error}`);
      break;
    }

    const items = result.data.items ?? [];
    if (items.length === 0) {
      console.log(`  page ${page}: empty, stopping`);
      break;
    }

    let pageUpgraded = 0;
    for (const m of items) {
      const shortcode = m.code;
      if (!shortcode) continue;
      const existing = byShortcode.get(shortcode);
      if (!existing) continue; // unknown post (not in our scraped data)

      const newData = {
        likeCount: m.like_count,
        commentCount: m.comment_count,
        viewCount: m.play_count ?? m.view_count,
        playCount: m.play_count
      };

      let changed = false;
      for (const [field, val] of Object.entries(newData)) {
        if (val != null && val > 0) {
          const nVal = Number(val);
          const eVal = Number(existing[field] ?? 0);
          if (nVal > eVal) {
            existing[field] = nVal;
            changed = true;
          }
        }
      }
      if (changed) {
        pageUpgraded++;
        upgradedCount++;
      }
      okCount++;
    }

    console.log(`  page ${page}: ${items.length} posts, ${pageUpgraded} upgraded, total upgraded=${upgradedCount}`);

    maxId = result.data.next_max_id ?? '';
    moreAvailable = result.data.more_available ?? false;

    if (moreAvailable && maxId) {
      await sleep(DELAY_MS);
    } else {
      break;
    }
  }

  existing.stats = existing.stats || {};
  existing.stats.lastAndroidFeedEnrichAt = new Date().toISOString();
  existing.stats.androidFeedAttempted = page;
  existing.stats.androidFeedUpgraded = upgradedCount;
  existing.stats.androidFeedRateLimited = rateLimited;

  await atomicWriteJson(outPath, existing);
  const sec = Math.round((Date.now() - startTime) / 1000);
  console.log(`[IG-ANDROID-FEED] @${account.username} — DONE. ${page} pages, ${upgradedCount} upgraded (${sec}s, rateLimited=${rateLimited})`);
  return { ok: okCount, fail: failCount, upgraded: upgradedCount, pages: page, rateLimited };
}

async function main() {
  const args = process.argv.slice(2);
  const onlySlug = args.find((a) => a.startsWith('only='))?.split('=')[1];
  const results = [];
  for (const account of ACCOUNTS_IG) {
    if (onlySlug && account.slug !== onlySlug) continue;
    try {
      const r = await enrichAccount(account);
      results.push({ slug: account.slug, ok: true, ...r });
    } catch (err) {
      console.error(`[IG-ANDROID-FEED] @${account.username} — FAILED: ${err.message}`);
      results.push({ slug: account.slug, ok: false, error: err.message });
    }
  }
  console.log(`\n=== IG-ANDROID-FEED ENRICH COMPLETE ===`);
  console.log('Results:', JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
