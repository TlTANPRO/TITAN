// V39: build the data manifest + per-account split payloads.
//
// Problem: accounts-full.json is ~12.5MB and the app downloads the whole file
// before it can render anything, even though Home only needs per-account
// summaries. The audit also showed the pipeline can report "success" while
// content is weeks old, and the UI had no single place that says so.
//
// This script emits, from the root SSOT:
//   public/data/manifest.json          small summary (kb-scale, loads first)
//   public/data/accounts/<slug>.json   per-account detail, loaded on demand
//
// The manifest is the single place that answers: how many accounts, how many
// posts, when it was scraped, when the newest post is, and which metric fields
// are actually populated. `coverage` distinguishes zero from never-collected so
// the UI can stop implying "0 = no engagement".
//
// Run: node scripts/build-data-manifest.mjs
// Wired into `prebuild` via copy-data-to-public.mjs.

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_SSOT = path.join(__dirname, '..', 'accounts-full.json');
const OUT_DIR = path.join(__dirname, '..', 'public', 'data');
const ACCOUNTS_DIR = path.join(OUT_DIR, 'accounts');

const SCHEMA_VERSION = 2;
const DAY_MS = 86_400_000;

// Freshness thresholds (ms). Documented in the PRD as the working assumption
// until an owner picks a formal SLA:
//   fresh   <= 24h
//   delayed <= 72h
//   stale   >  72h
function contentStatus(ageMs) {
  if (ageMs == null) return 'unknown';
  if (ageMs <= DAY_MS) return 'fresh';
  if (ageMs <= 3 * DAY_MS) return 'delayed';
  return 'stale';
}

function toMs(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && value.trim() !== '') {
      return numeric > 1e12 ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function slugify(record, index) {
  const profile = record?.profile ?? record?.account ?? record ?? {};
  const raw = profile.username ?? record?.username ?? record?.slug ?? `account-${index + 1}`;
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || `account-${index + 1}`;
}

/**
 * Count how many posts carry each metric. `collected` is the number of posts
 * where the key exists at all, so 0 and "not collected" never collapse.
 */
function coverageOf(posts, keys) {
  const result = {};
  for (const key of keys) {
    let collected = 0;
    let present = 0;
    for (const post of posts) {
      const value = post?.[key];
      if (value === null || value === undefined || value === '') continue;
      collected += 1;
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric !== 0) present += 1;
    }
    result[key] = { collected, nonZero: present };
  }
  return result;
}

