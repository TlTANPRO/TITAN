// Instagram per-post detail enrichment via yt-dlp (Python).
// Bridges to ytdlp_instagram.py in /tmp/Fullscrap/src/python/.
// Strategy:
//   1. Load existing scraped/{slug}.json
//   2. For each post that has likeCount=0 AND mediaType is VIDEO or REEL:
//      a. Call yt-dlp via Python to get like_count, comment_count
//      b. Merge (take MAX existing vs new)
//   3. Write back
//
// yt-dlp 2026.7.4+ works without auth for public posts. ~80% success rate
// on VIDEO/REEL posts. IMAGE/CAROUSEL posts typically fail (no video formats).
//
// Usage:
//   node scripts/enrich-ig-ytdlp.mjs           # all 4 IG accounts
//   node scripts/enrich-ig-ytdlp.mjs only=ig-majangmejeng_
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNTS_IG } from './accounts.mjs';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'scraped');
const PYTHON = process.env.PYTHON || 'C:/Users/Syahfalah/AppData/Local/Programs/Python/Python314/python.exe';
const YTDLP_DIR = process.env.YTDLP_DIR || 'C:/Users/Syahfalah/AppData/Local/Temp/Fullscrap/src/python';
const DELAY_MS = 1500;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Call Python yt-dlp for one URL. Returns { ok, like, comment, error }.
async function fetchPostInfo(url) {
  return new Promise((resolve) => {
    const py = spawn(PYTHON, [
      '-c',
      `
import sys, json
sys.path.insert(0, r'${YTDLP_DIR.replace(/\\/g, '\\\\')}')
from ytdlp_instagram import get_instagram_post_info
try:
    info = get_instagram_post_info('${url.replace(/'/g, "\\'")}')
    print(json.dumps({'ok': True, 'like': info.get('like_count'), 'comment': info.get('comment_count'), 'view': info.get('view_count'), 'play': info.get('play_count')}))
except Exception as e:
    print(json.dumps({'ok': False, 'error': str(e)[:120]}))
`
    ], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });

    let out = '';
    let err = '';
    py.stdout.on('data', (c) => { out += c.toString(); });
    py.stderr.on('data', (c) => { err += c.toString(); });
    py.on('close', (code) => {
      // Suppress noisy stderr; only return JSON from stdout
      try {
        // Find last line that starts with '{'
        const lines = out.split('\n').filter(Boolean);
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].startsWith('{')) {
            const j = JSON.parse(lines[i]);
            return resolve(j);
          }
        }
        resolve({ ok: false, error: 'no JSON in stdout: ' + out.slice(0, 100) });
      } catch (e) {
        resolve({ ok: false, error: 'parse error: ' + e.message });
      }
    });
    py.on('error', (e) => resolve({ ok: false, error: 'spawn: ' + e.message }));
  });
}

function mergePostMetrics(existing, newInfo) {
  if (!newInfo.ok) return { changed: false };
  let changed = false;
  for (const f of ['likeCount', 'commentCount', 'viewCount', 'playCount']) {
    if (newInfo[f.replace('Count', '_count').replace('Count', 'Count')] != null) {
      const nVal = Number(newInfo[f.replace('Count', '_count').replace('Count', 'Count')] ?? 0);
      const eVal = Number(existing[f] ?? 0);
      if (nVal > eVal) { existing[f] = nVal; changed = true; }
    }
  }
  return { changed };
}

async function atomicWriteJson(filepath, data) {
  const tmp = filepath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, filepath);
}

async function enrichAccount(account) {
  const startTime = Date.now();
  const outPath = path.join(OUT_DIR, `${account.slug}.json`);
  console.log(`\n[IG-YTDLP] @${account.username} — starting`);

  const existing = JSON.parse(await fs.readFile(outPath, 'utf-8'));
  const posts = existing.posts ?? [];
  console.log(`  loaded ${posts.length} posts`);

  // Filter: only VIDEO/REEL posts with likeCount=0 (eligible for enrichment)
  const targets = posts.filter((p) =>
    (p.mediaType === 'VIDEO' || p.mediaType === 'REEL') &&
    (Number(p.likeCount) || 0) === 0 &&
    p.shortcode
  );
  console.log(`  ${targets.length} posts eligible (VIDEO/REEL with likeCount=0)`);

  let okCount = 0;
  let failCount = 0;
  let upgradedCount = 0;
  for (let i = 0; i < targets.length; i++) {
    const p = targets[i];
    const isReel = p.mediaType === 'REEL';
    const url = `https://www.instagram.com/${isReel ? 'reel' : 'p'}/${p.shortcode}/`;
    const info = await fetchPostInfo(url);
    if (info.ok) {
      okCount++;
      // Map Python fields: like_count, comment_count, view_count → post fields
      const newData = {
        likeCount: info.like,
        commentCount: info.comment,
        viewCount: info.view,
        playCount: info.play
      };
      let changed = false;
      for (const [field, val] of Object.entries(newData)) {
        if (val != null) {
          const nVal = Number(val);
          const eVal = Number(p[field] ?? 0);
          if (nVal > eVal) { p[field] = nVal; changed = true; }
        }
      }
      if (changed) upgradedCount++;
    } else {
      failCount++;
    }
    if ((i + 1) % 10 === 0 || i === targets.length - 1) {
      console.log(`  ... ${i + 1}/${targets.length} done (ok=${okCount}, fail=${failCount}, upgraded=${upgradedCount})`);
    }
    if (i < targets.length - 1) await sleep(DELAY_MS);
  }

  existing.stats = existing.stats || {};
  existing.stats.lastYtdlpEnrichAt = new Date().toISOString();
  existing.stats.ytdlpAttempted = targets.length;
  existing.stats.ytdlpSuccess = okCount;
  existing.stats.ytdlpFailed = failCount;
  existing.stats.ytdlpUpgraded = upgradedCount;

  await atomicWriteJson(outPath, existing);
  const sec = Math.round((Date.now() - startTime) / 1000);
  console.log(`[IG-YTDLP] @${account.username} — DONE. ok=${okCount}/${targets.length}, upgraded=${upgradedCount} (${sec}s)`);
  return { ok: okCount, fail: failCount, upgraded: upgradedCount };
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
      console.error(`[IG-YTDLP] @${account.username} — FAILED: ${err.message}`);
      results.push({ slug: account.slug, ok: false, error: err.message });
    }
  }
  console.log(`\n=== IG-YTDLP ENRICH COMPLETE ===`);
  console.log('Results:', JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
