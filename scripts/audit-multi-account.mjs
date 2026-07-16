// Multi-account audit — detect cross-account duplicates, field validation, coverage report
// Runs after validate-merge.mjs. Ensures truly zero duplicates across ALL 9 akun
// (post yang di-share/di-repost akan terdeteksi di sini meskipun in-file aman).
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_ACCOUNTS } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRAPED_DIR = path.join(__dirname, 'scraped');
const REPORT_PATH = path.join(__dirname, `audit-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

function buildIndexMap(fileData, field) {
  const map = new Map();
  for (const [slug, data] of Object.entries(fileData)) {
    for (const post of data.posts ?? []) {
      const key = post[field];
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ slug, post });
    }
  }
  return map;
}

function detectDuplicates(indexMap) {
  const dupes = [];
  for (const [key, occurrences] of indexMap.entries()) {
    const slugs = new Set(occurrences.map((o) => o.slug));
    if (slugs.size > 1) {
      dupes.push({ key, occurrences });
    }
  }
  return dupes;
}

function resolveDuplicates(dupes, fileData, field) {
  const removedCounts = {};
  for (const { key, occurrences } of dupes) {
    // Winner: akun dengan followerCount tertinggi
    let winner = occurrences[0];
    for (const occ of occurrences) {
      const occFollowers = fileData[occ.slug]?.account?.followerCount ?? 0;
      const winnerFollowers = fileData[winner.slug]?.account?.followerCount ?? 0;
      if (occFollowers > winnerFollowers) winner = occ;
    }

    // Hapus dari semua file KECUALI winner
    for (const occ of occurrences) {
      if (occ.slug === winner.slug) continue;
      const data = fileData[occ.slug];
      if (!data) continue;
      const idx = data.posts.findIndex((p) => p[field] === key);
      if (idx >= 0) {
        data.posts.splice(idx, 1);
        removedCounts[occ.slug] = (removedCounts[occ.slug] ?? 0) + 1;
      }
    }
  }
  return removedCounts;
}

function validateField(post, platform) {
  const errors = [];
  if (!post.id) errors.push('missing id');
  if (post.timestamp && (typeof post.timestamp !== 'number' || isNaN(new Date(post.timestamp).getTime()))) {
    errors.push(`invalid timestamp: ${post.timestamp}`);
  }
  if (platform === 'instagram') {
    if (!post.shortcode) errors.push('missing shortcode');
    if (post.postUrl && !/^https:\/\/www\.instagram\.com\/(p|reel|tv)\/[^/]+\/?$/.test(post.postUrl)) {
      errors.push(`invalid postUrl: ${post.postUrl}`);
    }
    if (post.mediaType && !['IMAGE', 'VIDEO', 'REEL', 'CAROUSEL_ALBUM'].includes(post.mediaType)) {
      errors.push(`invalid mediaType: ${post.mediaType}`);
    }
  } else if (platform === 'tiktok') {
    if (post.id && !/^\d+$/.test(String(post.id))) {
      errors.push(`non-numeric aweme_id: ${post.id}`);
    }
    if (post.mediaType === 'VIDEO' && (!post.durationSeconds || post.durationSeconds <= 0)) {
      errors.push(`VIDEO with no durationSeconds: ${post.id}`);
    }
  }
  return errors;
}

function computeCoverage(posts) {
  const total = posts.length;
  if (total === 0) return { total: 0, likeCount: 0, commentCount: 0, viewCount: 0, shareCount: 0, saveCount: 0 };
  let likeCount = 0, commentCount = 0, viewCount = 0, shareCount = 0, saveCount = 0;
  for (const p of posts) {
    if ((p.likeCount ?? 0) > 0) likeCount++;
    if ((p.commentCount ?? 0) > 0) commentCount++;
    if ((p.viewCount ?? p.playCount ?? 0) > 0) viewCount++;
    if ((p.shareCount ?? 0) > 0) shareCount++;
    if ((p.saveCount ?? p.collectCount ?? 0) > 0) saveCount++;
  }
  return {
    total,
    likeCount: likeCount / total,
    commentCount: commentCount / total,
    viewCount: viewCount / total,
    shareCount: shareCount / total,
    saveCount: saveCount / total,
  };
}

async function main() {
  console.log('[AUDIT-MULTI] Starting cross-account audit\n');
  const files = (await fs.readdir(SCRAPED_DIR)).filter((f) => f.endsWith('.json') && !f.includes('audit'));
  console.log(`Found ${files.length} scraped files\n`);

  // Load all files
  const fileData = {};
  for (const file of files) {
    const slug = file.replace('.json', '');
    const data = JSON.parse(await fs.readFile(path.join(SCRAPED_DIR, file), 'utf-8'));
    fileData[slug] = data;
  }

  // Detect duplicates by id
  console.log('--- ID-based cross-account check ---');
  const idMap = buildIndexMap(fileData, 'id');
  const idDupes = detectDuplicates(idMap);
  if (idDupes.length === 0) {
    console.log('✅ Zero cross-account duplicates by id');
  } else {
    console.log(`⚠️  Found ${idDupes.length} id(s) appearing in multiple accounts`);
    const idRemoved = resolveDuplicates(idDupes, fileData, 'id');
    for (const [slug, count] of Object.entries(idRemoved)) {
      console.log(`   - ${slug}: removed ${count} duplicate post(s)`);
    }
  }

  // Detect duplicates by postUrl (IG)
  console.log('\n--- postUrl-based cross-account check (IG) ---');
  const postUrlMap = buildIndexMap(fileData, 'postUrl');
  const postUrlDupes = detectDuplicates(postUrlMap);
  if (postUrlDupes.length === 0) {
    console.log('✅ Zero cross-account duplicates by postUrl');
  } else {
    console.log(`⚠️  Found ${postUrlDupes.length} postUrl(s) appearing in multiple accounts`);
    const postUrlRemoved = resolveDuplicates(postUrlDupes, fileData, 'postUrl');
    for (const [slug, count] of Object.entries(postUrlRemoved)) {
      console.log(`   - ${slug}: removed ${count} duplicate post(s)`);
    }
  }

  // Detect duplicates by shortcode (IG)
  console.log('\n--- shortcode-based cross-account check (IG) ---');
  const shortcodeMap = buildIndexMap(fileData, 'shortcode');
  const shortcodeDupes = detectDuplicates(shortcodeMap);
  if (shortcodeDupes.length === 0) {
    console.log('✅ Zero cross-account duplicates by shortcode');
  } else {
    console.log(`⚠️  Found ${shortcodeDupes.length} shortcode(s) appearing in multiple accounts`);
    const scRemoved = resolveDuplicates(shortcodeDupes, fileData, 'shortcode');
    for (const [slug, count] of Object.entries(scRemoved)) {
      console.log(`   - ${slug}: removed ${count} duplicate post(s)`);
    }
  }

  // Field validation per post
  console.log('\n--- Field validation per post ---');
  let totalFieldErrors = 0;
  const perAccountFieldErrors = {};
  for (const [slug, data] of Object.entries(fileData)) {
    perAccountFieldErrors[slug] = 0;
    for (const post of data.posts) {
      const errs = validateField(post, data.platform);
      if (errs.length > 0) {
        perAccountFieldErrors[slug]++;
        totalFieldErrors++;
        if (perAccountFieldErrors[slug] <= 3) {
          console.log(`   ⚠️  ${slug}/${post.id}: ${errs.join(', ')}`);
        }
      }
    }
  }
  if (totalFieldErrors === 0) {
    console.log('✅ All posts pass field validation');
  } else {
    console.log(`⚠️  Total ${totalFieldErrors} posts have field issues (across ${Object.values(perAccountFieldErrors).filter(c => c > 0).length} accounts)`);
  }

  // Per-account coverage report
  console.log('\n--- Per-account coverage ---');
  const coverageReport = {};
  for (const [slug, data] of Object.entries(fileData)) {
    const cov = computeCoverage(data.posts);
    coverageReport[slug] = cov;
    const acc = data.account;
    console.log(
      `${slug.padEnd(28)} | ${String(cov.total).padStart(4)} posts | like ${(cov.likeCount * 100).toFixed(0)}% | view ${(cov.viewCount * 100).toFixed(0)}% | cmt ${(cov.commentCount * 100).toFixed(0)}% | share ${(cov.shareCount * 100).toFixed(0)}% | save ${(cov.saveCount * 100).toFixed(0)}% | foll=${acc.followerCount} | postCnt=${acc.postCount}`
    );
  }

  // Write back files (kalau ada duplicates dihapus)
  console.log('\n--- Write back files ---');
  for (const [slug, data] of Object.entries(fileData)) {
    // Add audit metadata
    data.stats = data.stats || {};
    data.stats.auditAt = new Date().toISOString();
    data.stats.auditCoverage = coverageReport[slug];

    const filePath = path.join(SCRAPED_DIR, `${slug}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log(`✅ ${slug} — ${data.posts.length} posts written`);
  }

  // Final summary
  const totalPosts = Object.values(fileData).reduce((s, d) => s + d.posts.length, 0);
  const totalIds = new Set();
  for (const data of Object.values(fileData)) {
    for (const p of data.posts) totalIds.add(p.id);
  }
  const finalDupes = totalPosts - totalIds.size;
  console.log(`\n=== MULTI-ACCOUNT AUDIT COMPLETE ===`);
  console.log(`Total posts: ${totalPosts}, Unique IDs: ${totalIds.size}`);
  if (finalDupes === 0) {
    console.log(`✅ Zero cross-account duplicates confirmed`);
  } else {
    console.log(`❌ ${finalDupes} duplicate(s) survived`);
  }

  // Write audit report
  const report = {
    timestamp: new Date().toISOString(),
    totalPosts,
    uniqueIds: totalIds.size,
    duplicatesFound: totalPosts - totalIds.size,
    fieldErrors: totalFieldErrors,
    perAccountFieldErrors,
    coverage: coverageReport,
    accounts: Object.fromEntries(
      Object.entries(fileData).map(([slug, d]) => [
        slug,
        {
          platform: d.platform,
          username: d.account.username,
          totalPosts: d.posts.length,
          followerCount: d.account.followerCount,
          postCount: d.account.postCount,
        },
      ])
    ),
  };
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nReport written to: ${REPORT_PATH}`);

  if (finalDupes > 0 || totalFieldErrors > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
