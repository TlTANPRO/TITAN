// Landing-page data derivation.
//
// Every number that appears in the landing sections is computed here from the
// manifest and the loaded dataset. Nothing is hardcoded, because a landing page
// that lies about its own data is worse than no landing page.
//
// The shape mirrors the prompts:
//   - Metrics   ← rivr-defi-landing  "2x4 grid" of headline figures
//   - Bento     ← bento-grid-stats   "Why us?" 6x10 grid
//   - SpecStats ← technical-specifications  4 tabs × 4 bars with ranges
//
// Percentages are normalised to 0..100 because both prompt chart components
// assume a 0..100 axis.

import { getAgeMs, getLatestPostAt, getLatestScrapeAt } from './dataFreshness.js';
import { getManifestCoverage } from './dataManifest.js';

const DAY_MS = 86_400_000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * Prefer the timestamp computed from loaded posts, fall back to the manifest.
 *
 * The `accounts.length ? … : …` shortcut this replaces was wrong: an account
 * record can be present while carrying no `scrapedAt`, in which case the whole
 * page silently reported "never ran" while the manifest had a real run time.
 */
export function resolveTimestamp(fromAccounts, fromManifest) {
  return fromAccounts ?? (Number(fromManifest) || null);
}

/** Human compact form for the hero/metrics tiles: 5.170 → "5.170" (id-ID). */
export function formatCompact(value) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('id-ID').format(Math.round(value));
}

export function formatCompactAge(ageMs) {
  if (ageMs == null) return '—';
  if (ageMs < HOUR_MS) return `${Math.max(1, Math.floor(ageMs / MINUTE_MS))}m`;
  if (ageMs < DAY_MS) return `${Math.floor(ageMs / HOUR_MS)}j`;
  if (ageMs < 30 * DAY_MS) return `${Math.floor(ageMs / DAY_MS)}h`;
  return `${Math.floor(ageMs / (30 * DAY_MS))}bl`;
}

// ===== Metrics (rivr-defi-landing, 2x4 divided grid) =====

/**
 * Eight headline figures. The prompt hardcodes "$2.4B / 8.5% / 140K+ / < 2s";
 * we compute the equivalents from real data and keep the same 4-column shape.
 */
export function getLandingMetrics(accounts = [], manifest = null, now = Date.now()) {
  const totalPosts = accounts.reduce((sum, a) => sum + (a?.posts?.length ?? 0), 0);
  const platformSet = new Set(
    (accounts.length ? accounts : (manifest?.accounts ?? []))
      .map((a) => String(a?.platform ?? '').toLowerCase())
      .filter(Boolean)
  );
  const latestPostAt = resolveTimestamp(
    accounts.length ? getLatestPostAt(accounts) : null,
    manifest?.latestPostAt
  );
  const lastScrapeAt = resolveTimestamp(
    accounts.length ? getLatestScrapeAt(accounts) : null,
    manifest?.lastScrapeAt
  );
  const contentAge = getAgeMs(latestPostAt, now);
  // Coverage lives in the manifest, so use it whether or not the full dataset has
  // landed. Gating this on accounts.length === 0 made the tile render "—" on every
  // normal load, which is the opposite of what the tile is for.
  const coverage = getManifestCoverage(manifest);

  const postsPerAccount = accounts.length ? totalPosts / accounts.length : 0;
  const scrapeAge = getAgeMs(lastScrapeAt, now);
  const freshAccounts = (manifest?.accounts ?? []).filter((a) => {
    const age = getAgeMs(a?.latestPostAt, now);
    return age != null && age <= 3 * DAY_MS;
  }).length;
  const trackedAccounts = manifest?.accountCount ?? accounts.length;
  const freshnessRatio = trackedAccounts ? freshAccounts / trackedAccounts : 0;

  return [
    { value: formatCompact(trackedAccounts), unit: 'akun', label: 'Instagram & TikTok dipantau tiap hari' },
    { value: formatCompact(totalPosts || manifest?.totalPosts), unit: 'post', label: 'Konten terkumpul di pustaka' },
    { value: formatCompact(postsPerAccount), unit: 'post/akun', label: 'Rata-rata kedalaman arsip per akun' },
    { value: formatCompactAge(contentAge), unit: 'lagi', label: 'Umur posting terbaru di semua akun' },
    { value: formatCompact(platformSet.size), unit: 'platform', label: 'Kanal yang di-tracking' },
    { value: `${Math.round(clampPercent(freshnessRatio * 100))}`, unit: '%', label: 'Akun dengan konten di bawah 72 jam' },
    { value: coverage == null ? '—' : `${Math.round(clampPercent(coverage * 100))}`, unit: '%', label: 'Rata-rata post dengan metrik terukur' },
    { value: formatCompactAge(scrapeAge), unit: 'lalu', label: 'Sejak pipeline scrape terakhir' }
  ];
}

