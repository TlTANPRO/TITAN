// scrape-comments-tt-browser.mjs — V38 TikTok admin-comment scraper via headless Chrome + CDP
//
// WHY: the previous free endpoints are dead (Jina 403 since ~25 Aug; TikWM
// non-functional). Same trick as the V37 post scraper: open each video in the
// installed headless Chrome, click the comment tray ([data-e2e="comment-count"]),
// let the page fire its own signed /api/comment/list/ XHRs, capture the JSON
// responses over CDP (Network.getResponseBody). No signature reverse-engineering.
//
// Comments are public — no login required. We inject TT_SESSION_COOKIE when
// present (helps if TT decides to gate), but the run does not depend on it.
//
// What gets recorded: only comments whose text matches an admin marker
// (-Re / -Rf / -Rm / -Ju with aliases /-Riki/ etc.) — the same rule as the
// manual dataset. Non-admin comments are ignored (dashboard only tracks admins).
//
// Targets:
//   1. OWN posts: scripts/scraped/tt-{slug}.json for all 5 TT accounts,
//      filtered to posts since 2026-08-01 (matches FILTER_START_MS in
//      aggregate-admin-comments.mjs + src/lib/adminComments.js), newest first.
//   2. EXTERNAL posts: scripts/comment-scan-extras.json → tt[] entries
//      ({ url, owner }). These run first and are not subject to limit=.
//
// Output: scripts/scraped/comments-tt-majangmejeng_.json in the exact shape the
// aggregator expects (adminComments[] with postId/postUrl/postOwner/isOwnPost/…).
// Dedup upstream (aggregate-admin-comments.mjs) uses
// ${platform}-${postId}-${admin}-${timestampMs}, so re-runs never duplicate.
//
// Fail soft: no Chrome → exit 2 (workflow continues with manual dataset only).
// Per-video errors are logged and skipped.
//
// Usage:
//   node scripts/scrape-comments-tt-browser.mjs                    # default limit
//   node scripts/scrape-comments-tt-browser.mjs limit=200          # full scan
//   node scripts/scrape-comments-tt-browser.mjs only=tt-majangmejeng_ extras=0
//
// Environment:
//   TT_SESSION_COOKIE  optional session cookie header (injected when present)
//   CHROME_PATH        optional explicit chrome.exe path override
//   TT_BROWSER_PORT    optional CDP port override (default 9365)
//   TT_BROWSER_LIMIT   optional default limit override

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ACCOUNTS_TT } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'scraped');
const EXTRAS_PATH = path.join(__dirname, 'comment-scan-extras.json');
const COOKIE = process.env.TT_SESSION_COOKIE || '';
const PORT = Number(process.env.TT_BROWSER_PORT || 9365);
const DEFAULT_LIMIT = Number(process.env.TT_BROWSER_LIMIT || 60);
const PROFILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '.tmp-tt-comments-profile'
);
const FILTER_START_MS = Date.parse('2026-08-01T00:00:00Z');

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (base) => base + Math.round(Math.random() * 800);

// Admin marker rules — mirror the canonical `_markerRules` contract in
// src/data/admin-comments.json (dash-prefix tag + optional long alias):
//   -Re / -Reni → Reni, -Rf / -Riki / -Rifki → Rifqi,
//   -Rm / -Reta → Reta, -Ju / -Julian → Julian.
const ADMIN_PATTERNS = [
  { admin: 'Reni',  tag: '-Re', re: /[-–—]\s*(?:re|reni)\b/i },
  { admin: 'Rifqi', tag: '-Rf', re: /[-–—]\s*(?:rf|riki|rifki|riqi)\b/i },
  { admin: 'Reta',  tag: '-Rm', re: /[-–—]\s*(?:rm|reta)\b/i },
  { admin: 'Julian', tag: '-Ju', re: /[-–—]\s*(?:ju|julian)\b/i }
];

function detectAdmin(text) {
  if (!text) return null;
  for (const { admin, re } of ADMIN_PATTERNS) {
    if (re.test(text)) return admin;
  }
  return null;
}

