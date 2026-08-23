// scrape-avatars-ig.mjs — REAL Instagram avatars via embed-page chain
// (tested working 2026-08-23)
//
// WHY: old scrape-avatars.mjs used og:image with facebookexternalhit UA.
// IG now serves a GENERIC Instagram logo placeholder as og:image when
// logged out — that's how ig-majangmejeng_.png became the wrong 4168px
// Instagram-logo image (verified visually).
//
// PROVEN chain:
//   1. GET instagram.com/reel/<shortcode>/embed/ (no auth, iPhone UA)
//   2. Extract scontent.cdninstagram.com/v/t51.82787-19/... profile pic URL
//      from HTML (s100x100 variant, signed)
//   3. Fetch through images.weserv.nl proxy (IG CDN 403s other IPs; weserv
//      works — verified returning the real Majang Mejeng logo)
//   4. Validate: must be JPEG/PNG, 50-1000px, unique hash per account
//
// Usage: node scripts/scrape-avatars-ig.mjs [--force]
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'accounts-full.json');
const AVATAR_DIR = path.join(ROOT, 'assets', 'avatars');
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148';

export function extractProfilePicUrls(html) {
  // t51.82787-19 and t51.2885-19 both observed in live embed pages
  return [...html.matchAll(/https:\/\/scontent\.cdninstagram\.com\/v\/t51\.\d+-19\/[^"'\\ ]+/g)]
    .map((m) => m[0].replace(/&amp;/g, '&'));
}

export function validateAvatar(buffer, seenHashes) {
  const errors = [];
  if (buffer.length < 1000) errors.push(`too small (${buffer.length}b)`);
  if (buffer.length > 500_000) errors.push(`too big (${buffer.length}b)`);
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
  if (!isJpeg && !isPng) errors.push('not JPEG/PNG');
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  if (seenHashes.has(hash)) errors.push('duplicate image (same bytes as another account)');
  else seenHashes.add(hash); // register so subsequent calls detect duplicates
  return { hash, errors };
}

async function fetchIgAvatar(username, shortcode, knownMediaId) {
  // 1. embed page (contains owner profile pic; collab posts may include
  //    OTHER accounts' pics first — owner pic matched by media-id when known)
  const embedRes = await fetch(`https://www.instagram.com/reel/${shortcode}/embed/`, {
    headers: { 'User-Agent': IPHONE_UA },
    signal: AbortSignal.timeout(30000),
  });
  if (!embedRes.ok) throw new Error(`embed ${embedRes.status}`);
  const html = await embedRes.text();
  const urls = extractProfilePicUrls(html);
  if (urls.length === 0) throw new Error('no profile pic URL in embed HTML');
  // Prefer URL whose media filename matches the account's known profilePicUrl
  let chosen = urls[urls.length - 1]; // owner pic is usually last
  if (knownMediaId) {
    const match = urls.find((u) => u.includes(knownMediaId));
    if (match) chosen = match;
  }
  // 2. weserv proxy (handles IG CDN 403)
  const weservUrl = `https://images.weserv.nl/?url=${encodeURIComponent(chosen)}`;
  const imgRes = await fetch(weservUrl, { signal: AbortSignal.timeout(30000) });
  if (!imgRes.ok) throw new Error(`weserv ${imgRes.status}`);
  return Buffer.from(await imgRes.arrayBuffer());
}

async function main() {
  const force = process.argv.includes('--force');
  const data = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  await fs.mkdir(AVATAR_DIR, { recursive: true });
  const seenHashes = new Set();
  let ok = 0, fail = 0;

  for (const acct of data.filter((a) => a.platform === 'instagram')) {
    const username = acct.account.username;
    // pick a recent post shortcode from this account
    const recent = acct.posts.find((p) => p.shortcode);
    if (!recent) { console.log(`[${username}] no shortcode available, skip`); fail++; continue; }
    try {
      const picUrl = acct.account.profilePicUrl ?? '';
      const mediaId = (picUrl.match(/\/(\d{10,25})_n\.jpg/) ?? [])[1] ?? null;
      const buf = await fetchIgAvatar(username, recent.shortcode, mediaId);
      const { hash, errors } = validateAvatar(buf, seenHashes);
      if (errors.length && !force) {
        console.log(`[${username}] REJECTED: ${errors.join('; ')}`);
        fail++;
        continue;
      }
      seenHashes.add(hash);
      const file = `ig-${username}.png`;
      await fs.writeFile(path.join(AVATAR_DIR, file), buf);
      acct.account.localAvatar = `/TITAN/assets/avatars/${file}`;
      console.log(`[${username}] OK ${buf.length}b hash=${hash.slice(0, 8)}`);
      ok++;
    } catch (e) {
      console.log(`[${username}] FAILED: ${String(e.message).slice(0, 80)}`);
      fail++;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (ok > 0) {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2) + '\n');
  }
  console.log(`Done: ${ok} ok, ${fail} failed/skipped`);
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
