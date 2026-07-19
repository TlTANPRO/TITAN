// Append truly-new posts from scripts/scraped/*.json to accounts-full.json.
//
// "Truly new" = shortcode NOT in V19, AND (for IG) embedded userId in
// `id` (format "{postId}_{userIdCreator}") matches the account's pk.
// This filters out /clips/user/ noise where it surfaces other creators'
// posts.
//
// Append-only: never overwrite existing posts, never touch their fields.
//
// Usage:
//   node scripts/append-new-posts-19jul.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNTS_IG, ACCOUNTS_TT } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ACCOUNTS_FULL = path.join(ROOT, 'accounts-full.json');
const SCRAPED_DIR = path.join(__dirname, 'scraped');

async function atomicWriteJson(filepath, data) {
  const tmp = filepath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, filepath);
}

function extractHashtags(text) {
  if (!text) return [];
  const m = String(text).matchAll(/#([\p{L}0-9_]+)/gu);
  return [...m].map((x) => '#' + x[1].toLowerCase());
}
function extractMentions(text) {
  if (!text) return [];
  const m = String(text).matchAll(/@([\w.]+)/g);
  return [...m].map((x) => '@' + x[1].toLowerCase());
}

function normalizeIgPost(scraped, account) {
  // If id is "_id" format, keep it for consistency with V19 (756 posts use this format).
  // shortcode is the canonical display key.
  const id = scraped.id ?? '';
  const shortcode = scraped.shortcode ?? '';
  if (!id || !shortcode) return null;

  // Noise filter: IG /clips/user/ sometimes returns other creators' posts.
  // Reject if id is "_id" and embedded userId doesn't match this account's pk.
  if (id.includes('_')) {
    const embeddedUid = id.split('_')[1];
    if (String(account.pk) !== embeddedUid) {
      return { __noise: true, reason: `userId ${embeddedUid} != ${account.pk}` };
    }
  }

  return {
    id,
    shortcode,
    caption: scraped.caption ?? '',
    timestamp: scraped.timestamp ?? scraped.taken_at ?? 0,
    likeCount: Number(scraped.likeCount ?? 0),
    commentCount: Number(scraped.commentCount ?? 0),
    viewCount: Number(scraped.viewCount ?? 0),
    saveCount: Number(scraped.saveCount ?? 0),
    thumbnailUrl: scraped.thumbnailUrl ?? '',
    videoUrl: scraped.videoUrl ?? '',
    mediaType: scraped.mediaType ?? 'IMAGE',
    isVideo: !!scraped.isVideo,
    durationSeconds: Number(scraped.durationSeconds ?? 0),
    postUrl: scraped.postUrl ?? `https://www.instagram.com/p/${shortcode}/`,
    hashtags: extractHashtags(scraped.caption),
    mentions: extractMentions(scraped.caption)
  };
}

function normalizeTtPost(scraped) {
  const id = scraped.id ?? '';
  const shortcode = scraped.shortcode ?? '';
  if (!id) return null;
  return {
    id,
    shortcode,
    caption: scraped.caption ?? '',
    createTime: Number(scraped.createTime ?? 0),
    timestamp: Number(scraped.createTime ?? 0),
    likeCount: Number(scraped.likeCount ?? 0),
    commentCount: Number(scraped.commentCount ?? 0),
    viewCount: Number(scraped.viewCount ?? 0),
    shareCount: Number(scraped.shareCount ?? 0),
    saveCount: Number(scraped.saveCount ?? 0),
    downloadCount: Number(scraped.downloadCount ?? 0),
    duration: Number(scraped.duration ?? 0),
    coverUrl: scraped.coverUrl ?? '',
    playUrl: scraped.playUrl ?? '',
    hdplayUrl: scraped.hdplayUrl ?? '',
    postUrl: scraped.postUrl ?? `https://www.tiktok.com/@${scraped.author ?? '?'}/video/${id}`,
    hashtags: extractHashtags(scraped.caption),
    mentions: extractMentions(scraped.caption)
  };
}

async function main() {
  console.log('=== APPEND NEW POSTS (V20, 19 Jul 2026) ===\n');

  const full = JSON.parse(await fs.readFile(ACCOUNTS_FULL, 'utf-8'));
  console.log(`accounts-full.json loaded: ${full.length} akun`);

  // Build V19 reference: shortcode (IG) or id (TT) -> accountSlug
  const v19KeyToSlug = new Map();
  for (const a of full) {
    for (const p of a.posts || []) {
      if (p.shortcode) v19KeyToSlug.set(p.shortcode, a.account.slug);
      if (p.id && !p.shortcode) v19KeyToSlug.set(p.id, a.account.slug); // TT path
    }
  }
  console.log(`V19 has ${v19KeyToSlug.size} keys (shortcode+id)\n`);

  const allAccounts = [...ACCOUNTS_IG, ...ACCOUNTS_TT];
  const totalBefore = full.reduce((s, a) => s + (a.posts?.length || 0), 0);
  let totalAdded = 0;
  let totalNoise = 0;
  const summary = [];

  for (const account of allAccounts) {
    const isIg = !!account.username && ACCOUNTS_IG.some((a) => a.slug === account.slug);
    const slug = account.slug;
    const scrapedPath = path.join(SCRAPED_DIR, `${slug}.json`);
    let scraped;
    try {
      scraped = JSON.parse(await fs.readFile(scrapedPath, 'utf-8'));
    } catch (e) {
      console.log(`[${slug}] no scraped file, skip`);
      continue;
    }

    const fullAcc = full.find((a) => a.account.slug === slug);
    if (!fullAcc) {
      console.log(`[${slug}] not in accounts-full.json, skip`);
      continue;
    }

    // Build new posts list. account.pk is in scraped.account.pk (not in accounts.mjs).
    const accPk = scraped.account?.pk ?? null;
    const newPosts = [];
    let noise = 0;
    for (const p of scraped.posts || []) {
      // IG uses shortcode as key, TT uses id
      const key = isIg ? p.shortcode : p.id;
      if (!key) continue;
      if (v19KeyToSlug.has(key)) continue; // already in V19

      const normalized = isIg ? normalizeIgPost(p, { pk: accPk }) : normalizeTtPost(p);
      if (!normalized) continue;
      if (normalized.__noise) {
        noise++;
        continue;
      }
      newPosts.push(normalized);
    }

    // Append-only: never overwrite, never sort existing
    if (newPosts.length > 0) {
      fullAcc.posts = [...(fullAcc.posts || []), ...newPosts];
      fullAcc.stats = fullAcc.stats || {};
      fullAcc.stats.v20AppendAt = new Date().toISOString();
      fullAcc.stats.v20Appended = newPosts.length;
    }

    totalAdded += newPosts.length;
    totalNoise += noise;
    summary.push({ slug, platform: isIg ? 'IG' : 'TT', added: newPosts.length, noise, total: fullAcc.posts.length });
    console.log(`[${slug}] +${newPosts.length} new (${noise} noise dropped), total=${fullAcc.posts.length}`);
  }

  // Persist
  await atomicWriteJson(ACCOUNTS_FULL, full);

  // Cross-account duplicate check
  // We check by shortcode (IG) and id (TT). V19 has 453 intra-account
  // shortcode dups from historical pure_id+_id pairs — ignore those.
  const seen = new Map();
  const crossDups = [];
  for (const a of full) {
    const seenThisAcc = new Set();
    for (const p of a.posts || []) {
      const key = p.shortcode || p.id;
      if (!key) continue;
      if (seenThisAcc.has(key)) continue; // intra-account dup, skip
      seenThisAcc.add(key);
      if (seen.has(key)) {
        if (seen.get(key) !== a.account.slug) {
          crossDups.push({ key, slug1: seen.get(key), slug2: a.account.slug });
        }
      } else {
        seen.set(key, a.account.slug);
      }
    }
  }

  const totalAfter = full.reduce((s, a) => s + (a.posts?.length || 0), 0);

  console.log('\n=== SUMMARY ===');
  console.log(`Before: ${totalBefore} post`);
  console.log(`Added:  +${totalAdded} post (${totalNoise} noise dropped)`);
  console.log(`After:  ${totalAfter} post`);
  console.log(`Cross-account dups: ${crossDups.length}`);
  for (const d of crossDups) console.log(`  ${d.key} in ${d.slug1} AND ${d.slug2}`);
  console.log('\nPer-account:');
  for (const s of summary) console.log(`  ${s.slug.padEnd(30)} ${s.platform} +${s.added} (noise ${s.noise}) total=${s.total}`);

  if (crossDups.length > 0) {
    console.log('\n!! WARNING: cross-account duplicates detected. Reverting from backup.');
    const backup = JSON.parse(await fs.readFile(path.join(ROOT, 'accounts-full.backup-2026-07-19-pre-v20.json'), 'utf-8'));
    await atomicWriteJson(ACCOUNTS_FULL, backup);
    process.exit(1);
  }

  console.log('\n✅ V20 append complete');
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
