// Scrape comments from Instagram posts via Jina web proxy.
// Targets majangmejeng_ IG posts from scripts/scraped/ig-majangmejeng_.json
// Filters to posts from 2026-08-01 onwards (matches FILTER_START_MS in
// src/lib/adminComments.js). Output: scripts/scraped/comments-ig-majangmejeng_.json
//
// Jina proxy: GET https://r.jina.ai/https://www.instagram.com/p/{shortcode}/
// Jina returns the page rendered as markdown; admin comments typically appear
// as bullet lines under the post. We scan the markdown for admin marker
// patterns and extract user@handle + relative timestamp.
//
// Fails soft per post. continue-on-error compatible.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchWithRetry, HttpTerminalError, sleep } from './lib/http-retry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRAPED_DIR = path.join(__dirname, 'scraped');
const TARGET_SLUG = 'ig-majangmejeng_';
const FILTER_START_MS = Date.parse('2026-08-01T00:00:00Z');

// Admin marker regex — same as lib/adminComments.js ADMIN_TAGS.
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

async function fetchJinaPage(shortcode) {
  const url = `https://r.jina.ai/https://www.instagram.com/p/${shortcode}/`;
  try {
    const res = await fetchWithRetry(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TITAN-Scraper/1.0)',
        'Accept': 'text/plain'
      },
      signal: AbortSignal.timeout(20000)
    }, { tag: `Jina-Cmt-IG@${shortcode}`, maxAttempts: 3 });
    const text = await res.text();
    if (/Log into|Sign up · Instagram|Login Required/i.test(text)) {
      return { ok: false, error: 'Login wall returned' };
    }
    return { ok: true, content: text };
  } catch (err) {
    if (err instanceof HttpTerminalError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: err.message };
  }
}

function parseCommentsFromMarkdown(md, postTimestampMs) {
  // Heuristic: lines that start with "@username" (with optional leading bullet),
  // followed by a comment body on subsequent lines until blank line.
  // We only mark admin comments matching marker patterns. Non-admin comments are
  // ignored — manual dataset only tracks admin activity.
  const lines = md.split(/\r?\n/);
  const comments = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^\s*[-*]?\s*@([\w.]+)\b[^\n]*$/);
    if (!m) {
      i += 1;
      continue;
    }
    const handle = m[1];
    // Collect body lines until next handle or blank line block.
    const bodyLines = [];
    i += 1;
    while (i < lines.length) {
      const l = lines[i];
      if (/^\s*[-*]?\s*@[\w.]+\b/.test(l)) break;
      if (/^\s*$/.test(l) && bodyLines.length > 0) break;
      bodyLines.push(l);
      i += 1;
    }
    const text = bodyLines.join(' ').trim();
    const admin = detectAdmin(text);
    if (!admin) continue;
    comments.push({
      admin,
      postShortcode: null, // filled by caller
      postUrl: null,
      userHandle: handle,
      commentText: text,
      timestampMs: postTimestampMs, // Jina doesn't give per-comment ts reliably
      diggCount: 0,
      replyTotal: 0
    });
  }
  return comments;
}

async function main() {
  const src = path.join(SCRAPED_DIR, `${TARGET_SLUG}.json`);
  let payload;
  try {
    payload = JSON.parse(await fs.readFile(src, 'utf8'));
  } catch (err) {
    console.error(`[scrape-comments-ig] cannot read ${src}: ${err.message}`);
    process.exit(2);
  }

  const posts = Array.isArray(payload?.posts) ? payload.posts : [];
  if (posts.length === 0) {
    console.error(`[scrape-comments-ig] no posts in ${src}`);
    process.exit(2);
  }

  const candidates = posts
    .filter((p) => {
      const ts = Number(p.timestampMs ?? p.createTime ?? 0);
      if (!Number.isFinite(ts) || ts < FILTER_START_MS) return false;
      const cc = Number(p.commentCount ?? 0);
      return cc > 0 && p.shortcode;
    })
    .sort((a, b) => Number(b.timestampMs ?? 0) - Number(a.timestampMs ?? 0));
  // No cap — daily run covers all candidate posts. Jina rate-limit guard is
  // handled per-request via 3s sleep below. If CI runtime is tight, lower
  // here after measuring average scrape duration per post.

  console.log(`[scrape-comments-ig] ${candidates.length} candidates (${posts.length} total posts)`);

  const out = {
    scrapedAt: new Date().toISOString(),
    filterStartMs: FILTER_START_MS,
    account: payload.account?.username ?? TARGET_SLUG,
    posts: {},
    adminComments: []
  };

  let postsAttempted = 0;
  let postsSucceeded = 0;
  let fetchErrors = 0;

  for (const post of candidates) {
    const shortcode = String(post.shortcode ?? '');
    if (!shortcode) continue;
    postsAttempted += 1;

    const r = await fetchJinaPage(shortcode);
    if (!r.ok) {
      fetchErrors += 1;
      console.warn(`[scrape-comments-ig] ${shortcode} fail: ${r.error}`);
      out.posts[shortcode] = { ok: false, error: r.error };
      await sleep(2500); // Jina rate limit guard
      continue;
    }

    postsSucceeded += 1;
    const postUrl = `https://www.instagram.com/p/${shortcode}/`;
    const postTs = Number(post.timestampMs ?? post.createTime ?? 0);
    const found = parseCommentsFromMarkdown(r.content, postTs).map((c) => ({
      ...c,
      postShortcode: shortcode,
      postUrl
    }));
    out.posts[shortcode] = {
      ok: true,
      adminFound: found.length,
      bytesRead: r.content.length,
      fetchedAt: new Date().toISOString()
    };
    out.adminComments.push(...found);

    console.log(`[scrape-comments-ig] ${shortcode} → ${found.length} admin comments (total: ${out.adminComments.length})`);

    await sleep(3000); // Jina rate limit
  }

  const dest = path.join(SCRAPED_DIR, `comments-${TARGET_SLUG}.json`);
  await fs.writeFile(dest, JSON.stringify(out, null, 2));

  console.log(`[scrape-comments-ig] summary: ${postsSucceeded}/${postsAttempted} posts OK, ${out.adminComments.length} admin comments found, ${fetchErrors} errors`);
  console.log(`[scrape-comments-ig] wrote ${dest}`);
}

main().catch((err) => {
  console.error('[scrape-comments-ig] fatal:', err);
  process.exit(2);
});
