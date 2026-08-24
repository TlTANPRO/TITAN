// enrich-tt-tikwm-v36.mjs — engagement stats untuk post baru dari yt-dlp scraper.
//
// WHY: yt-dlp --flat-playlist gives id+timestamp but NO counts. This fills
// likeCount/commentCount/viewCount/shareCount via TikWM per-video API
// (mobile UA bypasses the CF challenge that blocks desktop UA — verified
// 2026-08-25). Only enriches posts missing counts, newest first, capped.
//
// Usage: node scripts/enrich-tt-tikwm-v36.mjs [--limit=20]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'accounts-full.json');
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
const DELAY_MS = 6000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchStats(videoUrl, tag) {
  const res = await fetch(`https://tikwm.com/api/?url=${encodeURIComponent(videoUrl)}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(20000),
  });
  const j = await res.json();
  if (j?.code !== 0 || !j?.data) throw new Error(`${tag}: tikwm code=${j?.code}`);
  return {
    viewCount: Number(j.data.play_count ?? 0),
    likeCount: Number(j.data.digg_count ?? 0),
    commentCount: Number(j.data.comment_count ?? 0),
    saveCount: Number(j.data.share_count ?? 0),
    durationSeconds: Number(j.data.duration ?? 0) || undefined,
  };
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : 20;

  const data = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  const ttAccounts = data.filter((a) => String(a.account?.slug ?? '').startsWith('tt-'));

  // Collect posts missing counts, newest first across all TT accounts
  const targets = [];
  for (const acct of ttAccounts) {
    for (const p of acct.posts) {
      if (p.likeCount === undefined || p.viewCount === undefined) targets.push({ acct, p });
    }
  }
  targets.sort((a, b) => (b.p.createTime ?? 0) - (a.p.createTime ?? 0));
  const batch = targets.slice(0, LIMIT);
  console.log(`[enrich-v36] ${targets.length} posts missing counts, enriching ${batch.length} (newest first)`);

  let ok = 0, fail = 0;
  for (const { acct, p } of batch) {
    try {
      const stats = await fetchStats(p.postUrl, p.shortcode);
      Object.assign(p, stats);
      ok++;
      console.log(`  [${acct.account.username}] ${p.shortcode}: ${stats.viewCount} views / ${stats.likeCount} likes`);
    } catch (e) {
      fail++;
      console.error(`  [${acct.account.username}] ${p.shortcode} FAILED: ${String(e.message).slice(0, 80)}`);
    }
    await sleep(DELAY_MS);
  }

  if (ok > 0) {
    data._meta = { ...(data._meta ?? {}), lastTtEnrich: new Date().toISOString() };
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    console.log(`[enrich-v36] done: ${ok} enriched, ${fail} failed → ${DATA_FILE}`);
  } else {
    console.log('[enrich-v36] nothing enriched');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