// ===== Bento (bento-grid-stats) =====

/**
 * The prompt's six bento cards use fictional marketing numbers (32M+, 200+,
 * 100+ clients, 4.9/5). Ours are portfolio facts, same card shapes.
 */
export function getLandingBento(accounts = [], manifest = null, now = Date.now()) {
  const totalPosts = accounts.reduce((sum, a) => sum + (a?.posts?.length ?? 0), 0);
  const tracked = manifest?.accountCount ?? accounts.length;
  const coverage = getManifestCoverage(manifest);
  const latestPostAt = resolveTimestamp(
    accounts.length ? getLatestPostAt(accounts) : null,
    manifest?.latestPostAt
  );
  const contentAge = getAgeMs(latestPostAt, now);

  // Posts-per-account, oldest → newest, for the staircase dot chart.
  const monthly = buildMonthlyPostSeries(accounts, 6, now);

  const withMetrics = (manifest?.accounts ?? []).filter(
    (a) => Number(a?.coverage?.engagedPostShare) > 0
  ).length;

  return {
    // Card 2 — white stat card with the dot staircase
    postsStat: formatCompact(totalPosts || manifest?.totalPosts),
    postsCaption: 'post terkumpul dari seluruh akun yang dipantau.',
    monthly,

    // Card 3 — white stat card with the concentric ring diagram
    accountsStat: String(tracked),
    accountsCaption: 'akun aktif, Instagram dan TikTok.',

    // Card 4 — dark copy card. Must read as a standalone sentence, since it is
    // the first thing in that card.
    freshnessStat: contentAge == null ? '—' : formatCompactAge(contentAge),
    freshnessCaption:
      contentAge == null
        ? 'Belum ada data konten untuk dianalisis.'
        : `Posting terbaru berumur ${formatCompactAge(contentAge)}. Angka engagement tetap tampil, tapi bukan cermin kondisi hari ini.`,

    // Card 5 — scattered squares card
    coverageStat: coverage == null ? '—' : `${Math.round(clampPercent(coverage * 100))}%`,
    coverageCaption: 'post yang punya metrik engagement terukur. Sisanya tidak diukur, bukan nol.',
    coverageKnown: withMetrics,

    // Card 6 — rating card
    platformsStat: String(
      new Set((manifest?.accounts ?? []).map((a) => a.platform)).size
    ),
    platformsCaption: 'platform dengan pipeline scraping berjalan.'
  };
}

/**
 * Posts per month for the last `months` months, oldest first.
 * Returns 26 columns of 15 cells-ready heights (0..1) for the dot staircase.
 */
export function buildMonthlyPostSeries(accounts = [], months = 6, now = Date.now()) {
  const buckets = Array.from({ length: months }, () => 0);
  for (const account of accounts) {
    for (const post of account?.posts ?? []) {
      const raw = post?.createTime ?? post?.timestamp;
      const ms = typeof raw === 'number' ? (raw > 1e12 ? raw : raw * 1000) : Date.parse(raw ?? '');
      if (!Number.isFinite(ms) || ms <= 0) continue;
      const ageMonths = (now - ms) / (30 * DAY_MS);
      const index = months - 1 - Math.floor(ageMonths);
      if (index >= 0 && index < months) buckets[index] += 1;
    }
  }
  return buckets;
}

// ===== SpecStats (technical-specifications, 4 tabs × 4 bars) =====

const TAB_BAR_COUNT = 4;

/**
 * Build one prompt-shaped dataset from a metric extractor.
 * The prompt's bar shape is { label, value, target, rangeStart, rangeEnd, unit,
 * note, trace } and each trace is 6 x-positions in 0..100.
 */
function makeBar({ label, value, target, unit = '%', note, low = 0, high = 100 }) {
  const v = clampPercent(value);
  const t = clampPercent(target);
  return {
    label,
    value: round1(v),
    target: round1(t),
    unit,
    note,
    rangeStart: `${round1(clampPercent(low))}%`,
    rangeWidth: `${round1(Math.max(2, clampPercent(high) - clampPercent(low)))}%`,
    // The prompt's traces rise toward the bar's own value, so the spark never
    // draws a point the bar does not already cover.
    trace: [0.3, 0.48, 0.6, 0.74, 0.88, 1].map((f) => Math.round(clampPercent(v * f)))
  };
}

