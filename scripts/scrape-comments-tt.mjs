// Scrape comments from TikTok posts via TikWM free endpoint.
// Targets majangmejeng_ TT posts from scripts/scraped/tt-majangmejeng_.json
// Filters to posts from 2026-08-01 onwards (matches FILTER_START_MS in
// src/lib/adminComments.js). Output: scripts/scraped/comments-tt-majangmejeng_.json
//
// TikWM endpoint: GET https://www.tikwm.com/api/comment/list?url=https://www.tiktok.com/@x/video/{id}&count=50
// Proven working 2026-08-12: returned 16 real comments for video 7671590668103372040.
//
// Fails soft per post. continue-on-error compatible.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRAPED_DIR = path.join(__dirname, 'scraped');
const TARGET_SLUG = 'tt-majangmejeng_';
const FILTER_START_MS = Date.parse('2026-08-01T00:00:00Z');

// Admin marker regex — same as lib/adminComments.js ADMIN_TAGS.
// Dash-prefix with optional whitespace + alias names.
const ADMIN_PATTERNS = [
  { name: 'Reni',   re: /[-–—]\s*re(?:ni)?\b/i },
  { name: 'Rifqi',  re: /[-–—]\s*rf(?:iki|ikki|iqi)?\b/i },
  { name: 'Reta',   re: /[-–—]\s*rm(?:eta)?\b/i },
  { name: 'Julian', re: /[-–—]\s*ju(?:lian)?\b/i }
];

function detectAdmin(text) {
  if (!text) return null;
  for (const { name, re } of ADMIN_PATTERNS) {
    if (re.test(text)) return name;
  }
  return null;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchTikwmComments(videoId) {
  const url = `https://www.tikwm.com/api/comment/list?url=${encodeURIComponent(`https://www.tiktok.com/@x/video/${videoId}`)}&count=50`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TITAN-Scraper/1.0)' },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    if (data?.code !== 0) return { ok: false, error: `tikwm code=${data?.code} msg=${data?.msg || 'n/a'}` };
    const list = data?.data?.comments ?? [];
    return { ok: true, comments: list, total: data?.data?.total ?? list.length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function main() {
  const src = path.join(SCRAPED_DIR, `${TARGET_SLUG}.json`);
  let payload;
  try {
    payload = JSON.parse(await fs.readFile(src, 'utf8'));
  } catch (err) {
    console.error(`[scrape-comments-tt] cannot read ${src}: ${err.message}`);
    process.exit(2);
  }

  const posts = Array.isArray(payload?.posts) ? payload.posts : [];
  if (posts.length === 0) {
    console.error(`[scrape-comments-tt] no posts in ${src}`);
    process.exit(2);
  }

  // Filter to posts from FILTER_START_MS onward with commentCount > 0.
  // TT scraped posts use createTime (unix sec) or createTimeMs (ms). Normalize.
  const postTs = (p) => Number(p.timestampMs ?? p.createTimeMs ?? (Number(p.createTime ?? 0) * 1000) ?? 0);
  const candidates = posts
    .filter((p) => {
      const ts = postTs(p);
      if (!Number.isFinite(ts) || ts < FILTER_START_MS) return false;
      const cc = Number(p.commentCount ?? 0);
      return cc > 0;
    })
    .sort((a, b) => postTs(b) - postTs(a));

  console.log(`[scrape-comments-tt] ${candidates.length} candidates (${posts.length} total posts)`);

  const out = {
    scrapedAt: new Date().toISOString(),
    filterStartMs: FILTER_START_MS,
    account: payload.account?.username ?? TARGET_SLUG,
    posts: {},
    adminComments: []
  };

  let postsAttempted = 0;
  let postsSucceeded = 0;
  let commentsFetched = 0;
  let fetchErrors = 0;

  for (const post of candidates) {
    const id = String(post.id ?? '');
    if (!id) continue;
    postsAttempted += 1;

    const r = await fetchTikwmComments(id);
    if (!r.ok) {
      fetchErrors += 1;
      console.warn(`[scrape-comments-tt] ${id} fail: ${r.error}`);
      out.posts[id] = { ok: false, error: r.error };
      await sleep(800); // back off on error
      continue;
    }

    postsSucceeded += 1;
    commentsFetched += r.comments.length;
    out.posts[id] = {
      ok: true,
      commentCount: r.comments.length,
      total: r.total,
      fetchedAt: new Date().toISOString()
    };

    for (const c of r.comments) {
      const text = String(c?.text ?? '');
      const admin = detectAdmin(text);
      if (!admin) continue;
      out.adminComments.push({
        admin,
        postId: id,
        postUrl: `https://www.tiktok.com/@${payload.account?.username ?? ''}/video/${id}`,
        commentId: String(c?.id ?? ''),
        userUniqueId: String(c?.user?.unique_id ?? ''),
        userNickname: String(c?.user?.nickname ?? ''),
        commentText: text,
        timestampMs: Number(c?.create_time ?? 0) * 1000,
        diggCount: Number(c?.digg_count ?? 0),
        replyTotal: Number(c?.reply_total ?? 0)
      });
    }

    console.log(`[scrape-comments-tt] ${id} → ${r.comments.length} comments (${out.adminComments.length} admin so far)`);

    await sleep(1100); // TikWM rate limit guard
  }

  const dest = path.join(SCRAPED_DIR, `comments-${TARGET_SLUG}.json`);
  await fs.writeFile(dest, JSON.stringify(out, null, 2));

  console.log(`[scrape-comments-tt] summary: ${postsSucceeded}/${postsAttempted} posts OK, ${commentsFetched} comments fetched, ${out.adminComments.length} admin comments found, ${fetchErrors} errors`);
  console.log(`[scrape-comments-tt] wrote ${dest}`);
}

main().catch((err) => {
  console.error('[scrape-comments-tt] fatal:', err);
  process.exit(2);
});