async function main() {
  let raw;
  try {
    raw = await fs.readFile(ROOT_SSOT, 'utf8');
  } catch (err) {
    console.warn(`[manifest] SSOT not readable (${err.message}); skipping manifest build.`);
    return;
  }

  let records;
  try {
    const parsed = JSON.parse(raw);
    records = Array.isArray(parsed) ? parsed : (parsed?.accounts ?? []);
  } catch (err) {
    console.error(`[manifest] accounts-full.json is not valid JSON: ${err.message}`);
    process.exit(1);
  }
  if (records.length === 0) {
    console.warn('[manifest] no account records found; skipping.');
    return;
  }

  await fs.mkdir(ACCOUNTS_DIR, { recursive: true });

  const now = Date.now();
  const accounts = [];
  let totalPosts = 0;
  let latestPostAt = null;
  let lastScrapeAt = null;
  const usedSlugs = new Set();

  for (const [index, record] of records.entries()) {
    const profile = record?.profile ?? record?.account ?? record ?? {};
    const posts = Array.isArray(record?.posts) ? record.posts : (Array.isArray(profile?.posts) ? profile.posts : []);
    const platform = String(profile.platform ?? record?.platform ?? 'unknown').toLowerCase();

    let slug = slugify(record, index);
    while (usedSlugs.has(slug)) slug = `${slug}-${index + 1}`;
    usedSlugs.add(slug);

    let accountLatest = null;
    for (const post of posts) {
      const ms = toMs(post?.createTime ?? post?.timestamp);
      if (ms != null && (accountLatest == null || ms > accountLatest)) accountLatest = ms;
    }
    const accountScrape = toMs(profile.scrapedAt ?? record?.scrapedAt);

    const coverage = coverageOf(posts, [
      'likeCount', 'commentCount', 'viewCount', 'saveCount', 'shareCount', 'playCount'
    ]);
    const totalCoverage = posts.length;
    const collectedCoverage = coverage.likeCount?.collected ?? 0;

    const ageMs = accountLatest == null ? null : Math.max(0, now - accountLatest);

    accounts.push({
      slug,
      username: profile.username ?? record?.username ?? slug,
      displayName: profile.displayName ?? profile.fullName ?? null,
      platform,
      followerCount: Number.isFinite(Number(profile.followerCount)) ? Number(profile.followerCount) : null,
      postCount: posts.length,
      latestPostAt: accountLatest,
      lastScrapeAt: accountScrape,
      contentAgeMs: ageMs,
      contentStatus: contentStatus(ageMs),
      coverage: {
        // Share of posts that carry at least one engagement metric. This is the
        // number a user can act on; the per-key breakdown stays in the detail file.
        engagedPostShare: totalCoverage ? Number((collectedCoverage / totalCoverage).toFixed(3)) : 0,
        fields: coverage
      },
      detail: `data/accounts/${slug}.json`
    });

    totalPosts += posts.length;
    if (accountLatest != null && (latestPostAt == null || accountLatest > latestPostAt)) {
      latestPostAt = accountLatest;
    }
    if (accountScrape != null && (lastScrapeAt == null || accountScrape > lastScrapeAt)) {
      lastScrapeAt = accountScrape;
    }

    // Per-account detail payload: the raw record, nothing invented.
    await fs.writeFile(
      path.join(ACCOUNTS_DIR, `${slug}.json`),
      JSON.stringify({ slug, platform, generatedAt: new Date(now).toISOString(), record }),
      'utf8'
    );
  }

  accounts.sort((a, b) => a.slug.localeCompare(b.slug));

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date(now).toISOString(),
    lastScrapeAt,
    latestPostAt,
    contentAgeMs: latestPostAt == null ? null : Math.max(0, now - latestPostAt),
    contentStatus: contentStatus(latestPostAt == null ? null : Math.max(0, now - latestPostAt)),
    accountCount: accounts.length,
    totalPosts,
    source: 'accounts-full.json',
    version: crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12),
    platforms: ['instagram', 'tiktok', 'unknown'].reduce((acc, platform) => {
      const subset = accounts.filter((a) => a.platform === platform);
      acc[platform] = {
        accountCount: subset.length,
        postCount: subset.reduce((sum, a) => sum + a.postCount, 0),
        latestPostAt: subset.reduce((max, a) => (a.latestPostAt != null && a.latestPostAt > max ? a.latestPostAt : max), 0) || null
      };
      return acc;
    }, {}),
    accounts
  };

  const manifestJson = JSON.stringify(manifest, null, 0);
  await fs.writeFile(path.join(OUT_DIR, 'manifest.json'), manifestJson, 'utf8');

  const statusLabel = manifest.contentStatus.toUpperCase();
  console.log(
    `[manifest] ${manifest.accountCount} akun · ${manifest.totalPosts} post · ` +
    `konten ${statusLabel} · v${manifest.version} · ${(Buffer.byteLength(manifestJson) / 1024).toFixed(1)} KB`
  );

  // Fail the build when the manifest says the data is empty — a zero-account
  // deploy is always a bug, never a valid state worth shipping.
  if (manifest.accountCount === 0 || manifest.totalPosts === 0) {
    console.error('[manifest] refusing to emit an empty manifest — check accounts-full.json');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[manifest] failed:', err);
  process.exit(1);
});
