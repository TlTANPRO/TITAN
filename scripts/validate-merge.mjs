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
    if (!post.id) continue;
    if (!seen.has(post.id)) seen.set(post.id, post);
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
 * Cross-file dedup. Posts yang punya ID sama di multiple file akan di-keep
 * di file dengan followerCount tertinggi (akun "paling authoritative").
 *
 * @returns {{ removedCounts: Record<string, number>, summary: string }}
 */
function crossFileDedupe(fileData) {
  // Map id → [fileSlug, post] occurrences
  const idToOccurrences = new Map();
  for (const [slug, data] of Object.entries(fileData)) {
    for (const post of data.posts ?? []) {
      if (!post.id) continue;
      if (!idToOccurrences.has(post.id)) {
        idToOccurrences.set(post.id, []);
      }
      idToOccurrences.get(post.id).push({ slug, post });
    }
  }

  // Cari IDs yang muncul di multiple file
  const duplicateIds = [];
  for (const [id, occurrences] of idToOccurrences.entries()) {
    const uniqueSlugs = new Set(occurrences.map((o) => o.slug));
    if (uniqueSlugs.size > 1) {
      duplicateIds.push({ id, occurrences });
    }
  }

  if (duplicateIds.length === 0) {
    return { removedCounts: {}, summary: 'No cross-file duplicates' };
  }

  // Untuk setiap duplicate id, tentukan "winner" file (followerCount tertinggi)
  const removedCounts = {};
  for (const { id, occurrences } of duplicateIds) {
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
      const idx = data.posts.findIndex((p) => p.id === id);
      if (idx >= 0) {
        data.posts.splice(idx, 1);
        removedCounts[occ.slug] = (removedCounts[occ.slug] ?? 0) + 1;
      }
    }
  }

  return { removedCounts, summary: `Removed ${duplicateIds.length} cross-file duplicates` };
}

async function main() {
  const files = (await fs.readdir(SCRAPED_DIR)).filter((f) => f.endsWith('.json'));
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
