// scrape-tt-browser.mjs — TikTok authenticated scraper via headless Chrome + CDP
//
// WHY: all plain-fetch TT methods are blocked (challenge shell / a_bogus signature /
// 403 TLB). The owner session cookie works ONLY when a real browser issues the
// requests: TikTok's own JS signs the item_list API calls. We launch the installed
// Chrome headless, inject the owner cookies, let the page load + auto-scroll so
// the page itself fires signed /api/post/item_list/ XHRs, then capture the JSON
// responses over CDP (Network.getResponseBody). No signature reverse-engineering,
// no stealth tricks — the browser does the talking.
//
// Auth: env TT_SESSION_COOKIE = full cookie header (ttwid; msToken; tt_csrf_token;
// sessionid) from the owner's logged-in browser.
//
// Non-fatal: no cookie / no Chrome / transient error → keep existing scraped data
// and exit 2 (same contract as scrape-tt-cookie.mjs).
//
// Writes scripts/scraped/tt-{slug}.json — same SSOT schema as scrape-tt-cookie.mjs.
//
// Usage:
//   node scripts/scrape-tt-browser.mjs                     # all 5 TT accounts
//   node scripts/scrape-tt-browser.mjs only=tt-itsnisyananda
//
// Environment:
//   TT_SESSION_COOKIE  session cookie header (required)
//   CHROME_PATH        optional explicit chrome.exe path override
//   TT_BROWSER_PORT    optional CDP port override (default 9335)
//   TT_BROWSER_PAGES   optional max scroll pages per account (default 35)
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ACCOUNTS_TT } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'scraped');
const COOKIE = process.env.TT_SESSION_COOKIE || '';
let CHROME_PATH =
  process.env.CHROME_PATH ||
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : 'google-chrome');
const PORT = Number(process.env.TT_BROWSER_PORT || 9335);
const MAX_PAGES = Number(process.env.TT_BROWSER_PAGES || 60);
const PROFILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '.tmp-tt-chrome-profile'
);

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (base) => base + Math.round(Math.random() * 1200);

const COOKIES = COOKIE.split(/;\s*|,/)
  .map((pair) => pair.trim().split(/=(.*)/s))
  .filter((m) => m && m[0] && m[1] !== undefined)
  .map((m) => [m[0].trim(), m[1].trim()]);

