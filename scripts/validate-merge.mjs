// Validate scraped JSON, dedupe by post ID (per-file AND cross-file), sanity check, write back to scraped/ in-place.
// Run after scraping and before generate-data.
//
// Cross-file dedup logic:
//   - Untuk IG: post yang sama shortcode bisa muncul di multiple akun (collaboration/repost)
//     Prioritas keep: akun dengan followerCount tertinggi (most "authoritative")
//   - Untuk TT: post id (aweme_id) unique per video, cross-file dedup sama
//   - Hapus dari file asal, tambahkan reference di account asal (keep first occurrence)

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRAPED_DIR = path.join(__dirname, 'scraped');

function validateSchema(data, slug) {
  const errors = [];
  if (!data.platform) errors.push(`${slug}: missing platform`);
  if (!data.account) errors.push(`${slug}: missing account`);
  if (!Array.isArray(data.posts)) errors.push(`${slug}: posts is not array`);
  if (data.posts && data.posts.length > 0) {
    const first = data.posts[0];
    if (!first.id) errors.push(`${slug}: first post missing id`);
  }
  return errors;
}

function dedupePostsInFile(posts) {
  const seen = new Map();
  for (const post of posts) {
    const k = dedupKey(post);
    if (!k) continue;
    if (!seen.has(k)) seen.set(k, post);
  }
  return [...seen.values()];
}

function sanityCheck(data) {
  const issues = [];
  const platform = data.platform;
  if (platform === 'instagram') {
    if (data.account.username === 'majangmejeng_' && data.posts.length < 100) {
      issues.push(`@${data.account.username}: expected ~313 posts, got ${data.posts.length}`);
    }
  } else if (platform === 'tiktok') {
    const withViews = data.posts.filter((p) => (p.viewCount ?? p.playCount ?? p.views ?? 0) > 0).length;
    if (data.posts.length > 0 && withViews === 0) {
      issues.push(`No posts with views > 0`);
    }
    const withLikes = data.posts.filter((p) => (p.likeCount ?? p.diggCount ?? p.likes ?? 0) > 0).length;
    if (data.posts.length > 0 && withLikes === 0) {
      issues.push(`No posts with likes > 0`);
    }
  }
  return issues;
}

/**
 * Build a composite dedup key for a post. Shortcode is the human-stable
 * identifier on IG (the same photo can be reposted, the shortcode survives).
 * For TT, aweme_id (== post.id) is already unique per video, but shortcode
 * acts as a stable fallback when present.
 *
 * V29: previously this function used `post.id` only. That missed IG reposts
 * where two accounts had the SAME shortcode but different internal id values
 * (e.g. one file kept the long form, the other the truncated form). Live
 * verification showed 2 such cross-dups survived (ig-syahfalahproperti ↔
 * ig-ardiantanah) — caught only by generate-data.mjs post-write check.
 *
 * Composite key = `${platform}:${shortcode || id}` — same as the post-write
 * check, so the two layers agree.
 */
function dedupKey(post) {
  if (!post) return null;
  const platform = post.platform ?? '';
  const key = post.shortcode || post.id;
  if (!key) return null;
  return `${platform}:${key}`;
}

/**
 * Cross-file dedup. Posts yang punya composite key (platform:shortcode||id)
 * sama di multiple file akan di-keep di file dengan followerCount tertinggi
 * (akun "paling authoritative").
 *
 * @returns {{ removedCounts: Record<string, number>, summary: string }}
 */
