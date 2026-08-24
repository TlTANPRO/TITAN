// scrape-tt-ytdlp.mjs — TikTok scraper via yt-dlp (primary source, V35)
//
// WHY: Urlebird started returning 403 / "0 videos found" (2026-08-23 run),
// and TikWM is behind Cloudflare challenge both direct and via Jina.
// yt-dlp --flat-playlist against tiktok.com/@user verified working 2026-08-24
// for ALL 5 accounts, returning id|timestamp directly (no per-video fetch
// needed for discovery; snowflake timestamp embedded in id).
//
// Engagement stats: flat-playlist gives no counts. We keep existing stats on
// merge and let enrich pass fill new posts opportunistically (non-fatal).
//
// Usage: node scripts/scrape-tt-ytdlp.mjs [--force]
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'accounts-full.json');

// NOTE: --playlist-items with a small N made TikTok return only 1 entry
// (tested 2026-08-24). Fetch the full flat list (fast, no per-video requests)
// and truncate client-side.
export async function ytdlpFlatList(username, limit = 30) {
  const { stdout } = await execFileP('yt-dlp', [
    '--flat-playlist',
    '--print', '%(id)s|%(timestamp)s|%(title).500s',
    `https://www.tiktok.com/@${username}`,
  ], { timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
  const out = [];
  for (const line of stdout.split('\n')) {
    if (out.length >= limit) break;
    const parts = line.split('|');
    if (parts.length < 2 || !/^\d{15,25}$/.test(parts[0])) continue;
    const id = parts[0];
    const ts = Number(parts[1]);
    out.push({ id, ts, title: parts.slice(2).join('|') || '' });
  }
  return out;
}

function hashtagsFrom(text) {
  return [...new Set((text.match(/#[^\s#]+/g) ?? []).map((t) => t.toLowerCase()))];
}

export async function scrapeUser(username, existingShortcodes = new Set(), opts = {}) {
  const items = await ytdlpFlatList(username, opts.limit ?? 30);
  if (items.length === 0) throw new Error(`ytdlp@${username}: 0 videos found`);
  console.log(`  [${username}] ${items.length} videos discovered`);
  const posts = [];
  for (const it of items) {
    const createSec = it.ts || Math.floor(Number(BigInt(it.id) >> 32n));
    posts.push({
      id: `${username}-${it.id}`,
      shortcode: it.id,
      createTime: createSec,
      timestamp: createSec * 1000,
      postedAt: new Date(createSec * 1000).toISOString(),
      postUrl: `https://www.tiktok.com/@${username}/video/${it.id}`,
      mediaType: 'VIDEO',
      isVideo: true,
      platform: 'tiktok',
      source: 'ytdlp',
      caption: it.title,
      hashtags: hashtagsFrom(it.title),
    });
  }
  // newest first
  posts.sort((a, b) => b.createTime - a.createTime);
  return posts;
}

async function main() {
  const force = process.argv.includes('--force');
  const data = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  const ttAccounts = data.filter((a) => a.platform === 'tiktok');
  let totalNew = 0;
  let failures = 0;

  for (const acct of ttAccounts) {
    const username = acct.account.username;
    console.log(`Scraping TT @${username} ...`);
    try {
      const existingIds = new Set(acct.posts.map((p) => String(p.shortcode)));
      const fresh = await scrapeUser(username, existingIds);
      const byId = new Map(fresh.map((p) => [String(p.shortcode), p]));
      const newPosts = fresh.filter((p) => !existingIds.has(String(p.shortcode)));
      acct.posts.push(...newPosts);
      acct.posts.sort((a, b) => (b.createTime ?? 0) - (a.createTime ?? 0));
      totalNew += newPosts.length;
      const latest = acct.posts[0];
      console.log(`  [${username}] +${newPosts.length} new | latest: ${latest?.postedAt ?? '?'}`);
    } catch (e) {
      failures++;
      console.error(`  [${username}] FAILED: ${String(e.message).slice(0, 120)}`);
    }
  }

  if (failures >= ttAccounts.length && !force) {
    console.error('::error::All TT accounts failed — keeping old data');
    process.exit(1);
  }
  if (totalNew > 0 || force) {
    data._meta = { ...(data._meta ?? {}), lastTtYtdlpScrape: new Date().toISOString() };
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    console.log(`Wrote ${DATA_FILE} (+${totalNew} new posts)`);
  } else {
    console.log('No new posts — file untouched');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