function hashtagsFrom(text) {
  return [...new Set((text.match(/#[^\s#]+/g) ?? []).map((t) => t.toLowerCase()))];
}

function normalizeItem(m, username) {
  const id = String(m.id ?? '');
  const desc = m.desc ?? '';
  const stats = m.stats ?? {};
  const cover = m.video?.cover?.urlList?.[0] ?? m.video?.cover ?? '';
  const playAddr = m.video?.playAddr?.urlList?.[0] ?? m.video?.UrlList?.[0] ?? '';
  return {
    id: `${username}-${id}`,
    shortcode: id,
    createTime: Number(m.createTime ?? 0),
    timestamp: Number(m.createTime ?? 0) * 1000,
    postedAt: new Date(Number(m.createTime ?? 0) * 1000).toISOString(),
    postUrl: `https://www.tiktok.com/@${username}/video/${id}`,
    mediaType: 'VIDEO',
    isVideo: true,
    platform: 'tiktok',
    source: 'tt-browser',
    caption: desc,
    hashtags: hashtagsFrom(desc),
    likeCount: Number(stats.diggCount ?? 0),
    commentCount: Number(stats.commentCount ?? 0),
    viewCount: Number(stats.playCount ?? 0),
    saveCount: Number(stats.shareCount ?? 0),
    thumbnailUrl: cover,
    videoUrl: playAddr,
    durationSeconds: Number(m.video?.duration ?? 0) || undefined
  };
}

function parseItemListJson(body, username) {
  let j = null;
  try { j = JSON.parse(body); } catch { return null; }
  if (!j?.itemList?.length) return null;
  const posts = [];
  let skipped = 0;
  for (const m of j.itemList) {
    if (m.author?.uniqueId && m.author.uniqueId.toLowerCase() !== username.toLowerCase()) {
      skipped++;
      continue;
    }
    posts.push(normalizeItem(m, username));
  }
  posts.sort((a, b) => b.createTime - a.createTime);
  return { posts, skipped, hasMore: j.hasMore === true };
}

function parsePageEmbedded(raw, username) {
  let data = null;
  try { data = JSON.parse(raw); } catch { return []; }
  if (data?.ItemModule) {
    const posts = [];
    for (const m of Object.values(data.ItemModule)) {
      if (m.author?.uniqueId && m.author.uniqueId.toLowerCase() !== username.toLowerCase()) continue;
      posts.push(normalizeItem(m, username));
    }
    posts.sort((a, b) => b.createTime - a.createTime);
    if (posts.length) return posts;
  }
  if (data?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.itemList?.vid) {
    const posts = data.__DEFAULT_SCOPE__['webapp.user-detail'].itemList.vid.map((m) =>
      normalizeItem(m, username)
    );
    posts.sort((a, b) => b.createTime - a.createTime);
    return posts;
  }
  return [];
}

function mergePosts(existingPosts, newPosts) {
  const byKey = new Map();
  const keyFor = (p) => {
    let vid = p?.shortcode ? String(p.shortcode) : '';
    if (!vid) {
      const raw = String(p?.id ?? '');
      const dash = raw.lastIndexOf('-');
      vid = dash >= 0 ? raw.slice(dash + 1) : raw;
    }
    if (!/^\d+$/.test(vid)) {
      const m = String(p?.videoUrl ?? '').match(/\/video\/(\d+)/);
      if (m) vid = m[1];
    }
    return vid ? `sc:${vid}` : null;
  };
  for (const p of existingPosts || []) {
    const k = keyFor(p);
    if (k) byKey.set(k, { ...p });
  }
  let added = 0;
  let upgraded = 0;
  for (const np of newPosts) {
    const k = keyFor(np);
    if (!k) continue;
    const e = byKey.get(k);
    if (!e) {
      byKey.set(k, { ...np, hashtags: np.hashtags?.length ? np.hashtags : hashtagsFrom(np.caption) });
      added++;
    } else {
      let changed = false;
      for (const f of ['likeCount', 'commentCount', 'viewCount', 'saveCount']) {
        const n = Number(np[f] ?? 0);
        const o = Number(e[f] ?? 0);
        if (n > o) { e[f] = n; changed = true; }
      }
      for (const f of ['thumbnailUrl', 'videoUrl', 'caption', 'postedAt', 'durationSeconds']) {
        if (!e[f] && np[f]) { e[f] = np[f]; changed = true; }
      }
      if ((!e.hashtags || !e.hashtags.length) && np.caption) {
        e.hashtags = hashtagsFrom(np.caption);
        changed = true;
      }
      if (changed) upgraded++;
    }
  }
  const merged = Array.from(byKey.values());
  merged.sort((a, b) => (b.createTime ?? b.timestamp ?? 0) - (a.createTime ?? a.timestamp ?? 0));
  return { merged, added, upgraded };
}

async function atomicWriteJson(filepath, data) {
  const tmp = filepath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, filepath);
}

// ─── CDP browser driver ─────────────────────────────────────────────────────
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

async function launchBrowser() {
  fsSync.rmSync(PROFILE, { recursive: true, force: true });
  const extra = process.platform !== 'win32'
    ? ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    : [];
  const chrome = spawn(CHROME_PATH, [
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
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) { up = true; break; }
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
  if (!COOKIE) {
    console.error('::error::TT_SESSION_COOKIE env not set — skipping browser TT scrape.');
    process.exit(2);
  }
  if (!COOKIES.length) {
    console.error('::error::TT_SESSION_COOKIE parsed to 0 cookies.');
    process.exit(2);
  }
  const chromePath = detectChrome();
  if (!chromePath) {
    console.error('::error::No Chrome/Edge found. CHROME_PATH must point to the browser binary.');
    process.exit(2);
  }
  CHROME_PATH = chromePath;
  console.log(`browser: ${CHROME_PATH} | cookies: ${COOKIES.length} | port ${PORT}`);

  const onlySlug = process.argv.find((a) => a.startsWith('only='))?.split('=')[1];
  const pagesArg = Number(process.argv.find((a) => a.startsWith('pages='))?.split('=')[1]);
  const wantedPages = pagesArg > 0 ? pagesArg : MAX_PAGES;
  await fs.mkdir(OUT_DIR, { recursive: true });
  console.log(`browser: ${CHROME_PATH} | cookies: ${COOKIES.length} | port ${PORT} | pages ${wantedPages} (cap ${MAX_PAGES})`);

  const { chrome, ws } = await launchBrowser();
  try {
    let id = 0;
    const pending = new Map();
    const seenResponses = new Map(); // requestId -> url
    const finished = new Map(); // requestId -> {url, done}
    let accountBoundary = 0; // epoch ms — only capture responses after last navigate

    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
      if (d.method === 'Network.responseReceived') {
        const { requestId, response } = d.params;
        const url = response?.url || '';
        if (url.includes('/api/post/item_list/')) {
          seenResponses.set(requestId, { url, t0: Date.now() });
        }
      }
      if (d.method === 'Network.loadingFinished') {
        const m = seenResponses.get(d.params.requestId);
        if (m) finished.set(d.params.requestId, { url: m.url, done: Date.now() });
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
    for (const [name, value] of COOKIES) {
      await cmd('Network.setCookie', { name, value, url: 'https://www.tiktok.com/' });
    }

    const results = [];
    for (const account of ACCOUNTS_TT) {
      if (onlySlug && account.slug !== onlySlug) continue;
      const slug = account.slug;
      const username = account.username;
      const outPath = path.join(OUT_DIR, `${slug}.json`);
      const start = Date.now();
      console.log(`\n[TT-BROWSER] === ${account.slug} (@${username}) ===`);

      let existing = null;
      try {
        existing = JSON.parse(await fs.readFile(outPath, 'utf-8'));
        console.log(`  existing: ${(existing.posts ?? []).length} posts`);
      } catch {
        console.log(`  existing: none`);
      }

      // flush per-account capture sets
      seenResponses.clear();
      finished.clear();
      accountBoundary = Date.now();

      await cmd('Page.navigate', { url: `https://www.tiktok.com/@${username}` });

      const freshPosts = [];
      const seenIds = new Set();
      let skippedTotal = 0;
      let embeddedUsed = false;

      // 1) wait for first content signal
      let ready = false;
      for (let i = 0; i < 30 && !ready; i++) {
        await sleep(1000);
        const ev = await cmd('Runtime.evaluate', {
          expression: `(()=>{const s=document.getElementById('SIGI_STATE');const u=document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');return JSON.stringify({sigi:s?s.textContent.length:-1,uni:u?u.textContent.length:-1});})()`,
          returnByValue: true
        });
        let sigi = -1, uni = -1;
        try { const j = JSON.parse(ev.result?.result?.value || '{}'); sigi = j.sigi; uni = j.uni; } catch {}
        if (finished.size > 0 || sigi > 100 || uni > 100) ready = true;
      }
      if (!ready) {
        console.log(`  no content signal after 30s → keep existing, mark zero`);
        if (existing) {
          existing.stats = existing.stats || {};
          existing.stats.lastTtBrowserAt = new Date().toISOString();
          existing.stats.ttBrowserZero = true;
          await atomicWriteJson(outPath, existing);
        }
        results.push({ slug, ok: false, error: 'no_content_signal', added: 0 });
        continue;
      }

      // drain finished XHRs that belong to this account
      const drain = async () => {
        for (const [reqId, m] of [...finished]) {
          if (m.done < accountBoundary) continue;
          finished.delete(reqId);
          seenResponses.delete(reqId);
          try {
            const b = await cmd('Network.getResponseBody', { requestId: reqId });
            const body = b?.result?.body;
            if (typeof body === 'string') {
              const parsed = parseItemListJson(body, username);
              if (parsed) {
                skippedTotal += parsed.skipped;
                for (const p of parsed.posts) {
                  if (!seenIds.has(p.shortcode)) { seenIds.add(p.shortcode); freshPosts.push(p); }
                }
                return parsed.hasMore;
              }
            }
          } catch {}
        }
        return null;
      };

      let lastHasMore = null;
      let stagnant = 0;
      let pageCount = 0;

      // initial drain
      await drain();

      // 2) if no XHR items, fall back to embedded JSON
      if (freshPosts.length === 0) {
        const ex = await cmd('Runtime.evaluate', {
          expression: `(()=>{const n=document.getElementById('SIGI_STATE')||document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');return n?n.textContent:'';})()`,
          returnByValue: true
        });
        const raw = ex.result?.result?.value || '';
        const emb = parsePageEmbedded(raw, username);
        if (emb.length) {
          embeddedUsed = true;
          for (const p of emb) {
            if (!seenIds.has(p.shortcode)) { seenIds.add(p.shortcode); freshPosts.push(p); }
          }
          console.log(`  embedded JSON: ${emb.length} posts`);
        }
      }

      // 3) scroll loop: each scroll triggers more signed item_list XHRs
      while (freshPosts.length === 0 || pageCount < wantedPages) {
        if (freshPosts.length > 0 && stagnant >= 4) {
          console.log(`  stagnant (no new for 4 scrolls) — stop @${freshPosts.length}`);
          break;
        }
        if (pageCount >= wantedPages) {
          console.log(`  reached pages limit ${wantedPages}`);
          break;
        }
        const before = freshPosts.length;
        await cmd('Runtime.evaluate', {
          expression: `(()=>{window.scrollTo(0, document.body.scrollHeight); return true;})()`,
          returnByValue: true
        });
        await sleep(jitter(2800));
        await drain();
        pageCount++;
        if (freshPosts.length === before) stagnant++;
        else stagnant = 0;
        if (pageCount % 5 === 0 || freshPosts.length === before) {
          console.log(`  scroll ${pageCount}: ${freshPosts.length} posts so far`);
        }
      }

      console.log(
        `  collected: ${freshPosts.length} unique posts (skipped ${skippedTotal} non-owner) embedded=${embeddedUsed}`
      );

      if (freshPosts.length === 0) {
        console.log(`  no posts obtained — keeping existing data`);
        if (existing) {
          existing.stats = existing.stats || {};
          existing.stats.lastTtBrowserAt = new Date().toISOString();
          existing.stats.ttBrowserZero = true;
          await atomicWriteJson(outPath, existing);
        }
        results.push({ slug, ok: false, error: 'no_posts', added: 0 });
        continue;
      }

      const { merged, added, upgraded } = mergePosts(existing?.posts, freshPosts);
      console.log(`  merge: +${added} new, ${upgraded} upgraded, total=${merged.length}`);

      const out = {
        platform: 'tiktok',
        account: { ...(existing?.account ?? account), slug, username, displayName: account.displayName },
        posts: merged,
        scrapedAt: new Date().toISOString(),
        lastTtBrowserAt: new Date().toISOString(),
        stats: {
          totalPosts: merged.length,
          durationMs: Date.now() - start,
          isDummy: false,
          source: 'tt-browser',
          newPostsAdded: added,
          metricsUpgraded: upgraded,
          scrollPages: pageCount
        }
      };
      await atomicWriteJson(outPath, out);
      console.log(`[TT-BROWSER] @${username} DONE: ${merged.length} posts (+${added}) in ${Math.round((Date.now()-start)/1000)}s`);
      results.push({ slug, ok: true, added, total: merged.length });
      await sleep(jitter(4000));
    }

    console.log(`\n=== TT-BROWSER SCRAPE COMPLETE ===`);
    console.log('Results:', JSON.stringify(results, null, 2));
    if (results.length > 0 && results.every((r) => !r.ok)) process.exit(2);
    ws.close();
  } finally {
    chrome.kill();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

export { normalizeItem, mergePosts, hashtagsFrom, detectChrome };