function crossFileDedupe(fileData) {
  // Map composite-key → [fileSlug, post] occurrences
  const keyToOccurrences = new Map();
  for (const [slug, data] of Object.entries(fileData)) {
    for (const post of data.posts ?? []) {
      const k = dedupKey(post);
      if (!k) continue;
      if (!keyToOccurrences.has(k)) {
        keyToOccurrences.set(k, []);
      }
      keyToOccurrences.get(k).push({ slug, post });
    }
  }

  // Cari keys yang muncul di multiple file
  const duplicateKeys = [];
  for (const [key, occurrences] of keyToOccurrences.entries()) {
    const uniqueSlugs = new Set(occurrences.map((o) => o.slug));
    if (uniqueSlugs.size > 1) {
      duplicateKeys.push({ key, occurrences });
    }
  }

  if (duplicateKeys.length === 0) {
    return { removedCounts: {}, summary: 'No cross-file duplicates' };
  }

  // Untuk setiap duplicate key, tentukan "winner" file (followerCount tertinggi)
  const removedCounts = {};
  for (const { key, occurrences } of duplicateKeys) {
    let winner = occurrences[0];
    for (const occ of occurrences) {
      const occFollowers = fileData[occ.slug]?.account?.followerCount ?? 0;
      const winnerFollowers = fileData[winner.slug]?.account?.followerCount ?? 0;
      if (occFollowers > winnerFollowers) {
        winner = occ;
      }
    }

    // Hapus post dari semua file KECUALI winner
    for (const occ of occurrences) {
      if (occ.slug === winner.slug) continue;
      const data = fileData[occ.slug];
      if (!data) continue;
      const k = dedupKey(occ.post);
      const idx = data.posts.findIndex((p) => dedupKey(p) === k);
      if (idx >= 0) {
        data.posts.splice(idx, 1);
        removedCounts[occ.slug] = (removedCounts[occ.slug] ?? 0) + 1;
      }
    }
  }

  return { removedCounts, summary: `Removed ${duplicateKeys.length} cross-file duplicates` };
}

async function main() {
  // CRITICAL FIX: exclude backup files (e.g. *.backup-2026-07-19.json).
  // Previously matched by .endsWith('.json') → cross-file dedup treated backup
  // + current as duplicate → all posts deleted from current scraped.
  // See DATA-SSOT.md "Sub-Plan A.1" for incident report.
  const files = (await fs.readdir(SCRAPED_DIR)).filter((f) => f.endsWith('.json') && !f.includes('.backup-'));
  console.log(`Found ${files.length} scraped files\n`);

  // Step 1: Load semua file, validate schema, dedupe per-file
  const fileData = {};
  let allOk = true;
  for (const file of files) {
    const slug = file.replace('.json', '');
    const filePath = path.join(SCRAPED_DIR, file);
    const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));

    const schemaErrors = validateSchema(data, slug);
    if (schemaErrors.length > 0) {
      console.error(`❌ ${slug} SCHEMA ERRORS:`);
      schemaErrors.forEach((e) => console.error(`   - ${e}`));
      allOk = false;
      continue;
    }

    const originalCount = data.posts.length;
    const deduped = dedupePostsInFile(data.posts);
    const dedupeRemoved = originalCount - deduped.length;
    if (dedupeRemoved > 0) {
      console.log(`🔄 ${slug} — removed ${dedupeRemoved} in-file duplicates (${originalCount} → ${deduped.length})`);
    }

    data.posts = deduped;
    fileData[slug] = data;
  }

  if (!allOk) {
    console.error('\n❌ Validation failed');
    process.exit(1);
  }

  // Step 2: Cross-file dedup (handle post yang di-share di multiple akun)
  console.log('\n--- Cross-file dedup ---');
  const { removedCounts, summary } = crossFileDedupe(fileData);
  console.log(summary);
  for (const [slug, count] of Object.entries(removedCounts)) {
    console.log(`  ${slug}: removed ${count} cross-file duplicate(s)`);
  }

  // Step 3: Sanity check + write back
  console.log('\n--- Sanity check & write ---');
  for (const [slug, data] of Object.entries(fileData)) {
    const issues = sanityCheck(data);
    if (issues.length > 0) {
      console.log(`⚠️  ${slug}:`);
      issues.forEach((i) => console.log(`   - ${i}`));
    }

    const filePath = path.join(SCRAPED_DIR, `${slug}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log(`✅ ${slug} — ${data.posts.length} posts validated`);
  }

  // Final summary
  const totalPosts = Object.values(fileData).reduce((s, d) => s + d.posts.length, 0);
  const totalIds = new Set();
  for (const data of Object.values(fileData)) {
    for (const p of data.posts) totalIds.add(p.id);
  }
  console.log(`\n=== VALIDATION COMPLETE (${files.length} accounts) ===`);
  console.log(`Total posts: ${totalPosts}, Unique IDs: ${totalIds.size}`);
  if (totalPosts !== totalIds.size) {
    console.error(`❌ STILL HAS DUPLICATES: ${totalPosts - totalIds.size} duplicate(s) survived`);
    process.exit(1);
  } else {
    console.log(`✅ Zero duplicates confirmed`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
