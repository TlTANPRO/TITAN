// enrich-tt-apidetail.mjs — TikTok /api/item/detail/ no-auth enrichment (19 Jul 2026)
//
// Endpoint: https://www.tiktok.com/api/item/detail/?itemId={video_id}
// Returns: itemInfo.itemStruct.statsV2.{diggCount,commentCount,playCount,shareCount,saveCount}
// Rate limit: ~100 req/min (sustained 5 RPM via Jina free tier)
//
// Strategy:
//   1. Load existing scraped/{slug}.json
//   2. For each post with id + missing/zero saveCount (or any field):
//      GET https://www.tiktok.com/api/item/detail/?itemId={id}
//   3. Append-only merge: take MAX of existing vs new
//   4. Atomic write
//
// Usage:
//   node scripts/enrich-tt-apidetail.mjs                     # all 5 TT accounts
//   node scripts/enrich-tt-apidetail.mjs only=tt-majangmejeng_
//
// Headers: minimal desktop UA, no auth required.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNTS_TT } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'scraped');
const DELAY_MS = 700; // ~85 RPM, well under 100 RPM limit
const TIMEOUT_MS = 15000;
const API_URL = 'https://www.tiktok.com/api/item/detail/';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.tiktok.com/'
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchItemDetail(itemId) {
  const url = `${API_URL}?itemId=${encodeURIComponent(itemId)}`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}` };
  }
  const text = await res.text();
  let j;
  try { j = JSON.parse(text); } catch {
    return { ok: false, error: 'non-JSON response' };
  }
  // Shape: { itemInfo: { itemStruct: { statsV2: {...} } } }
  const statsV2 = j?.itemInfo?.itemStruct?.statsV2;
  if (!statsV2) {
    return { ok: false, error: j?.itemInfo?.messages?.[0] || 'no statsV2' };
  }
  return {
    ok: true,
    likeCount: Number(statsV2.diggCount ?? 0),
    commentCount: Number(statsV2.commentCount ?? 0),
    viewCount: Number(statsV2.playCount ?? 0),
    shareCount: Number(statsV2.shareCount ?? 0),
    saveCount: Number(statsV2.saveCount ?? 0)
  };
}

function mergePosts(existingPosts, fresh) {
  const byId = new Map();
  for (const p of existingPosts || []) {
    if (p?.id) byId.set(String(p.id), { ...p });
  }
  let addedCount = 0;
  let upgradedCount = 0;
  for (const [id, f] of Object.entries(fresh)) {
    if (!f.ok) continue;
    const existing = byId.get(id);
    if (!existing) continue;
    let changed = false;
    for (const field of ['likeCount', 'commentCount', 'viewCount', 'shareCount', 'saveCount']) {
      const nVal = f[field] ?? 0;
      const eVal = Number(existing[field] ?? 0);
      if (nVal > eVal) { existing[field] = nVal; changed = true; }
    }
    if (changed) upgradedCount++;
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

async function enrichAccount(account) {
  const startTime = Date.now();
  const outPath = path.join(OUT_DIR, `${account.slug}.json`);
  let existing = null;
  try {
    existing = JSON.parse(await fs.readFile(outPath, 'utf-8'));
  } catch {
    console.warn(`[TT-APIDETAIL] @${account.username} — no existing file, skipping`);
    return { slug: account.slug, ok: false, error: 'no existing data' };
  }

  const posts = existing.posts || [];
  // Eligible: posts with id AND (any key metric missing/zero)
  const eligible = posts.filter((p) => p?.id && (
    !p.likeCount || !p.commentCount || !p.viewCount || !p.shareCount || !p.saveCount
  ));
  console.log(`[TT-APIDETAIL] @${account.username} — ${eligible.length} eligible of ${posts.length} posts`);

  const fresh = {};
  let okCount = 0;
  let failCount = 0;
  let rateLimitHits = 0;

  for (let i = 0; i < eligible.length; i++) {
    const p = eligible[i];
    if (i > 0 && i % 50 === 0) {
      console.log(`  progress: ${i}/${eligible.length} (${okCount} ok, ${failCount} fail, ${rateLimitHits} 429)`);
    }
    let result;
    try {
      result = await fetchItemDetail(p.id);
    } catch (e) {
      result = { ok: false, error: e.message?.slice(0, 60) || 'unknown' };
    }
    if (result.ok) {
      fresh[p.id] = result;
      okCount++;
    } else if (result.error?.includes('429') || result.error?.includes('Too Many')) {
      rateLimitHits++;
      // back off harder
      await sleep(5000);
    } else {
      failCount++;
    }
    await sleep(DELAY_MS);
  }

  const { merged, addedCount, upgradedCount } = mergePosts(existing.posts, fresh);

  const out = {
    ...existing,
    posts: merged,
    lastApidetailEnrichAt: new Date().toISOString(),
    stats: {
      ...(existing.stats || {}),
      apidetailEnrichment: {
        eligible: eligible.length,
        ok: okCount,
        failed: failCount,
        rateLimitHits,
        upgraded: upgradedCount
      }
    }
  };

  await atomicWriteJson(outPath, out);
  const sec = Math.round((Date.now() - startTime) / 1000);
  console.log(`[TT-APIDETAIL] @${account.username} — DONE. ${upgradedCount} upgraded of ${eligible.length} eligible (${sec}s, ${okCount} ok / ${failCount} fail / ${rateLimitHits} 429)`);
  return { slug: account.slug, ok: true, eligible: eligible.length, upgraded: upgradedCount, okCount, failCount, rateLimitHits };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const args = process.argv.slice(2);
  const onlySlug = args.find((a) => a.startsWith('only='))?.split('=')[1];
  const results = [];
  for (const account of ACCOUNTS_TT) {
    if (onlySlug && account.slug !== onlySlug) continue;
    try {
      const r = await enrichAccount(account);
      results.push(r);
    } catch (err) {
      console.error(`[TT-APIDETAIL] @${account.username} — FAILED: ${err.message}`);
      results.push({ slug: account.slug, ok: false, error: err.message });
    }
  }
  console.log('\n=== TT-APIDETAIL ENRICH COMPLETE ===');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
