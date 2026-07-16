// weeklyRecap — analytics-only generator for the V11 "Ringkasan Mingguan" panel.
// Used by WeeklyBriefing when the AI-generated text is missing. Produces four
// rich sections (Highlight, Pola, Rekomendasi, Industri) computed entirely
// from the existing data — no LLM required.
//
// All functions are pure: input is `accounts` (raw normalized accounts),
// output is a serializable object suitable for direct rendering.
import { extractHashtags } from './normalize.js';
import {
  topByMetric,
  performanceByMonth,
  bestTimeOfDay,
  contentMix,
  postingCadence,
  hookClassification,
  contentPillars,
  industryBenchmark,
  internationalBenchmark
} from './analytics.js';

const DAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const ID_HOLIDAYS = {
  // month-day → name
  '01-01': 'Tahun Baru',
  '02-17': 'Imlek',
  '03-11': 'Hari Raya Nyepi',
  '04-18': 'Wafat Isa Almasih',
  '05-01': 'Hari Buruh',
  '05-14': 'Kenaikan Isa Almasih',
  '06-01': 'Hari Lahir Pancasila',
  '07-17': 'Tahun Baru Islam',
  '08-17': 'Hari Kemerdekaan',
  '09-16': 'Maulid Nabi Muhammad',
  '12-24': 'Natal',
  '12-25': 'Hari Raya Natal',
  '12-31': 'Malam Tahun Baru'
};

const DAY_MS = 86_400_000;

