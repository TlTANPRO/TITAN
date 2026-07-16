// Instagram per-post enrichment via /api/v1/media/{shortcode}/info/
// Returns like_count + comment_count for ANY media type (IMAGE / VIDEO / REEL / CAROUSEL)
//
// Endpoint: /api/v1/media/{shortcode}/info/
// UA: Instagram 219.0.0.12.117 Android
//
// STATUS: Currently returns 403 "login_required" without auth session.
// Kept for reference + retry when IG rate-limit window allows anonymous access.
//
// Usage:
//   node scripts/enrich-ig-android-info.mjs
//   node scripts/enrich-ig-android-info.mjs only=ig-majangmejeng_

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNTS_IG } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'scraped');
const DELAY_MS = 4000;
const TIMEOUT_MS = 15000;
const MAX_CONSEC_FAILS = 12;
const BACKOFF_BASE_MS = 12000;

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
  'Sec-Fetch-Site': 'same-site'
};

const BASE_URL = 'https://i.instagram.com/api/v1';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function igGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: ANDROID_HEADERS,
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const text = await res.text();
  if (res.status === 404) return { ok: false, error: 'not_found', rateLimited: false };
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
  console.log(`\n[IG-INFO] @${account.username} — starting`);

  const existing = JSON.parse(await fs.readFile(outPath, 'utf-8'));
  const posts = existing.posts ?? [];
  console.log(`  loaded ${posts.length} posts`);

  const targets = posts.filter((p) => p.shortcode && (Number(p.likeCount) || 0) === 0);
  console.log(`  ${targets.length} posts eligible (shortcode + likeCount=0)`);

  let okCount = 0;
  let failCount = 0;
  let upgradedCount = 0;
  let consecFails = 0;
  let backoff = 0;
  let stopped = false;

  for (let i = 0; i < targets.length; i++) {
    const p = targets[i];
    const path = `/media/${p.shortcode}/info/`;
    const result = await igGet(path);
    if (result.ok) {
      const m = result.data?.items?.[0] ?? result.data;
      if (m) {
        const newData = {
          likeCount: m.like_count,
          commentCount: m.comment_count,
          viewCount: m.video_view_count ?? m.play_count,
          playCount: m.play_count
        };
        let changed = false;
        for (const [field, val] of Object.entries(newData)) {
          if (val != null && val > 0) {
            const nVal = Number(val);
            const eVal = Number(p[field] ?? 0);
            if (nVal > eVal) {
              p[field] = nVal;
              changed = true;
            }
          }
        }
        if (changed) upgradedCount++;
        okCount++;
        consecFails = 0;
      } else {
        failCount++;
        consecFails++;
      }
    } else {
      failCount++;
      consecFails++;
      if (result.rateLimited) {
        const waitMs = BACKOFF_BASE_MS * Math.pow(2, Math.min(backoff, 3));
        backoff++;
        console.log(`  ! RATE LIMITED (${result.error}) at post ${i + 1}/${targets.length} — backing off ${waitMs / 1000}s`);
        await sleep(waitMs);
        const retry = await igGet(path);
        if (retry.ok) {
          const m = retry.data?.items?.[0] ?? retry.data;
          if (m) {
            const newData = {
              likeCount: m.like_count,
              commentCount: m.comment_count,
              viewCount: m.video_view_count ?? m.play_count,
              playCount: m.play_count
            };
            let changed = false;
            for (const [field, val] of Object.entries(newData)) {
              if (val != null && val > 0) {
                const nVal = Number(val);
                const eVal = Number(p[field] ?? 0);
                if (nVal > eVal) {
                  p[field] = nVal;
                  changed = true;
                }
              }
            }
            if (changed) upgradedCount++;
            okCount++;
            consecFails = 0;
          }
        } else {
          stopped = true;
          break;
        }
      } else if (failCount <= 3) {
        console.log(`  ! fail ${p.shortcode}: ${result.error}`);
      }
    }

    if (consecFails >= MAX_CONSEC_FAILS) {
      console.log(`  too many consecutive failures (${consecFails}), stopping`);
      stopped = true;
      break;
    }

    if ((i + 1) % 20 === 0 || i === targets.length - 1) {
      console.log(`  ... ${i + 1}/${targets.length} (ok=${okCount}, fail=${failCount}, upgraded=${upgradedCount})`);
    }
    if (i < targets.length - 1 && !stopped) await sleep(DELAY_MS);
  }

  existing.stats = existing.stats || {};
  existing.stats.lastAndroidInfoEnrichAt = new Date().toISOString();
  existing.stats.androidInfoAttempted = targets.length;
  existing.stats.androidInfoSuccess = okCount;
  existing.stats.androidInfoUpgraded = upgradedCount;
  existing.stats.androidInfoStopped = stopped;

  await atomicWriteJson(outPath, existing);
  const sec = Math.round((Date.now() - startTime) / 1000);
  console.log(`[IG-INFO] @${account.username} — DONE. ok=${okCount}/${targets.length}, upgraded=${upgradedCount} (${sec}s, stopped=${stopped})`);
  return { ok: okCount, fail: failCount, upgraded: upgradedCount, stopped };
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
      console.error(`[IG-INFO] @${account.username} — FAILED: ${err.message}`);
      results.push({ slug: account.slug, ok: false, error: err.message });
    }
  }
  console.log(`\n=== IG-INFO ENRICH COMPLETE ===`);
  console.log('Results:', JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