// Flatten top-level comments + their reply threads into a single list.
function flattenComments(bodyJson) {
  const out = [];
  const walk = (list) => {
    for (const c of list || []) {
      if (!c || !c.cid) continue;
      out.push(c);
      walk(c.reply_comment);
    }
  };
  walk(bodyJson?.comments);
  return out;
}

function detectChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ].filter(Boolean);
  return candidates.find((c) => fsSync.existsSync(c)) || null;
}

async function launchBrowser(chromePath) {
  fsSync.rmSync(PROFILE, { recursive: true, force: true });
  const extra = process.platform !== 'win32'
    ? ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    : [];
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1600,900',
    '--lang=en-US',
    '--mute-audio',
    ...extra,
    'about:blank'
  ], { stdio: 'ignore' });

  let up = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) { up = true; break; }
    } catch {}
    if (chrome.exitCode !== null) break;
    await sleep(300);
  }
  if (!up) throw new Error('Chrome CDP endpoint did not come up');

  const tabRes = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
  const tab = await tabRes.json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  return { chrome, ws };
}

async function main() {
  const chromePath = detectChrome();
  if (!chromePath) {
    console.error('::error::No Chrome/Edge found. CHROME_PATH must point to the browser binary.');
    process.exit(2);
  }

  const limitArg = Number(process.argv.find((a) => a.startsWith('limit='))?.split('=')[1]);
  const limit = limitArg > 0 ? limitArg : DEFAULT_LIMIT;
  const onlySlug = process.argv.find((a) => a.startsWith('only='))?.split('=')[1];
  const withExtras = !process.argv.some((a) => a === 'extras=0');

  // ── Build candidate list ────────────────────────────────────────────────
  const candidates = []; // { post, slug, username, isOwnPost, owner, postUrl, postId }
  let extras = [];
  try {
    const j = JSON.parse(await fs.readFile(EXTRAS_PATH, 'utf8'));
    extras = j?.tt || [];
  } catch {}
  const onlyTT = j => (typeof j === 'string') ? j : j[0];

  for (const ex of extras) {
    const url = String(ex.url ?? '');
    const m = url.match(/\/video\/(\d+)/);
    if (!m) continue;
    candidates.push({
      post: { shortcode: m[1] }, slug: null, username: null, isOwnPost: false,
      owner: ex.owner || '', postUrl: url, postId: m[1], external: true
    });
  }

  let ownCandidates = 0;
  for (const account of ACCOUNTS_TT) {
    if (onlySlug && account.slug !== onlySlug) continue;
    const src = path.join(OUT_DIR, `${account.slug}.json`);
    let payload = null;
    try { payload = JSON.parse(await fs.readFile(src, 'utf8')); } catch {}
    const posts = payload?.posts || [];
    for (const p of posts) {
      const ts = Number(p.timestampMs ?? p.timestamp ?? 0) || (Number(p.createTime ?? 0) * 1000);
      if (!Number.isFinite(ts) || ts < FILTER_START_MS) continue;
      const vid = String(p.shortcode ?? '');
      if (!/^\d+$/.test(vid)) continue;
      candidates.push({
        post: p, slug: account.slug, username: account.username,
        isOwnPost: true, owner: account.username,
        postUrl: p.postUrl, postId: vid, external: false
      });
      ownCandidates++;
    }
  }

  if (ownCandidates === 0 && candidates.length === 0) {
    console.error('[scrape-comments-tt-browser] 0 candidates — nothing to scan.');
    process.exit(2);
  }
  console.log(
    `[scrape-comments-tt-browser] extras=${candidates.filter(c=>c.external).length} ` +
    `ownSinceAug1=${ownCandidates} | limit=${limit} | browser ${chromePath}`
  );

  // ── Launch browser + CDP ───────────────────────────────────────────────
  const { chrome, ws } = await launchBrowser(chromePath);
  try {
    let id = 0;
    const pending = new Map();
    const seenResponses = new Map(); // requestId -> url
    const finished = new Map();      // requestId -> url
    let videoBoundary = 0;           // only capture after last navigate

    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
      if (d.method === 'Network.responseReceived') {
        const url = d.params.response?.url || '';
        if (url.includes('/api/comment/list/')) {
          seenResponses.set(d.params.requestId, url);
        }
      }
      if (d.method === 'Network.loadingFinished') {
        const m = seenResponses.get(d.params.requestId);
        if (m) finished.set(d.params.requestId, m);
      }
    };
    const cmd = (method, params = {}) =>
      new Promise((res) => {
        const i = ++id;
        pending.set(i, (d) => res(d));
        ws.send(JSON.stringify({ id: i, method, params }));
      });

    await cmd('Network.enable');
    await cmd('Page.enable');
    await cmd('Runtime.enable');
    await cmd('Emulation.setUserAgentOverride', { userAgent: BROWSER_UA, acceptLanguage: 'en-US,en;q=0.9' });
    const cookies = COOKIE.split(/;\s*|,/)
      .map((pair) => pair.trim().split(/=(.*)/s))
      .filter((m) => m && m[0] && m[1] !== undefined)
      .map((m) => [m[0].trim(), m[1].trim()]);
    for (const [name, value] of cookies) {
      await cmd('Network.setCookie', { name, value, url: 'https://www.tiktok.com/' });
    }

    const adminComments = [];
    const postReport = {};
    let postsOk = 0;
    let postsFail = 0;

    const scanVideo = async (target) => {
      const { postUrl, postId, owner, isOwnPost, slug, username } = target;
      seenResponses.clear();
      finished.clear();
      videoBoundary = Date.now();

      await cmd('Page.navigate', { url: postUrl });

      // Wait for the video page to render (comment rail button must exist).
      let ready = false;
      let buttonFound = false;
      for (let i = 0; i < 20 && !ready; i++) {
        await sleep(1000);
        const ev = await cmd('Runtime.evaluate', {
          expression: `(()=>{const sel='[data-e2e="comment-count"]';return JSON.stringify({len:document.body?document.body.innerText.length:-1,btn:!!document.querySelector(sel)});})()`,
          returnByValue: true
        });
        const parsed = (() => { try { return JSON.parse(ev?.result?.result?.value || '{}'); } catch { return {}; } })();
        if (parseInt(parsed.len, 10) > 500) ready = true;
        if (parsed.btn) buttonFound = true;
      }
      if (!ready) { postsFail++; return { ok: false, error: 'shell_timeout' }; }

      // Open the comment tray — triggers the signed /api/comment/list/ XHR.
      const clicked = await cmd('Runtime.evaluate', {
        expression: `(()=>{const sels=['[data-e2e="comment-count"]','[data-e2e="comment-tray-open"]','[aria-label="Comment"]'];let c=0;for(const s of sels){const el=document.querySelector(s);if(el){el.click();c++;}}return c>0;})()`,
        returnByValue: true
      });
      const wasClicked = clicked?.result?.result?.value === true;
      if (!wasClicked && !buttonFound) console.warn(`  [${postId}] no comment button found — retry via scroll`);
      await sleep(jitter(2600));

      const allComments = [];
      const seenCids = new Set();
      const drain = async () => {
        let gotNew = 0;
        for (const [reqId, url] of [...finished]) {
          finished.delete(reqId);
          seenResponses.delete(reqId);
          try {
            const b = await cmd('Network.getResponseBody', { requestId: reqId });
            const body = typeof b?.result?.body === 'string' ? b.result.body : '';
            let j = null;
            try { j = JSON.parse(body); } catch {}
            if (!j?.comments) continue;
            for (const c of flattenComments(j)) {
              if (!seenCids.has(c.cid)) {
                seenCids.add(c.cid);
                allComments.push(c);
                gotNew++;
              }
            }
          } catch {}
        }
        return gotNew;
      };

      await drain();

      // Scroll (window + comment container) to trigger pagination.
      let stagnant = 0;
      for (let i = 0; i < 6; i++) {
        if (i > 0 && stagnant >= 3) break;
        await cmd('Runtime.evaluate', {
          expression: `(()=>{
            const cont = document.querySelector('[data-e2e="comment-list"]');
            if (cont && cont.scrollHeight > cont.clientHeight + 40) { cont.scrollTop = cont.scrollHeight; }
            else if (cont) { cont.scrollTop += cont.scrollHeight; }
            window.scrollTo(0, document.body.scrollHeight);
            return true;
          })()`, returnByValue: true
        });
        await sleep(jitter(2200));
        const added = await drain();
        if (added === 0) stagnant++;
        else stagnant = 0;
      }

      const admin = adminComments;
      const found = [];
      for (const c of allComments) {
        const text = String(c.text ?? (c.comment_data?.text ?? '') ?? '');
        const rule = detectAdmin(text);
        if (!rule) continue;
        const ts = Number(c.create_time ?? 0) * 1000;
        if (!Number.isFinite(ts) || ts <= 0 || ts < FILTER_START_MS) continue;
        found.push({
          platform: 'tiktok',
          postId,
          postUrl,
          postOwner: owner,
          isOwnPost,
          accountSlug: isOwnPost ? `tt-${username}` : '',
          admin: rule,
          adminTag: ADMIN_PATTERNS.find((x) => x.admin === rule)?.tag ?? '',
          commentText: text,
          timestampMs: ts,
          userHandle: c.user?.uniqueId ?? c.user?.nickname ?? '',
          diggCount: Number(c.digg_count ?? 0),
          replyTotal: Number(c.reply_comment_total ?? 0)
        });
      }
      admin.push(...found);
      postReport[postId] = {
        ok: true,
        owner,
        isOwnPost,
        comments: allComments.length,
        adminFound: found.length,
        fetchedAt: new Date().toISOString()
      };
      postsOk++;
      console.log(`  [${postId}] ${postUrl} → ${allComments.length} comments, ${found.length} admin`);
      return { ok: true, found: found.length };
    };

    // Extras first (explicit, never limited), then own posts newest-first.
    const ordered = [
      ...candidates.filter((c) => c.external),
      ...candidates.filter((c) => !c.external).sort(
        (a, b) => (Number(b.post.timestampMs ?? 0) || 0) - (Number(a.post.timestampMs ?? 0) || 0)
      ).slice(0, limit)
    ];

    const start = Date.now();
    for (const target of ordered) {
      try {
        await scanVideo(target);
      } catch (err) {
        postsFail++;
        postReport[target.postId] = { ok: false, error: err.message, fetchedAt: new Date().toISOString() };
        console.warn(`  [${target.postId}] FAIL: ${err.message}`);
      }
      await sleep(jitter(1500));
    }

    const out = {
      scrapedAt: new Date().toISOString(),
      filterStartMs: FILTER_START_MS,
      platform: 'tiktok',
      account: 'tt-majangmejeng_',
      stats: {
        candidates: ordered.length,
        postsOk,
        postsFail,
        totalCommentsSeen: Object.values(postReport).reduce((s, r) => s + (r.comments || 0), 0),
        adminCommentsFound: adminComments.length,
        durationMs: Date.now() - start,
        limit
      },
      posts: postReport,
      adminComments
    };

    await fs.mkdir(OUT_DIR, { recursive: true });
    const dest = path.join(OUT_DIR, 'comments-tt-majangmejeng_.json');
    await fs.writeFile(dest, JSON.stringify(out, null, 2));

    console.log(`\n[scrape-comments-tt-browser] summary: ${postsOk}/${ordered.length} posts OK, ${adminComments.length} admin comments`);
    console.log(`[scrape-comments-tt-browser] wrote ${dest}`);

    if (postsOk === 0 && ordered.length > 0) process.exit(2);
    ws.close();
  } finally {
    chrome.kill();
  }
}

const guard = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (guard) {
  main().catch((err) => {
    console.error('[scrape-comments-tt-browser] fatal:', err);
    process.exit(1);
  });
}

export { detectAdmin, flattenComments, ADMIN_PATTERNS };