/** Average of a per-post field, or null when nothing carries it. */
function averageMetric(posts, fields) {
  let sum = 0;
  let count = 0;
  for (const post of posts) {
    for (const field of fields) {
      const value = Number(post?.[field]);
      if (Number.isFinite(value) && value > 0) {
        sum += value;
        count += 1;
        break;
      }
    }
  }
  return count ? sum / count : null;
}

/** Share (0..1) of posts that carry any of `fields`. */
function coverageOf(posts, fields) {
  if (!posts.length) return null;
  let count = 0;
  for (const post of posts) {
    for (const field of fields) {
      const value = post?.[field];
      if (value != null && value !== '') {
        count += 1;
        break;
      }
    }
  }
  return count / posts.length;
}

/**
 * Four datasets, each with four bars, computed from the loaded data.
 * Tab order follows the prompt's four-tab bar: overview, one per platform,
 * then data quality.
 */
export function getLandingSpecStats(accounts = [], manifest = null, now = Date.now()) {
  const allPosts = accounts.flatMap((a) => a?.posts ?? []);
  const byPlatform = (platform) =>
    accounts.filter((a) => String(a?.platform ?? '').toLowerCase() === platform);

  const postsFor = (list) => list.flatMap((a) => a?.posts ?? []);
  const ig = byPlatform('instagram');
  const tt = byPlatform('tiktok');
  const igPosts = postsFor(ig);
  const ttPosts = postsFor(tt);

  const manifestAccounts = manifest?.accounts ?? [];
  const tracked = manifestAccounts.length || accounts.length;
  const contentAge = getAgeMs(
    resolveTimestamp(accounts.length ? getLatestPostAt(accounts) : null, manifest?.latestPostAt),
    now
  );
  const scrapeAge = getAgeMs(
    resolveTimestamp(accounts.length ? getLatestScrapeAt(accounts) : null, manifest?.lastScrapeAt),
    now
  );
  const freshCount = manifestAccounts.filter((a) => {
    const age = getAgeMs(a?.latestPostAt, now);
    return age != null && age <= 3 * DAY_MS;
  }).length;
  const withMetrics = manifestAccounts.filter(
    (a) => Number(a?.coverage?.engagedPostShare) > 0
  ).length;

  const avgLikes = averageMetric(allPosts, ['likeCount']);
  const avgComments = averageMetric(allPosts, ['commentCount']);
  const avgViews = averageMetric(allPosts, ['viewCount', 'playCount']);
  const igLikes = averageMetric(igPosts, ['likeCount']);
  const ttLikes = averageMetric(ttPosts, ['likeCount']);
  const igViews = averageMetric(igPosts, ['viewCount', 'playCount']);
  const ttViews = averageMetric(ttPosts, ['viewCount', 'playCount']);

  // Scale a raw count into a 0..100 axis against the best value in the set, so
  // the bars stay comparable without inventing an arbitrary "good" threshold.
  const maxOf = (...values) => Math.max(1, ...values.filter((v) => Number.isFinite(v) && v > 0));
  const likesMax = maxOf(avgLikes, igLikes, ttLikes);
  const viewsMax = maxOf(avgViews, igViews, ttViews);
  const asPct = (value, max) => (Number.isFinite(value) ? (value / max) * 100 : 0);

  const emptyBars = (prefix) =>
    Array.from({ length: TAB_BAR_COUNT }, (_, i) =>
      makeBar({
        label: `${prefix} ${i + 1}`,
        value: 0,
        target: 0,
        low: 0,
        high: 20,
        note: 'belum ada data'
      })
    );

  const overview = {
    title: 'Ikhtisar Portofolio',
    summary:
      'Semua angka di bawah dihitung dari post yang benar-benar termuat di dashboard. Bar menunjukkan nilai, garis transparan menunjukkan rentang yang dipakai sebagai pembanding.',
    bars: [
      makeBar({
        label: 'Rata-rata like per post',
        value: asPct(avgLikes, likesMax),
        target: asPct(avgLikes, likesMax),
        low: 0,
        high: 100,
        note: avgLikes == null ? 'belum diukur' : `${formatCompact(avgLikes)} like`
      }),
      makeBar({
        label: 'Rata-rata komentar per post',
        value: asPct(avgComments, likesMax),
        target: asPct(avgComments, likesMax),
        low: 0,
        high: 100,
        note: avgComments == null ? 'belum diukur' : `${formatCompact(avgComments)} komentar`
      }),
      makeBar({
        label: 'Rata-rata tayangan per post',
        value: asPct(avgViews, viewsMax),
        target: asPct(avgViews, viewsMax),
        low: 0,
        high: 100,
        note: avgViews == null ? 'belum diukur' : `${formatCompact(avgViews)} tayangan`
      }),
      makeBar({
        label: 'Akun dengan metrik terukur',
        value: tracked ? (withMetrics / tracked) * 100 : 0,
        target: 100,
        low: 0,
        high: 100,
        note: `${withMetrics} dari ${tracked} akun punya data`
      })
    ]
  };

  const platformSet = (label, subset, subsetPosts, likeAvg, viewAvg, totalPosts) => ({
    title: label,
    summary:
      subset.length === 0
        ? `Tidak ada akun ${label.toLowerCase()} yang termuat. Section ini akan terisi otomatis begitu data masuk.`
        : `${subset.length} akun, ${formatCompact(totalPosts)} post. Bar membandingkan like dan tayangan terhadap platform terkuat di portofolio.`,
    bars:
      subset.length === 0
        ? emptyBars('Metrik')
        : [
            makeBar({
              label: 'Jumlah akun',
              value: (subset.length / Math.max(1, tracked)) * 100,
              target: 100,
              low: 0,
              high: 100,
              note: `dari ${tracked} akun total`
            }),
            makeBar({
              label: 'Porsi post',
              value: (totalPosts / Math.max(1, allPosts.length)) * 100,
              target: 100,
              low: 0,
              high: 100,
              note: `${formatCompact(totalPosts)} dari ${formatCompact(allPosts.length)} post`
            }),
            makeBar({
              label: 'Rata-rata like',
              value: asPct(likeAvg, likesMax),
              target: asPct(likeAvg, likesMax),
              low: 0,
              high: 100,
              note: likeAvg == null ? 'belum diukur' : `${formatCompact(likeAvg)} like`
            }),
            makeBar({
              label: 'Rata-rata tayangan',
              value: asPct(viewAvg, viewsMax),
              target: asPct(viewAvg, viewsMax),
              low: 0,
              high: 100,
              note: viewAvg == null ? 'belum diukur' : `${formatCompact(viewAvg)} tayangan`
            })
          ]
  });

  const quality = {
    title: 'Kualitas Data',
    summary:
      `Bagian ini sengaja apa adanya: berapa persen data yang benar-benar terukur, dan seberapa jauh pipeline dari jadwalnya. ` +
      `${freshCount} dari ${tracked} akun masih punya konten di bawah ambang 72 jam` +
      (contentAge == null ? '.' : ` — posting terbaru berumur ${formatCompactAge(contentAge)}.`),
    bars: [
      makeBar({
        label: 'Akun dengan metrik terukur',
        value: tracked ? (withMetrics / tracked) * 100 : 0,
        target: 100,
        low: 0,
        high: 100,
        note: `${withMetrics} dari ${tracked} akun`
      }),
      makeBar({
        label: 'Post dengan data like',
        value: (coverageOf(allPosts, ['likeCount']) ?? 0) * 100,
        target: 100,
        low: 0,
        high: 100,
        note: `${Math.round((coverageOf(allPosts, ['likeCount']) ?? 0) * 100)}% dari ${formatCompact(allPosts.length)} post`
      }),
      makeBar({
        label: 'Post dengan data tayangan',
        value: (coverageOf(allPosts, ['viewCount', 'playCount']) ?? 0) * 100,
        target: 100,
        low: 0,
        high: 100,
        note: `${Math.round((coverageOf(allPosts, ['viewCount', 'playCount']) ?? 0) * 100)}% dari ${formatCompact(allPosts.length)} post`
      }),
      // Scrape cadence rides the same 0..100 axis, expressed as "hours since the
      // last run against a 48h budget", so a full bar means the pipeline is on time.
      makeBar({
        label: 'Kepatuhan jadwal scrape',
        value: scrapeAge == null ? 0 : clampPercent(100 - (scrapeAge / (48 * HOUR_MS)) * 100),
        target: 100,
        low: 0,
        high: 100,
        note: scrapeAge == null ? 'belum pernah jalan' : `terakhir ${formatCompactAge(scrapeAge)} lalu`
      })
    ]
  };

  return {
    ikhtisar: overview,
    instagram: platformSet('Instagram', ig, igPosts, igLikes, igViews, igPosts.length),
    tiktok: platformSet('TikTok', tt, ttPosts, ttLikes, ttViews, ttPosts.length),
    kualitas: quality
  };
}

export const SPEC_TAB_ORDER = ['ikhtisar', 'instagram', 'tiktok', 'kualitas'];

export const SPEC_TAB_LABELS = {
  ikhtisar: 'Ikhtisar Portofolio',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  kualitas: 'Kualitas Data'
};
