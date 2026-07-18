// TikTok per-video enrichment via TikWM /api/ (videoByUrl) endpoint.
// Returns full per-video metrics: play_count, digg_count, comment_count,
// share_count, collect_count, download_count.
// CONFIRMED WORKS — diuji: 15 Jul 2026 (Fullscrap repo).
//
// Strategy:
//   1. Load existing scraped/{slug}.json
//   2. For each post with videoUrl and missing/zero metrics:
//      POST https://www.tikwm.com/api/ with body {url, hd: 1}
//      Body MUST be sent as URLSearchParams (not .toString()) to set proper
//      Content-Type: application/x-www-form-urlencoded
//   3. Append-only merge: take MAX of existing vs new
//
// Usage:
//   node scripts/enrich-tt-tikwm.mjs           # all 5 TT accounts
//   node scripts/enrich-tt-tikwm.mjs only=tt-itsnisyananda
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNTS_TT } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'scraped');
const DELAY_MS = 1500;
const TIKWM_URL = 'https://www.tikwm.com/api/';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchVideoDetail(videoUrl) {
  const params = new URLSearchParams();
  params.set('url', videoUrl);
  params.set('hd', '1');
  const res = await fetch(TIKWM_URL, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://www.tikwm.com/',
      'Accept': 'application/json'
    },
    body: params,
    signal: AbortSignal.timeout(30000)
  });
  const text = await res.text();
  if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
    return { ok: false, error: 'Cloudflare block' };
  }
  const j = JSON.parse(text);
  if (j.code !== 0) {
    return { ok: false, error: j.msg || `code ${j.code}` };
  }
  const d = j.data;
  return {
    ok: true,
    playCount: d.play_count,
    likeCount: d.digg_count,
    commentCount: d.comment_count,
    shareCount: d.share_count,
    saveCount: d.collect_count,
    downloadCount: d.download_count,
    duration: d.duration,
    coverUrl: d.cover,
    playUrl: d.play,
    hdplayUrl: d.hdplay
  };
}

async function atomicWriteJson(filepath, data) {
  const tmp = filepath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, filepath);
}

async function enrichAccount(account) {
  const startTime = Date.now();
  const outPath = path.join(OUT_DIR, `${account.slug}.json`);
  console.log(`\n[TT-TIKWM] @${account.username} — starting`);

  const existing = JSON.parse(await fs.readFile(outPath, 'utf-8'));
  const posts = existing.posts ?? [];
  console.log(`  loaded ${posts.length} posts`);

  // Filter: posts with videoUrl that have 0/empty commentCount, shareCount, or saveCount
  const targets = posts.filter((p) => p.videoUrl && (
    (Number(p.commentCount) || 0) === 0 ||
    (Number(p.shareCount) || 0) === 0 ||
    (Number(p.saveCount) || 0) === 0
  ));
  console.log(`  ${targets.length} posts eligible (missing cmt/share/save)`);

  let okCount = 0;
  let failCount = 0;
  let upgradedCount = 0;
  for (let i = 0; i < targets.length; i++) {
    const p = targets[i];
    // Strip query params from videoUrl for clean URL
    const cleanUrl = p.videoUrl.split('?')[0];
    const info = await fetchVideoDetail(cleanUrl);
    if (info.ok) {
      okCount++;
      let changed = false;
      for (const [field, val] of Object.entries(info)) {
        if (['playCount', 'likeCount', 'commentCount', 'shareCount', 'saveCount', 'downloadCount', 'duration'].includes(field) && val != null) {
          const nVal = Number(val);
          const eVal = Number(p[field] ?? 0);
          if (nVal > eVal) { p[field] = nVal; changed = true; }
        }
      }
      // Update coverUrl if missing
      if (!p.coverUrl && info.coverUrl) { p.coverUrl = info.coverUrl; changed = true; }
      if (!p.playUrl && info.playUrl) { p.playUrl = info.playUrl; changed = true; }
      if (changed) upgradedCount++;
    } else {
      failCount++;
      if (failCount <= 3) console.log(`  ! fail ${p.id}: ${info.error}`);
    }
    if ((i + 1) % 10 === 0 || i === targets.length - 1) {
      console.log(`  ... ${i + 1}/${targets.length} done (ok=${okCount}, fail=${failCount}, upgraded=${upgradedCount})`);
    }
    if (i < targets.length - 1) await sleep(DELAY_MS);
  }

  existing.stats = existing.stats || {};
  existing.stats.lastTikwmEnrichAt = new Date().toISOString();
  existing.stats.tikwmAttempted = targets.length;
  existing.stats.tikwmSuccess = okCount;
  existing.stats.tikwmFailed = failCount;
  existing.stats.tikwmUpgraded = upgradedCount;

  await atomicWriteJson(outPath, existing);
  const sec = Math.round((Date.now() - startTime) / 1000);
  console.log(`[TT-TIKWM] @${account.username} — DONE. ok=${okCount}/${targets.length}, upgraded=${upgradedCount} (${sec}s)`);
  return { ok: okCount, fail: failCount, upgraded: upgradedCount };
}

async function main() {
  const args = process.argv.slice(2);
  const onlySlug = args.find((a) => a.startsWith('only='))?.split('=')[1];
  const results = [];
  for (const account of ACCOUNTS_TT) {
    if (onlySlug && account.slug !== onlySlug) continue;
    try {
      const r = await enrichAccount(account);
      results.push({ slug: account.slug, ok: true, ...r });
    } catch (err) {
      console.error(`[TT-TIKWM] @${account.username} — FAILED: ${err.message}`);
      results.push({ slug: account.slug, ok: false, error: err.message });
    }
  }
  console.log(`\n=== TT-TIKWM ENRICH COMPLETE ===`);
  console.log('Results:', JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