function avgMetric(accounts, key) {
  const values = accounts
    .map((a) => a.aggregates?.[key] ?? 0)
    .filter((v) => Number.isFinite(v) && v > 0);
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function topAccountBy(accounts, key) {
  return accounts
    .filter((a) => Number.isFinite(a.aggregates?.[key]) && a.aggregates[key] > 0)
    .sort((a, b) => (b.aggregates[key] ?? 0) - (a.aggregates[key] ?? 0))[0];
}

function recentPosts(accounts, days = 7) {
  const cutoff = Date.now() - days * DAY_MS;
  const all = [];
  for (const a of accounts) {
    for (const p of a.posts ?? []) {
      if ((p.timestamp ?? 0) >= cutoff) all.push({ ...p, _account: a });
    }
  }
  return all;
}

/**
 * Top 5 viral posts in the last `days` days. Engagement score weights views +
 * likes + comments so a comment-heavy post can outrank a view-heavy one.
 */
export function weeklyTopViral(accounts, days = 7, n = 5) {
  const pool = recentPosts(accounts, days);
  const scored = pool
    .map((p) => ({
      post: p,
      account: p._account,
      score: (p.viewCount ?? 0) + (p.likeCount ?? 0) * 5 + (p.commentCount ?? 0) * 10
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
  return scored.map((x) => ({
    id: x.post.id,
    shortcode: x.post.shortcode,
    platform: x.account.platform,
    slug: x.account.slug,
    username: x.account.username,
    thumbnailUrl: x.post.thumbnailUrl,
    mediaType: x.post.mediaType,
    caption: x.post.caption ?? '',
    timestamp: x.post.timestamp,
    viewCount: x.post.viewCount ?? 0,
    likeCount: x.post.likeCount ?? 0,
    commentCount: x.post.commentCount ?? 0,
    score: x.score
  }));
}

/**
 * Highlight section — 3-4 sentences summarizing the standout story of the week.
 * Always returns 3+ items; never empty.
 */
export function weeklyHighlight(accounts) {
  const out = [];
  const totalPosts = accounts.reduce((s, a) => s + (a.posts?.length ?? 0), 0);
  const viral = weeklyTopViral(accounts, 7, 3);

  const topByER = accounts
    .filter((a) => (a.aggregates?.engagementRate ?? 0) > 0)
    .sort((a, b) => (b.aggregates.engagementRate ?? 0) - (a.aggregates.engagementRate ?? 0))[0];
  if (topByER) {
    out.push(
      `Akun dengan engagement rate tertinggi minggu ini adalah @${topByER.username} (${(topByER.aggregates.engagementRate ?? 0).toFixed(2)}%) — formula konten mereka sedang bekerja.`
    );
  }

  if (viral.length > 0) {
    const v = viral[0];
    const views = v.viewCount >= 1000 ? `${(v.viewCount / 1000).toFixed(1)}K` : v.viewCount;
    out.push(
      `Post ter-viral minggu ini: milik @${v.username} dengan ${views} views dan ${v.likeCount} likes — pertanda topik ini resonan dengan audiens.`
    );
  }

  const igCount = accounts.filter((a) => a.platform === 'instagram').length;
  const ttCount = accounts.filter((a) => a.platform === 'tiktok').length;
  if (igCount > 0 && ttCount > 0) {
    out.push(
      `Total ${accounts.length} akun dipantau (${igCount} Instagram + ${ttCount} TikTok) dengan ${totalPosts.toLocaleString('id-ID')} posts teranalisis.`
    );
  } else if (totalPosts > 0) {
    out.push(`Total ${accounts.length} akun dipantau dengan ${totalPosts.toLocaleString('id-ID')} posts teranalisis.`);
  } else {
    out.push('Data belum lengkap — jalankan refresh untuk memperbarui analitik mingguan.');
  }

  // Posting frequency snapshot
  const avgFreq = avgMetric(accounts, 'postsPerWeek');
  if (avgFreq > 0) {
    out.push(
      `Rata-rata posting ${avgFreq.toFixed(1)}x/minggu — ${avgFreq >= 4 ? 'konsistensi di atas standar' : 'masih di bawah standar 4x/minggu'}.`
    );
  }

  return out;
}

/**
 * 5 patterns identified from cross-account data. Each pattern cites a number
 * and at least one account so the marketer can drill in.
 */
export function weeklyPatterns(accounts) {
  const out = [];

  // Pattern 1: best format by avg engagement
  const formatScores = new Map();
  for (const a of accounts) {
    for (const p of a.posts ?? []) {
      const t = p.mediaType ?? 'OTHER';
      const score = (p.likeCount ?? 0) + (p.commentCount ?? 0) * 2;
      const entry = formatScores.get(t) ?? { total: 0, count: 0 };
      entry.total += score;
      entry.count += 1;
      formatScores.set(t, entry);
    }
  }
  const formatRank = [...formatScores.entries()]
    .filter(([, v]) => v.count > 0)
    .map(([t, v]) => ({ type: t, avg: v.total / v.count, count: v.count }))
    .sort((a, b) => b.avg - a.avg);
  if (formatRank[0]) {
    out.push(
      `Format ${formatRank[0].type} punya rata-rata engagement ${Math.round(formatRank[0].avg)} per post — dominan di ${formatRank[0].count} posts.`
    );
  }

  // Pattern 2: best day of week
  const dayScores = new Map();
  for (const a of accounts) {
    for (const p of a.posts ?? []) {
      if (!p.timestamp) continue;
      const d = new Date(p.timestamp).getUTCDay();
      const entry = dayScores.get(d) ?? { total: 0, count: 0 };
      entry.total += (p.likeCount ?? 0) + (p.commentCount ?? 0);
      entry.count += 1;
      dayScores.set(d, entry);
    }
  }
  const dayRank = [...dayScores.entries()]
    .filter(([, v]) => v.count > 0)
    .map(([d, v]) => ({ day: d, avg: v.total / v.count, count: v.count }))
    .sort((a, b) => b.avg - a.avg);
  if (dayRank[0]) {
    out.push(
      `${DAY_NAMES_ID[dayRank[0].day]} adalah hari dengan rata-rata engagement tertinggi (${Math.round(dayRank[0].avg)}) — ${dayRank[0].count} posts terkumpul.`
    );
  }

  // Pattern 3: best hour slot
  const hourScores = new Map();
  for (const a of accounts) {
    for (const p of a.posts ?? []) {
      if (!p.timestamp) continue;
      const h = new Date(p.timestamp).getUTCHours();
      const entry = hourScores.get(h) ?? { total: 0, count: 0 };
      entry.total += (p.likeCount ?? 0) + (p.commentCount ?? 0);
      entry.count += 1;
      hourScores.set(h, entry);
    }
  }
  const hourRank = [...hourScores.entries()]
    .filter(([, v]) => v.count > 0)
    .map(([h, v]) => ({ hour: h, avg: v.total / v.count, count: v.count }))
    .sort((a, b) => b.avg - a.avg);
  if (hourRank[0]) {
    out.push(
      `Jam ${String(hourRank[0].hour).padStart(2, '0')}:00-${String((hourRank[0].hour + 1) % 24).padStart(2, '0')}:00 (UTC) adalah slot dengan engagement rata-rata ${Math.round(hourRank[0].avg)} — layak jadi waktu posting tetap.`
    );
  }

  // Pattern 4: hashtag paling sering muncul
  const tagCounts = new Map();
  for (const a of accounts) {
    for (const p of a.posts ?? []) {
      for (const t of extractHashtags(p.caption ?? '')) {
        const stripped = t.replace(/^#+/, '').toLowerCase();
        if (stripped) tagCounts.set(stripped, (tagCounts.get(stripped) ?? 0) + 1);
      }
    }
  }
  const tagRank = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 1);
  if (tagRank[0]) {
    out.push(
      `Hashtag #${tagRank[0][0]} muncul di ${tagRank[0][1]} posts — topik paling konsisten antar akun.`
    );
  }

  // Pattern 5: posting cadence (consistency)
  const cadences = accounts
    .map((a) => postingCadence(a.posts ?? []))
    .filter((c) => c.score > 0);
  if (cadences.length > 0) {
    const avgScore = cadences.reduce((s, c) => s + c.score, 0) / cadences.length;
    out.push(
      `Skor konsistensi rata-rata ${Math.round(avgScore)}/100 — ${avgScore >= 70 ? 'cadence posting solid, algoritma memberi sinyal positif' : 'masih ada jeda panjang antar post yang menurunkan jangkauan'}.`
    );
  }

  return out.slice(0, 5);
}

/**
 * 5 actionable recommendations for the next week. Each one references an
 * account so the marketer knows exactly whom to brief.
 */
export function weeklyRecommendations(accounts) {
  const out = [];

  const topByER = accounts
    .filter((a) => (a.aggregates?.engagementRate ?? 0) > 0)
    .sort((a, b) => (b.aggregates.engagementRate ?? 0) - (a.aggregates.engagementRate ?? 0))[0];
  const lowByER = accounts
    .filter((a) => (a.aggregates?.engagementRate ?? 0) > 0)
    .sort((a, b) => (a.aggregates.engagementRate ?? 0) - (b.aggregates.engagementRate ?? 0))[0];

  if (topByER) {
    out.push(
      `Replikasi formula @${topByER.username} di akun lain — format, jam posting, dan gaya caption yang sama.`
    );
  }
  if (lowByER) {
    out.push(
      `Brief @${lowByER.username} untuk加倍 posting (target 4-5x/minggu) dan eksperimen 2 format baru minggu depan.`
    );
  }

  // Find best time slot to recommend
  const heatmap = bestTimeOfDay(accounts.flatMap((a) => a.posts ?? []));
  if (heatmap.topWindows?.[0]) {
    const w = heatmap.topWindows[0];
    out.push(
      `Jadwalkan 3 posting utama di ${w.dayName} jam ${String(w.hour).padStart(2, '0')}:00 — window dengan avg likes ${Math.round(w.avgLikes)}.`
    );
  }

  // Diversity recommendation
  const mixRanks = accounts
    .map((a) => ({ account: a, mix: contentMix(a.posts ?? []) }))
    .sort((a, b) => {
      const aDiv = Object.values(a.mix.counts ?? {}).filter((v) => v > 0).length;
      const bDiv = Object.values(b.mix.counts ?? {}).filter((v) => v > 0).length;
      return aDiv - bDiv;
    });
  if (mixRanks[0]) {
    const acc = mixRanks[0].account;
    const used = Object.entries(mixRanks[0].mix.counts ?? {}).filter(([, v]) => v > 0).map(([k]) => k);
    const missing = ['REEL', 'VIDEO', 'IMAGE', 'CAROUSEL_ALBUM'].filter((t) => !used.includes(t));
    if (missing.length > 0) {
      out.push(
        `Diversifikasi format @${acc.username}: akun ini baru pakai ${used.join(', ')} — coba ${missing[0]} minggu depan.`
      );
    }
  }

  // Hook recommendation
  const totalHooks = { question: 0, cta: 0, number: 0, emoji: 0, statement: 0 };
  for (const a of accounts) {
    const h = hookClassification(a.posts ?? []);
    for (const k of Object.keys(totalHooks)) totalHooks[k] += h[k] ?? 0;
  }
  const total = Object.values(totalHooks).reduce((s, v) => s + v, 0) || 1;
  if (totalHooks.question / total < 0.2) {
    out.push(
      `Tambah caption berisi pertanyaan di 30% post minggu depan — sekarang baru ${Math.round((totalHooks.question / total) * 100)}% dari total.`
    );
  } else if (totalHooks.cta / total < 0.3) {
    out.push(
      `Sisipkan call-to-action eksplisit ("save", "tag", "DM") di caption — saat ini ${Math.round((totalHooks.cta / total) * 100)}% post punya CTA.`
    );
  }

  // Cross-post recommendation
  const igAccounts = accounts.filter((a) => a.platform === 'instagram');
  const ttAccounts = accounts.filter((a) => a.platform === 'tiktok');
  if (igAccounts.length > 0 && ttAccounts.length > 0) {
    const topIG = [...igAccounts].sort((a, b) => (b.aggregates?.engagementRate ?? 0) - (a.aggregates?.engagementRate ?? 0))[0];
    const topTT = [...ttAccounts].sort((a, b) => (b.aggregates?.engagementRate ?? 0) - (a.aggregates?.engagementRate ?? 0))[0];
    if (topIG && topTT) {
      out.push(
        `Cross-post konten terbaik @${topIG.username} (IG) ke @${topTT.username} (TikTok) dan sebaliknya — adaptasi format, jangan copy-paste.`
      );
    }
  }

  return out.slice(0, 5);
}

/**
 * Industry summary — compares account ER to Rival IQ 2024 benchmarks and
 * APAC regional medians. Always returns 2-4 sentences.
 */
export function weeklyIndustry(accounts) {
  const out = [];
  const igAccounts = accounts.filter((a) => a.platform === 'instagram');
  const ttAccounts = accounts.filter((a) => a.platform === 'tiktok');

  if (igAccounts.length > 0) {
    const avgER = igAccounts.reduce((s, a) => s + (a.aggregates?.engagementRate ?? 0), 0) / igAccounts.length;
    const bench = internationalBenchmark({ engagementRate: avgER }, 'instagram');
    const vsMedian = bench.performanceVsMedian;
    out.push(
      `Instagram rata-rata ER ${avgER.toFixed(2)}% — ${vsMedian === 'above' ? 'di atas' : vsMedian === 'below' ? 'di bawah' : 'sejajar'} median global ${bench.medianER}% (Rival IQ 2024) dan benchmark vertikal properti ${bench.verticalER}%.`
    );
  }
  if (ttAccounts.length > 0) {
    const avgER = ttAccounts.reduce((s, a) => s + (a.aggregates?.engagementRate ?? 0), 0) / ttAccounts.length;
    const bench = internationalBenchmark({ engagementRate: avgER }, 'tiktok');
    out.push(
      `TikTok rata-rata ER ${avgER.toFixed(2)}% — ${bench.performanceVsMedian === 'above' ? 'di atas' : bench.performanceVsMedian === 'below' ? 'di bawah' : 'sejajar'} median global ${bench.medianER}%, dengan top quartile di ${bench.topQuartileER}%.`
    );
  }
  if (igAccounts.length === 0 && ttAccounts.length === 0) {
    out.push('Belum ada akun Instagram/TikTok yang dianalisis.');
  }
  out.push(
    'Rekomendasi Rival IQ 2026: fokus pada Reels pendek (≤15 detik) untuk reach, carousel untuk save rate, dan Stories untuk close-loop conversion.'
  );
  return out;
}

/**
 * Master entry point — returns the full 4-section recap as one object.
 */
export function buildWeeklyRecap(accounts) {
  return {
    topViral: weeklyTopViral(accounts, 7, 5),
    highlight: weeklyHighlight(accounts),
    patterns: weeklyPatterns(accounts),
    recommendations: weeklyRecommendations(accounts),
    industry: weeklyIndustry(accounts),
    generatedAt: new Date().toISOString()
  };
}

/**
 * 4-week content calendar starting from `startDate` (default: today). Each
 * day carries: ISO date, Indonesian day name, recommended slot, media-type
 * suggestion, content idea, and (if applicable) holiday name.
 */
export function getNext4WeeksCalendar(accounts, startDate = new Date()) {
  const calendar = [];
  const allPosts = accounts.flatMap((a) => a.posts ?? []);
  const mix = contentMix(allPosts);
  const dominant = Object.entries(mix.counts ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'IMAGE';
  const heat = bestTimeOfDay(allPosts);
  const topSlot = heat.topWindows?.[0];
  const topHour = topSlot?.hour ?? 19;

  // Top content pillars (if any)
  const pillars = contentPillars(allPosts, 3);
  const pillarA = pillars[0]?.pillar ?? 'properti';
  const pillarB = pillars[1]?.pillar ?? 'lifestyle';
  const pillarC = pillars[2]?.pillar ?? 'lokasi';

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const mediaRotation = ['REEL', dominant, 'CAROUSEL_ALBUM', 'IMAGE', 'REEL', dominant, 'CAROUSEL_ALBUM'];
  const ideas = [
    `Reveal ${pillarA} terbaru`,
    `Behind the scene ${pillarB}`,
    `Tips memilih ${pillarC}`,
    `Story ${pillarA} client`,
    `Walkthrough ${pillarB}`,
    `Q&A interaktif`,
    `Konten kolab creator`
  ];

  for (let d = 0; d < 28; d++) {
    const date = new Date(start.getTime() + d * DAY_MS);
    const iso = date.toISOString().slice(0, 10);
    const dayIdx = date.getDay();
    const dayName = DAY_NAMES_ID[dayIdx];
    const md = iso.slice(5); // MM-DD
    const holiday = ID_HOLIDAYS[md];
    // Recommend posting on the best-performing days, skip Mondays if cadence is low
    const recommended = [1, 3, 4, 6].includes(dayIdx); // Tue, Thu, Fri, Sun
    const mediaType = holiday ? 'REEL' : mediaRotation[d % mediaRotation.length];
    const idea = holiday
      ? `Konten spesial "${holiday}"`
      : ideas[d % ideas.length];
    calendar.push({
      date: iso,
      dayName,
      recommended,
      hour: topHour,
      mediaType,
      idea,
      holiday
    });
  }
  return calendar;
}
