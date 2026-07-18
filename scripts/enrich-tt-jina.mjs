// TikTok per-video enrichment via TikWM /api/ (videoByUrl) endpoint
// routed through Jina proxy to BYPASS TikWM datacenter rate limit
// ("Free Api Limit: 1 request/second")
//
// Strategy:
//   1. Load existing scraped/{slug}.json
//   2. For each post with videoUrl and missing/zero metrics:
//      POST TikWM /api/ via Jina proxy
//      Jina wraps as: GET https://r.jina.ai/{tikwm_url}
//   3. Append-only merge: take MAX of existing vs new
//
// Usage:
//   node scripts/enrich-tt-jina.mjs
//   node scripts/enrich-tt-jina.mjs only=tt-itsnisyananda
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNTS_TT } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'scraped');
const DELAY_MS = 12000; // Jina free tier ~10 RPM = 6s/call, 4 parallel = 24s/call; use 12s for safety
const JINA_BASE = 'https://r.jina.ai';
const TIKWM_API = 'https://www.tikwm.com/api/';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Build the TikWM body (URLSearchParams)
function buildTikwmBody(videoUrl) {
  const params = new URLSearchParams();
  params.set('url', videoUrl);
  params.set('hd', '1');
  return params.toString();
}

async function fetchVideoDetail(videoUrl, maxRetries = 3) {
  // Jina proxy pattern: GET r.jina.ai/{full_url_with_query}
  // For POST, Jina doesn't forward body — use query params instead
  const body = buildTikwmBody(videoUrl);
  const proxied = `${JINA_BASE}/${TIKWM_API}?${body}`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(proxied, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Respond-With': 'json',
        'X-Target-Method': 'POST',
        'X-Target-Body': body
      },
      signal: AbortSignal.timeout(30000)
    });
    const text = await res.text();
    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      return { ok: false, error: 'Cloudflare block via Jina' };
    }
    let j;
    try { j = JSON.parse(text); } catch { return { ok: false, error: 'parse: ' + text.slice(0, 100) }; }

    // Check for Jina rate limit (429 with retryAfter)
    if (j?.code === 429 || j?.status === 42903) {
      const wait = (j.retryAfter || 5) * 1000 + 1000;
      if (attempt < maxRetries) {
        await sleep(wait);
        continue;
      }
      return { ok: false, error: `Jina 429 after ${maxRetries} retries` };
    }

    // Jina wraps as { data: { content: "{...TikWM json...}" } } OR returns TikWM directly
    let d;
    if (j?.data?.content) {
      try { d = JSON.parse(j.data.content); } catch { return { ok: false, error: 'parse content: ' + j.data.content.slice(0, 100) }; }
    } else if (j?.code !== undefined && j?.data) {
      d = j;
    } else {
      return { ok: false, error: 'unknown Jina shape: ' + JSON.stringify(j).slice(0, 200) };
    }

    if (d.code !== 0) {
      return { ok: false, error: d.msg || `code ${d.code}` };
    }
    const data = d.data;
    return {
      ok: true,
      playCount: data.play_count,
      likeCount: data.digg_count,
      commentCount: data.comment_count,
      shareCount: data.share_count,
      saveCount: data.collect_count,
      downloadCount: data.download_count,
      duration: data.duration,
      coverUrl: data.cover,
      playUrl: data.play,
      hdplayUrl: data.hdplay
    };
  }
  return { ok: false, error: 'max retries exceeded' };
}

async function atomicWriteJson(filepath, data) {
  const tmp = filepath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, filepath);
}

async function enrichAccount(account) {
  const startTime = Date.now();
  const outPath = path.join(OUT_DIR, `${account.slug}.json`);
  console.log(`\n[TT-JINA] @${account.username} — starting`);

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
  existing.stats.lastTikwmJinaEnrichAt = new Date().toISOString();
  existing.stats.tikwmJinaAttempted = targets.length;
  existing.stats.tikwmJinaSuccess = okCount;
  existing.stats.tikwmJinaFailed = failCount;
  existing.stats.tikwmJinaUpgraded = upgradedCount;

  await atomicWriteJson(outPath, existing);
  const sec = Math.round((Date.now() - startTime) / 1000);
  console.log(`[TT-JINA] @${account.username} — DONE. ok=${okCount}/${targets.length}, upgraded=${upgradedCount} (${sec}s)`);
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
      console.error(`[TT-JINA] @${account.username} — FAILED: ${err.message}`);
      results.push({ slug: account.slug, ok: false, error: err.message });
    }
  }
  console.log(`\n=== TT-JINA ENRICH COMPLETE ===`);
  console.log('Results:', JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
