// scrape-avatars.mjs — Download 9 profile photos (4 IG + 5 TT) using the
// `facebookexternalhit/1.1` User-Agent. Saves to assets/avatars/{slug}.{ext}.
//
// Why facebookexternalhit works (vs ENSEMBLEDATA's /user/info URLs):
// - ENSEMBLEDATA's response contains session-bound signed URLs
//   (_nc_oc/_nc_gid for IG, x-signature for TT) that 403 from any other browser
// - IG/TT render a "link preview" version for crawlers with og:image meta
// - The og:image URL is signed by the CRAWLER session (not user session),
//   so any IP/browser can fetch it for the next ~1-2 days (oe= hex epoch is
//   time-bound, not session-bound)
// - This is the same trick used by Slackbot, LinkedInBot, Pinterestbot — any
//   social-media unfurl UA returns a fresh, publicly fetchable og:image URL
//
// Cadence: run before each deploy. URLs valid 1-2 days. incremental.yml cron
// runs this once per day at 23:00 WIB (16:00 UTC).
//
// Exit code 1 if any account fails — deploy halts before build.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_ACCOUNTS } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const AVATAR_DIR = path.join(ROOT, 'assets', 'avatars');

// facebookexternalhit is IG/TT's preferred UA for link unfurl. They cache
// the og:image URL specifically for crawlers and serve it without user
// session headers.
const CRAWLER_UA = 'facebookexternalhit/1.1';
const PROFILE_TIMEOUT_MS = 15_000;
const IMAGE_TIMEOUT_MS = 15_000;
const PARALLEL = 3; // concurrent downloads — be polite

function profileUrl(account) {
  const username = account.username;
  if (account.slug.startsWith('ig-')) {
    return `https://www.instagram.com/${username}/`;
  }
  if (account.slug.startsWith('tt-')) {
    return `https://www.tiktok.com/@${username}`;
  }
  return null;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': CRAWLER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// Parse the og:image URL from the HTML. Most crawlers put the user's
// profile photo as the og:image. Look for the FIRST og:image meta tag.
function parseOgImageUrl(html) {
  // Match: <meta property="og:image" content="..."> or property before content
  const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (!m) return null;
  // Decode &amp; → & (HTML entity)
  return m[1].replace(/&amp;/g, '&');
}

function extFromUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    if (path.endsWith('.webp')) return 'webp';
    if (path.endsWith('.jpeg')) return 'jpeg';
    if (path.endsWith('.jpg')) return 'jpg';
    if (path.endsWith('.png')) return 'png';
    // Some IG URLs have no extension — default to jpg (og:image is JPEG)
    if (u.host.includes('cdninstagram.com')) return 'jpg';
    return 'jpg';
  } catch {
    return 'jpg';
  }
}

async function downloadImage(url, outPath) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        // Browser UA + referer for the actual image fetch. The image URL
        // is signed by the crawler session, but IG/TT still check
        // Referer matches the parent page.
        'User-Agent': CRAWLER_UA,
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': new URL(url).origin + '/',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) {
      throw new Error(`Not an image (content-type: ${ct})`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error('Empty response body');
    // Sanity check: file should be at least 500 bytes (smallest legit avatar)
    if (buf.length < 500) throw new Error(`Suspiciously small: ${buf.length} bytes`);
    await fs.writeFile(outPath, buf);
    return { bytes: buf.length, contentType: ct };
  } finally {
    clearTimeout(timer);
  }
}

async function processAccount(account) {
  const url = profileUrl(account);
  if (!url) throw new Error(`Unknown platform for slug ${account.slug}`);

  const html = await fetchHtml(url);
  const imgUrl = parseOgImageUrl(html);
  if (!imgUrl) {
    throw new Error(`No og:image found in profile page (account may be private or URL changed)`);
  }

  const ext = extFromUrl(imgUrl);
  const outPath = path.join(AVATAR_DIR, `${account.slug}.${ext}`);

  // Clean up stale files with different extensions (e.g. old .webp when
  // og:image is now .jpeg). Only delete same-sluke with different ext.
  for (const tryExt of ['jpg', 'jpeg', 'webp', 'png']) {
    if (tryExt === ext) continue;
    const stale = path.join(AVATAR_DIR, `${account.slug}.${tryExt}`);
    try {
      await fs.unlink(stale);
    } catch {}
  }

  // Skip if already fresh (same day) — saves bandwidth on cron re-runs
  try {
    const stat = await fs.stat(outPath);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs < 6 * 60 * 60 * 1000) { // < 6 hours
      return { slug: account.slug, ok: true, bytes: stat.size, skipped: true };
    }
  } catch {}

  const { bytes, contentType } = await downloadImage(imgUrl, outPath);
  return { slug: account.slug, ok: true, bytes, contentType };
}

async function processWithRetry(account, attempts = 2) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await processAccount(account);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        // Brief backoff before retry
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
  throw lastErr;
}

async function runBatch(items, parallel, fn) {
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        results[idx] = await fn(items[idx]);
      } catch (err) {
        results[idx] = { slug: items[idx].slug, ok: false, error: err.message };
      }
    }
  }
  await Promise.all(Array.from({ length: parallel }, worker));
  return results;
}

async function main() {
  await fs.mkdir(AVATAR_DIR, { recursive: true });
  console.log(`[avatar] Starting scrape for ${ALL_ACCOUNTS.length} accounts (parallel=${PARALLEL})`);
  const startTime = Date.now();

  const results = await runBatch(ALL_ACCOUNTS, PARALLEL, processWithRetry);

  // Summary
  const ok = results.filter((r) => r?.ok);
  const failed = results.filter((r) => !r?.ok);
  console.log(`\n[avatar] === SUMMARY ===`);
  for (const r of results) {
    if (r.ok) {
      const skip = r.skipped ? ' (skipped, fresh)' : '';
      console.log(`  ✅ ${r.slug.padEnd(28)} ${String(r.bytes).padStart(7)} bytes${skip}`);
    } else {
      console.log(`  ❌ ${r.slug.padEnd(28)} ${r.error}`);
    }
  }
  console.log(`\n[avatar] ${ok.length}/${ALL_ACCOUNTS.length} ok, ${failed.length} failed, ${Math.round((Date.now() - startTime) / 1000)}s`);

  if (failed.length > 0) {
    console.error(`\n[avatar] FAILED: ${failed.length} account(s) could not be scraped. Halting.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
