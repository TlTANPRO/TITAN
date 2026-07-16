// 22 analytics — 12 existing (ported from V8/repo scraper) + 10 baru (international standard)
import { extractHashtags, extractMentions } from './normalize.js';

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Stopword filter untuk contentPillars (Indonesia + English)
// Hapus kata generik yang tidak bermakna tematik
const STOPWORDS = new Set([
  // Indonesia
  'yang','untuk','pada','dengan','dari','dalam','tidak','juga','saya','kamu','kami','kita',
  'mereka','akan','telah','sudah','belum','atau','tetapi','namun','karena','jika','kalau',
  'bisa','dapat','harus','perlu','ingin','mau','hendak','sangat','sekali','lebih','kurang',
  'semua','setiap','satu','dua','tiga','empat','lima','enam','tujuh','delapan','sembilan',
  'sepuluh','banyak','sedikit','beberapa','sebagian','lain','lainnya','sama','pula',
  'adalah','merupakan','yaitu','yakni','bahwa','agar','supaya','ketika','saat','waktu',
  'tahun','bulan','minggu','hari','jam','menit','detik','kali','buah','orang','rumah',
  'tempat','hal','cara','mulai','hingga','sampai','lanjut','baca','lihat','dengar','tahu',
  'baru','lama','sekarang','kemarin','besok','nanti','maupun','baik','buruk','jadi',
  'bagi','antara','tentang','sekitar','terhadap','melalui','atas','bawah','depan','belakang',
  'kok','sih','dong','nih','deh','ya','iya','oke','ok','gak','ga','nggak','engga',
  // English
  'the','and','for','are','but','not','you','all','can','her','was','one','our','had',
  'this','that','have','with','they','from','what','when','will','your','their','there',
  'about','would','been','more','very','just','than','them','then','over','also','into',
  'only','some','here','out','these','those','such','much','many','most','could','should',
  'like','really','actually','literally','basically','probably','definitely'
]);

/**
 * Detect apakah post punya data engagement yang real (bukan 0 karena API limit).
 * Untuk IG tanpa /media/info enrichment, likes/comments/views akan 0.
 * Untuk TT, biasanya ada datanya (kecuali ENSEMBLEDATA skip).
 */
export function dataAvailability(posts, platform) {
  const total = posts.length;
  if (total === 0) {
    return {
      profile: false, posts: false, likes: false, comments: false, views: false,
      engagement: false, top: false, hasRealData: false, isEnriched: false,
      message: 'Data tidak tersedia'
    };
  }
  const hasLikes = posts.some((p) => (p.likeCount ?? 0) > 0);
  const hasComments = posts.some((p) => (p.commentCount ?? 0) > 0);
  const hasViews = posts.some((p) => (p.viewCount ?? 0) > 0);
  // TT biasanya punya semua; IG tanpa enrichment biasanya likes=0
  const isIG = platform === 'instagram';
  const isEnriched = hasLikes;
  return {
    profile: true,
    posts: true,
    likes: hasLikes,
    comments: hasComments,
    views: hasViews,
    engagement: hasLikes || hasComments,
    top: hasLikes || hasComments || hasViews,
    hasRealData: hasLikes || hasComments,
    isEnriched,
    isEstimated: isIG && !hasLikes,
    message: !hasLikes && isIG
      ? 'Data like/komentar tidak tersedia — perlu re-scrape dengan /media/info enrichment'
      : null
  };
}

// ---------- 12 existing analytics ----------

export function topByMetric(posts, key, n = 5) {
  return [...posts].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0)).slice(0, n);
}

// V11: top performers across 4 metrics (views / likes / comments / shares).
// Used by the new "Top Performers" section on the Home dashboard.
export function topByMetricExtended(posts, n = 3) {
  return {
    byViews: topByMetric(posts, 'viewCount', n),
    byLikes: topByMetric(posts, 'likeCount', n),
    byComments: topByMetric(posts, 'commentCount', n),
    byShares: topByMetric(posts, 'shareCount', n)
  };
}

// V11: hashtags / mentions with display-ready strings (no double `##` / `@@`).
// normalize.js already strips the doubling, so this is mostly a typed wrapper
// that returns `{ tag, count, display }` for UI consumption.
export function normalizedHashtags(posts, n = 10) {
  return topHashtags(posts, n).map(({ tag, count }) => {
    const stripped = String(tag).replace(/^#+/, '').toLowerCase();
    return { tag: stripped, count, display: `#${stripped}` };
  });
}

export function normalizedMentions(posts, n = 10) {
  return topMentions(posts, n).map(({ mention, count }) => {
    const stripped = String(mention).replace(/^@+/, '').toLowerCase();
    return { handle: stripped, count, display: `@${stripped}` };
  });
}

export function performanceTiers(posts) {
  const counts = { viral: 0, tinggi: 0, bagus: 0, rataRata: 0, rendah: 0 };
  if (posts.length === 0) return counts;
  const avg = posts.reduce((s, p) => s + (p.likeCount ?? 0), 0) / posts.length;
  if (avg === 0) {
    counts.rendah = posts.length;
    return counts;
  }
  for (const p of posts) {
    const ratio = (p.likeCount ?? 0) / avg;
    if (ratio >= 3) counts.viral++;
    else if (ratio >= 1.5) counts.tinggi++;
    else if (ratio >= 0.75) counts.bagus++;
    else if (ratio >= 0.3) counts.rataRata++;
    else counts.rendah++;
  }
  return counts;
}

export function topHashtags(posts, n = 10) {
  const map = new Map();
  for (const p of posts) {
    for (const tag of p.hashtags ?? []) {
      map.set(tag, (map.get(tag) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

export function topMentions(posts, n = 10) {
  const map = new Map();
  for (const p of posts) {
    for (const m of p.mentions ?? []) {
      map.set(m, (map.get(m) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([mention, count]) => ({ mention, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

export function performanceByDayOfWeek(posts) {
  const buckets = new Map();
  for (const p of posts) {
    if (!p.timestamp) continue;
    const day = new Date(p.timestamp).getUTCDay();
    const b = buckets.get(day) ?? { postCount: 0, likes: 0, comments: 0, views: 0 };
    b.postCount++;
    b.likes += p.likeCount ?? 0;
    b.comments += p.commentCount ?? 0;
    b.views += p.viewCount ?? 0;
    buckets.set(day, b);
  }
  return DAY_NAMES.map((day, idx) => {
    const b = buckets.get(idx);
    if (!b) return { day, postCount: 0, avgLikeCount: 0, avgCommentCount: 0, avgViewCount: 0 };
    return {
      day,
      postCount: b.postCount,
      avgLikeCount: b.likes / b.postCount,
      avgCommentCount: b.comments / b.postCount,
      avgViewCount: b.views / b.postCount
    };
  });
}

export function performanceByMonth(posts, followerCount) {
  const buckets = new Map();
  for (const p of posts) {
    if (!p.timestamp) continue;
    const d = new Date(p.timestamp);
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const b = buckets.get(month) ?? { postCount: 0, likes: 0, comments: 0, saves: 0 };
    b.postCount++;
    b.likes += p.likeCount ?? 0;
    b.comments += p.commentCount ?? 0;
    b.saves += p.saveCount ?? 0;
    buckets.set(month, b);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, b]) => {
      const avgLike = b.postCount > 0 ? b.likes / b.postCount : 0;
      const er =
        followerCount > 0
          ? ((avgLike + b.comments / b.postCount + b.saves / b.postCount) / followerCount) * 100
          : 0;
      return {
        month,
        postCount: b.postCount,
        totalLikeCount: b.likes,
        avgLikeCount: avgLike,
        avgEngagementRate: er
      };
    });
}

export function durationAnalysis(posts, followerCount) {
  const defs = [
    { bucket: 'Foto / Carousel', test: (p) => p.mediaType === 'IMAGE' || p.mediaType === 'CAROUSEL_ALBUM' },
    { bucket: '< 15 detik', test: (p) => (p.mediaType === 'VIDEO' || p.mediaType === 'REEL') && p.durationSeconds > 0 && p.durationSeconds < 15 },
    { bucket: '15-30 detik', test: (p) => (p.mediaType === 'VIDEO' || p.mediaType === 'REEL') && p.durationSeconds >= 15 && p.durationSeconds < 30 },
    { bucket: '30-60 detik', test: (p) => (p.mediaType === 'VIDEO' || p.mediaType === 'REEL') && p.durationSeconds >= 30 && p.durationSeconds < 60 },
    { bucket: '> 60 detik', test: (p) => (p.mediaType === 'VIDEO' || p.mediaType === 'REEL') && p.durationSeconds >= 60 }
  ];
  return defs.map(({ bucket, test }) => {
    const m = posts.filter(test);
    if (m.length === 0) return { bucket, postCount: 0, avgViewCount: 0, avgEngagementRate: 0 };
    const avgL = m.reduce((s, p) => s + (p.likeCount ?? 0), 0) / m.length;
    const avgC = m.reduce((s, p) => s + (p.commentCount ?? 0), 0) / m.length;
    const avgS = m.reduce((s, p) => s + (p.saveCount ?? 0), 0) / m.length;
    const avgV = m.reduce((s, p) => s + (p.viewCount ?? 0), 0) / m.length;
    const er = followerCount > 0 ? ((avgL + avgC + avgS) / followerCount) * 100 : 0;
    return { bucket, postCount: m.length, avgViewCount: avgV, avgEngagementRate: er };
  });
}

export function yearlySummary(posts, followerCount) {
  const buckets = new Map();
  for (const p of posts) {
    if (!p.timestamp) continue;
    const year = String(new Date(p.timestamp).getUTCFullYear());
    const b = buckets.get(year) ?? { postCount: 0, likes: 0, comments: 0, saves: 0 };
    b.postCount++;
    b.likes += p.likeCount ?? 0;
    b.comments += p.commentCount ?? 0;
    b.saves += p.saveCount ?? 0;
    buckets.set(year, b);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([year, b]) => {
      const er =
        followerCount > 0 && b.postCount > 0
          ? ((b.likes / b.postCount + b.comments / b.postCount + b.saves / b.postCount) / followerCount) * 100
          : 0;
      return { year, postCount: b.postCount, totalLikeCount: b.likes, totalCommentCount: b.comments, avgEngagementRate: er };
    });
}

export function marketInsights(agg, benchmark, tiers) {
  const strengths = [];
  const weaknesses = [];
  const recs = [];
  if (benchmark.engagementRateComparison === 'above') {
    strengths.push(`Engagement rate ${agg.engagementRate.toFixed(2)}% di atas standar industri.`);
  } else if (benchmark.engagementRateComparison === 'below') {
    weaknesses.push(`Engagement rate ${agg.engagementRate.toFixed(2)}% di bawah standar industri.`);
    recs.push('Tambah pertanyaan di caption, balas komentar, dan coba format Reels/carousel untuk reach lebih luas.');
  }
  if (benchmark.postingFrequencyComparison === 'above') {
    strengths.push(`Konsistensi posting ${agg.postsPerWeek.toFixed(1)}x/minggu di atas standar.`);
  } else if (benchmark.postingFrequencyComparison === 'below') {
    weaknesses.push(`Posting ${agg.postsPerWeek.toFixed(1)}x/minggu masih di bawah standar 4x/minggu.`);
    recs.push('Tingkatkan frekuensi menjadi minimal 4x/minggu dengan mix foto, carousel, dan Reels.');
  }
  const total = tiers.viral + tiers.tinggi + tiers.bagus + tiers.rataRata + tiers.rendah;
  if (total > 0 && (tiers.viral + tiers.tinggi) / total >= 0.3) {
    strengths.push(`${tiers.viral + tiers.tinggi}/${total} post berkategori tinggi/viral — formula konten bekerja.`);
  }
  if (total > 0 && tiers.rendah / total >= 0.4) {
    weaknesses.push(`${tiers.rendah}/${total} post berkategori rendah — kualitas belum konsisten.`);
    recs.push('Pelajari pola post berkinerja tertinggi dan replikasi.');
  }
  if (strengths.length === 0) strengths.push('Data cukup untuk dianalisis lebih lanjut.');
  if (weaknesses.length === 0) weaknesses.push('Tidak ada kelemahan signifikan pada sampel.');
  if (recs.length === 0) recs.push('Pertahankan strategi dan pantau metrik secara berkala.');
  return { strengths, weaknesses, recommendations: recs };
}

// V11: extended market insights — generates 10+ strengths, weaknesses, and
// recommendations by mining multiple analytics primitives (mix, cadence, viral
// last-hit, content pillars, hook classification, top hashtags). Used by the
// per-account "Insight & Rekomendasi" panel when AI text is missing.
export function marketInsightsExtended(account, insights) {
  const strengths = [];
  const weaknesses = [];
  const recs = [];

  const agg = insights?.aggregates ?? {};
  const bench = insights?.benchmark ?? {};
  const tiers = insights?.tiers ?? {};
  const mix = insights?.contentMix ?? {};
  const cadence = insights?.postingCadence ?? {};
  const lastViral = insights?.lastViral ?? {};
  const hooks = insights?.hookClassification ?? {};
  const pillars = insights?.contentPillars ?? [];
  const topTags = insights?.topHashtags ?? [];
  const velocity = insights?.growthVelocity ?? {};
  const availability = insights?.availability ?? {};

  const total = (tiers.viral ?? 0) + (tiers.tinggi ?? 0) + (tiers.bagus ?? 0) + (tiers.rataRata ?? 0) + (tiers.rendah ?? 0);
  const highPct = total > 0 ? ((tiers.viral ?? 0) + (tiers.tinggi ?? 0)) / total : 0;
  const lowPct = total > 0 ? (tiers.rendah ?? 0) / total : 0;

  // --- STRENGTHS (10+ candidates) ---
  if ((agg.engagementRate ?? 0) > (bench.engagementRateBenchmark ?? 0)) {
    strengths.push(`ER ${(agg.engagementRate ?? 0).toFixed(2)}% di atas benchmark ${(bench.engagementRateBenchmark ?? 0).toFixed(2)}% — akun ini punya audiens yang engaged.`);
  }
  if ((agg.postsPerWeek ?? 0) >= (bench.postingFrequencyBenchmark ?? 0)) {
    strengths.push(`Konsistensi ${(agg.postsPerWeek ?? 0).toFixed(1)} post/minggu sudah memenuhi standar — algoritma memberi sinyal positif.`);
  }
  if (highPct >= 0.3) {
    strengths.push(`${Math.round(highPct * 100)}% post masuk kategori tinggi/viral — formula konten terbukti bekerja.`);
  }
  if ((cadence.score ?? 0) >= 70) {
    strengths.push(`Cadence score ${cadence.score}/100 — jeda antar post konsisten, audiens tahu kapan menantikan konten.`);
  }
  if (lastViral?.days !== null && lastViral?.days !== undefined && lastViral.days <= 14) {
    strengths.push(`Post viral terakhir ${lastViral.days} hari lalu — momentum masih panas.`);
  }
  const mixCount = Object.values(mix.counts ?? {}).filter((v) => v > 0).length;
  if (mixCount >= 3) {
    strengths.push(`Diversifikasi format ${mixCount} tipe (${Object.entries(mix.counts ?? {}).filter(([, v]) => v > 0).map(([k]) => k).join(', ')}) — tidak tergantung satu format saja.`);
  }
  if ((hooks.question ?? 0) > 0 && (hooks.question ?? 0) / Math.max(total, 1) >= 0.2) {
    strengths.push(`${hooks.question} caption berisi pertanyaan — memicu komentar & DM, sinyal kuat untuk algoritma.`);
  }
  if (pillars[0]) {
    strengths.push(`Pillar konten "${pillars[0].pillar}" muncul konsisten — niche positioning jelas.`);
  }
  if (topTags[0]) {
    strengths.push(`Hashtag "${topTags[0].tag}" muncul di ${topTags[0].count} post — topikal, layak dipertahankan.`);
  }
  if (velocity?.trend === 'up') {
    strengths.push(`Tren ER naik (slope ${(velocity.slope ?? 0).toFixed(3)}) — momentum positif bulan-ke-bulan.`);
  }
  if ((mix.counts?.REEL ?? 0) > 0 && (mix.counts?.REEL ?? 0) / Math.max(total, 1) >= 0.4) {
    strengths.push(`${Math.round(((mix.counts.REEL ?? 0) / Math.max(total, 1)) * 100)}% konten Reel — format dengan reach organik tertinggi di 2026.`);
  }
  if (availability?.isEnriched) {
    strengths.push('Data like & komentar tersedia — analisis engagement akurat.');
  }

  // --- WEAKNESSES (10+ candidates) ---
  if ((agg.engagementRate ?? 0) < (bench.engagementRateBenchmark ?? 0)) {
    weaknesses.push(`ER ${(agg.engagementRate ?? 0).toFixed(2)}% di bawah benchmark ${(bench.engagementRateBenchmark ?? 0).toFixed(2)}% — perlu format & caption yang lebih engaging.`);
  }
  if ((agg.postsPerWeek ?? 0) < (bench.postingFrequencyBenchmark ?? 0)) {
    weaknesses.push(`Frekuensi ${(agg.postsPerWeek ?? 0).toFixed(1)} post/minggu di bawah standar ${bench.postingFrequencyBenchmark ?? 0} — algoritma menurunkan jangkauan.`);
  }
  if (lowPct >= 0.4) {
    weaknesses.push(`${Math.round(lowPct * 100)}% post berkategori rendah — kualitas belum konsisten, perlu audit tema & format.`);
  }
  if (mixCount <= 1) {
    weaknesses.push(`Hanya ${mixCount} format konten yang digunakan — rentan fatigue audiens.`);
  }
  if (lastViral?.days !== null && lastViral?.days !== undefined && lastViral.days > 30) {
    weaknesses.push(`Tidak ada post viral dalam ${lastViral.days} hari terakhir — perlu eksperimen formula baru.`);
  }
  if ((hooks.cta ?? 0) === 0) {
    weaknesses.push('Tidak ada caption dengan call-to-action eksplisit — peluang konversi ke komen/save terlewat.');
  }
  if ((cadence.score ?? 0) < 50) {
    weaknesses.push(`Cadence score ${cadence.score ?? 0}/100 — posting tidak teratur, audiens tidak punya ekspektasi.`);
  }
  if (topTags.length === 0) {
    weaknesses.push('Belum ada hashtag konsisten — discoverability organik rendah.');
  }
  if (velocity?.trend === 'down') {
    weaknesses.push(`Tren ER turun (slope ${(velocity.slope ?? 0).toFixed(3)}) — butuh reset strategi atau eksperimen format.`);
  }
  if ((agg.avgCommentCount ?? 0) < (agg.avgLikeCount ?? 0) * 0.01) {
    weaknesses.push('Rasio komen/like < 1% — caption kurang memicu diskusi, hanya like pasif.');
  }
  if (availability?.isEstimated) {
    weaknesses.push('Data like/komentar tidak lengkap karena scraper belum lewat enrichment — analisis ER terbatas.');
  }
  if (account?.followerCount > 0 && (account.followerCount < 1000) && (agg.engagementRate ?? 0) < 1) {
    weaknesses.push('Akun baru dengan ER rendah — audiens belum terbentuk, perlu konsistensi 4-8 minggu.');
  }

  // --- RECOMMENDATIONS (10+ actionable) ---
  if ((agg.postsPerWeek ?? 0) < 3) {
    recs.push('Tingkatkan frekuensi menjadi minimal 3-4 post/minggu dengan mix foto, Reels, dan carousel.');
  }
  if (mixCount < 3) {
    recs.push('Diversifikasi format: tambah Reels untuk reach, carousel untuk save, foto untuk estetika feed.');
  }
  if ((hooks.question ?? 0) === 0) {
    recs.push('Tambah 1 pertanyaan di setiap caption — "Kamu lebih suka A atau B?" memicu komentar.');
  }
  if ((hooks.cta ?? 0) === 0) {
    recs.push('Sisipkan call-to-action: "Save untuk nanti", "Tag teman", "Kirim ke DM" untuk naikkan engagement rate.');
  }
  if (pillars[0] && pillars[0].relatedTerms?.[0]) {
    recs.push(`Perdalam pillar "${pillars[0].pillar}" — eksplorasi istilah turunan seperti "${pillars[0].relatedTerms.join(', ')}".`);
  }
  if (lastViral?.days !== null && lastViral?.days !== undefined && lastViral.days > 14) {
    recs.push('Replikasi formula post viral terakhir — topik, format, jam posting, dan gaya caption.');
  }
  if (velocity?.trend === 'down') {
    recs.push('Reset strategi: eksperimen 3 format baru selama 2 minggu, ukur ER, double-down pada yang terbaik.');
  }
  if (topTags[0]) {
    recs.push(`Gunakan kombinasi 5-8 hashtag: ${topTags.slice(0, 3).map((t) => t.tag).join(' ')} (campuran niche & medium).`);
  }
  if ((agg.avgCommentCount ?? 0) < (agg.avgLikeCount ?? 0) * 0.02) {
    recs.push('Balas setiap komentar dalam 1 jam pertama — algoritma menilai interaksi 2-arah sebagai sinyal engagement.');
  }
  if (bench?.likesPerFollowerComparison === 'below') {
    recs.push('Like per follower di bawah benchmark — coba konten yang lebih "save-worthy" (tips, checklist, before-after).');
  }
  if (availability?.isEstimated) {
    recs.push('Jalankan re-scrape dengan enrichment /media/info untuk IG agar data like & komen lengkap.');
  }
  if (account?.platform === 'instagram' && (mix.counts?.REEL ?? 0) / Math.max(total, 1) < 0.3) {
    recs.push('Naikkan proporsi Reels ke minimal 30% — IG 2026 memberi reach 2-3x lebih besar untuk Reel vs foto.');
  }
  if (account?.platform === 'tiktok' && (cadence.score ?? 0) < 60) {
    recs.push('TikTok rewarding konsistensi harian — coba 1 post/hari selama 2 minggu, ukur dampaknya.');
  }

  // Ensure minimum counts
  if (strengths.length === 0) strengths.push('Data cukup untuk dianalisis lebih lanjut.');
  if (weaknesses.length === 0) weaknesses.push('Tidak ada kelemahan signifikan pada sampel.');
  if (recs.length === 0) recs.push('Pertahankan strategi dan pantau metrik secara berkala.');

  return { strengths, weaknesses, recommendations: recs };
}

const INDUSTRY = {
  instagram: { er: 3.0, lpf: 0.02, freq: 4 },
  tiktok: { er: 5.5, lpf: 0.05, freq: 7 }
};

export function industryBenchmark(agg, followerCount, platform) {
  const b = INDUSTRY[platform] ?? INDUSTRY.instagram;
  const lpf = followerCount > 0 ? agg.avgLikeCount / followerCount : 0;
  return {
    engagementRateBenchmark: b.er,
    engagementRateComparison: compareToBenchmark(agg.engagementRate, b.er),
    likesPerFollowerBenchmark: b.lpf,
    accountLikesPerFollower: lpf,
    likesPerFollowerComparison: compareToBenchmark(lpf, b.lpf),
    postingFrequencyBenchmark: b.freq,
    postingFrequencyComparison: compareToBenchmark(agg.postsPerWeek, b.freq)
  };
}

export function growthPotential(agg, benchmark, tiers) {
  let score = 40;
  if (benchmark.engagementRateComparison === 'above') score += 20;
  else if (benchmark.engagementRateComparison === 'below') score -= 10;
  if (benchmark.postingFrequencyComparison === 'above') score += 15;
  else if (benchmark.postingFrequencyComparison === 'below') score -= 10;
  if (benchmark.likesPerFollowerComparison === 'above') score += 15;
  else if (benchmark.likesPerFollowerComparison === 'below') score -= 5;
  const total = tiers.viral + tiers.tinggi + tiers.bagus + tiers.rataRata + tiers.rendah;
  if (total > 0) score += Math.round(((tiers.viral + tiers.tinggi) / total) * 20);
  score = Math.max(0, Math.min(100, score));
  const label = score >= 70 ? 'tinggi' : score >= 40 ? 'sedang' : 'rendah';
  return { score, label, reasoning: label === 'tinggi' ? 'Momentum pertumbuhan kuat.' : label === 'sedang' ? 'Ada sinyal positif, masih bisa dioptimasi.' : 'Butuh perubahan strategi untuk pertumbuhan lebih cepat.' };
}

function compareToBenchmark(value, bench, tol = 0.1) {
  if (value >= bench * (1 + tol)) return 'above';
  if (value <= bench * (1 - tol)) return 'below';
  return 'average';
}

// ---------- 10 analytics baru (international standard) ----------

export function bestTimeOfDay(posts) {
  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
  const counts = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const p of posts) {
    if (!p.timestamp) continue;
    const d = new Date(p.timestamp);
    const day = d.getUTCDay();
    const hour = d.getUTCHours();
    heatmap[day][hour] += p.likeCount ?? 0;
    counts[day][hour]++;
  }
  const cells = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const c = counts[d][h];
      cells.push({
        day: d,
        dayName: DAY_NAMES[d],
        hour: h,
        avgLikes: c > 0 ? heatmap[d][h] / c : 0,
        postCount: c
      });
    }
  }
  const top = [...cells].filter((c) => c.postCount > 0).sort((a, b) => b.avgLikes - a.avgLikes).slice(0, 3);
  return { heatmap: cells, topWindows: top };
}

export function postingCadence(posts) {
  if (posts.length < 2) {
    return { avgGapDays: 0, stdDevDays: 0, longestGapDays: 0, currentStreakDays: 0, score: 0 };
  }
  const sorted = [...posts].filter((p) => p.timestamp).sort((a, b) => a.timestamp - b.timestamp);
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((sorted[i].timestamp - sorted[i - 1].timestamp) / (1000 * 60 * 60 * 24));
  }
  const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const variance = gaps.reduce((s, g) => s + (g - avg) ** 2, 0) / gaps.length;
  const std = Math.sqrt(variance);
  const longest = Math.max(...gaps);
  const now = Date.now();
  const lastTs = sorted[sorted.length - 1].timestamp;
  const currentStreak = (now - lastTs) / (1000 * 60 * 60 * 24);
  // Score: tighter std + active streak = higher
  const consistencyScore = Math.max(0, 100 - std * 5);
  const streakScore = Math.max(0, 100 - currentStreak * 2);
  return {
    avgGapDays: avg,
    stdDevDays: std,
    longestGapDays: longest,
    currentStreakDays: currentStreak,
    score: Math.round((consistencyScore + streakScore) / 2)
  };
}

export function contentMix(posts) {
  const counts = { REEL: 0, VIDEO: 0, IMAGE: 0, CAROUSEL_ALBUM: 0, OTHER: 0 };
  for (const p of posts) {
    const t = (p.mediaType ?? 'OTHER').toUpperCase();
    if (counts[t] !== undefined) counts[t]++;
    else counts.OTHER++;
  }
  const total = posts.length || 1;
  return {
    counts,
    percentages: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, (v / total) * 100]))
  };
}

export function hashtagCoOccurrence(posts, topN = 15, minPair = 2) {
  const tagCount = new Map();
  const pairCount = new Map();
  for (const p of posts) {
    const tags = [...new Set((p.hashtags ?? []).slice(0, 6))];
    for (const t of tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        const key = [tags[i], tags[j]].sort().join('|');
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
    }
  }
  const topTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([t]) => t);
  const pairs = [...pairCount.entries()]
    .filter(([, c]) => c >= minPair)
    .map(([key, c]) => {
      const [a, b] = key.split('|');
      return { a, b, count: c };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
  return { topTags, pairs };
}

export function hookClassification(posts) {
  const hooks = { question: 0, number: 0, emoji: 0, cta: 0, statement: 0 };
  for (const p of posts) {
    const text = (p.caption ?? '').trim();
    if (!text) {
      hooks.statement++;
      continue;
    }
    const first = text.split(/\s+/)[0];
    if (text.includes('?')) hooks.question++;
    if (/^\d/.test(first)) hooks.number++;
    if (/^[\p{Emoji}]/u.test(first)) hooks.emoji++;
    if (/\b(klik|swipe|comment|save|share|tag|dm|hubungi|beli|order|cek|link in bio)\b/i.test(text)) hooks.cta++;
    if (hooks.question + hooks.number + hooks.emoji + hooks.cta === 0) hooks.statement++;
  }
  return hooks;
}

export function outlierPosts(posts, threshold = 2) {
  if (posts.length < 5) return [];
  const scores = posts.map((p) => {
    const likes = p.likeCount ?? 0;
    const comments = p.commentCount ?? 0;
    const views = p.viewCount ?? 0;
    return likes + comments * 5 + views * 0.05;
  });
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
  const std = Math.sqrt(variance);
  if (std === 0) return [];
  return posts
    .map((p, i) => ({ post: p, score: scores[i], z: (scores[i] - mean) / std }))
    .filter((x) => x.z >= threshold)
    .sort((a, b) => b.z - a.z);
}

export function growthVelocity(posts, followerCount) {
  const months = performanceByMonth(posts, followerCount);
  if (months.length < 2) return { trend: 'insufficient_data', monthly: months, forecast: null };
  const xs = months.map((_, i) => i);
  const ys = months.map((m) => m.avgEngagementRate);
  const n = xs.length;
  const sumX = xs.reduce((s, x) => s + x, 0);
  const sumY = ys.reduce((s, y) => s + y, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
  const sumXX = xs.reduce((s, x) => s + x * x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / n;
  const forecast = slope * n + intercept;
  return {
    monthly: months,
    slope,
    trend: slope > 0.05 ? 'up' : slope < -0.05 ? 'down' : 'flat',
    forecast: Math.max(0, forecast)
  };
}

// International benchmark data (Rival IQ 2024 + industry reports)
// Approximations for property/lifestyle vertical
const INTL_BENCHMARKS = {
  instagram: {
    medianEngagementRate: 0.47, // Rival IQ 2024 median across all industries
    topQuartileER: 1.21,
    propertyLifestyle: { er: 1.36, lpf: 0.0136 },
    apac: { er: 0.86 }
  },
  tiktok: {
    medianEngagementRate: 2.65, // Rival IQ 2024 TikTok
    topQuartileER: 5.6,
    propertyLifestyle: { er: 3.8, lpf: 0.05 },
    apac: { er: 3.1 }
  }
};

export function internationalBenchmark(agg, platform) {
  const b = INTL_BENCHMARKS[platform] ?? INTL_BENCHMARKS.instagram;
  const vertical = b.propertyLifestyle;
  return {
    medianER: b.medianEngagementRate,
    topQuartileER: b.topQuartileER,
    verticalER: vertical.er,
    verticalLikesPerFollower: vertical.lpf,
    apacER: b.apac.er,
    accountER: agg.engagementRate,
    performanceVsMedian: classifyVs(agg.engagementRate, b.medianEngagementRate),
    performanceVsVertical: classifyVs(agg.engagementRate, vertical.er),
    performanceVsApac: classifyVs(agg.engagementRate, b.apac.er)
  };
}

function classifyVs(actual, target) {
  if (target === 0) return 'average';
  const ratio = actual / target;
  if (ratio >= 1.5) return 'above';
  if (ratio >= 0.75) return 'average';
  return 'below';
}

export function contentPillars(posts, k = 3) {
  // Simple TF-IDF: collect caption terms, score, return top k distinctive terms as pillars
  // Filter stopwords (Indonesia + English) agar tidak muncul "yang/untuk/kamu"
  const docs = posts.map((p) =>
    (p.caption ?? '').toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !STOPWORDS.has(w))
  );
  if (docs.length === 0) return [];
  const df = new Map();
  for (const d of docs) {
    for (const w of new Set(d)) {
      df.set(w, (df.get(w) ?? 0) + 1);
    }
  }
  const tf = new Map();
  for (const d of docs) {
    for (const w of d) {
      tf.set(w, (tf.get(w) ?? 0) + 1);
    }
  }
  const N = docs.length;
  const scored = [...tf.entries()].map(([w, t]) => ({
    word: w,
    score: t * Math.log(N / ((df.get(w) ?? 1) + 1))
  }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, k * 5);
  const pillars = [];
  const used = new Set();
  for (const t of top) {
    if (pillars.length >= k) break;
    if (used.has(t.word)) continue;
    pillars.push({ pillar: t.word, score: t.score, relatedTerms: top.filter((x) => x.word.startsWith(t.word.slice(0, 3)) && x.word !== t.word).slice(0, 3).map((x) => x.word) });
    used.add(t.word);
  }
  return pillars;
}

// ============================================================
// V10 PHASE 1B: 6 NEW ANALYTICS PRIMITIVES
// ============================================================

const DAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function quantile(arr, q) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base] + (sorted[base + 1] !== undefined ? rest * (sorted[base + 1] - sorted[base]) : 0);
}

function safeRatio(num, den) {
  if (!den) return 0;
  return Math.min(num / den, 1);
}

/**
 * Composite health score (0-100) blending engagement, consistency, growth, content diversity.
 * Designed to be a single number a marketing manager can use to compare accounts at a glance.
 */
export function accountHealthScore(account) {
  const posts = account?.posts ?? [];
  const followerCount = account?.followerCount ?? 0;
  const platform = account?.platform ?? 'instagram';
  if (posts.length === 0) return { score: 0, breakdown: { engagement: 0, consistency: 0, growth: 0, diversity: 0 } };

  // --- Engagement component (40% weight) ---
  const totalLikes = posts.reduce((s, p) => s + (p.likeCount ?? 0), 0);
  const totalComments = posts.reduce((s, p) => s + (p.commentCount ?? 0), 0);
  const totalViews = posts.reduce((s, p) => s + (p.viewCount ?? 0), 0);
  const totalShares = posts.reduce((s, p) => s + (p.shareCount ?? 0), 0);
  let er = 0;
  if (platform === 'tiktok') {
    er = totalViews > 0 ? ((totalLikes + totalComments + totalShares) / totalViews) * 100 : 0;
  } else {
    er = followerCount > 0 ? ((totalLikes + totalComments) / (posts.length || 1) / followerCount) * 100 : 0;
  }
  // Industry average ~3% IG, ~6% TT — score saturates at 2× that
  const erBenchmark = platform === 'tiktok' ? 6 : 3;
  const engagement = Math.min(100, Math.round((er / (erBenchmark * 2)) * 100));

  // --- Consistency component (25% weight) ---
  // Days between posts, normalized — lower std dev = higher score
  const times = posts.map((p) => p.createTime).filter((t) => t > 0).sort((a, b) => a - b);
  let consistency = 0;
  if (times.length >= 2) {
    const gaps = [];
    for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / 86400);
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
    const std = Math.sqrt(variance);
    const cv = mean > 0 ? std / mean : 1; // coefficient of variation
    consistency = Math.max(0, Math.min(100, Math.round((1 - Math.min(cv, 1)) * 100)));
  }

  // --- Growth component (20% weight) — based on growthVelocity slope ---
  const vel = growthVelocity(posts, followerCount);
  // velocity.trend is "up" | "flat" | "down". Convert to 0-100.
  // Use actual monthly data (recentAvg/earlyAvg are NOT returned by growthVelocity)
  // to avoid NaN. Fall back to last-vs-first non-zero month.
  let growth = 50;
  const months = vel?.monthly ?? [];
  if (months.length >= 2) {
    const recent = months[months.length - 1]?.avgEngagementRate ?? 0;
    const early = months[0]?.avgEngagementRate ?? 0;
    const delta = recent - early;
    if (delta > 0) growth = Math.min(100, Math.max(50, 50 + Math.round(delta * 50)));
    else if (delta < 0) growth = Math.max(0, Math.min(50, 50 + Math.round(delta * 50)));
  } else if (vel?.trend === 'up') {
    growth = 70;
  } else if (vel?.trend === 'down') {
    growth = 30;
  }

  // --- Diversity component (15% weight) — contentMix balance ---
  const mix = contentMix(posts);
  const typeCount = Object.values(mix.counts ?? {}).filter((v) => v > 0).length;
  const diversity = Math.min(100, Math.round((typeCount / 4) * 100));

  const score = Math.round(engagement * 0.4 + consistency * 0.25 + growth * 0.2 + diversity * 0.15);
  return {
    score,
    breakdown: { engagement, consistency, growth, diversity },
    grade: score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'E'
  };
}

/**
 * Top-3 outlier recipe — what made the most viral posts perform?
 * Returns: common caption pattern, common posting slot, common hashtag, common media type.
 */
export function viralPostRecipe(posts) {
  if (!Array.isArray(posts) || posts.length === 0) {
    return { pattern: null, timing: null, hashtags: [], mediaMix: null, examples: [] };
  }
  // Use top 10% by viewCount as outliers
  const sorted = [...posts].filter((p) => (p.viewCount ?? 0) > 0).sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
  const top = sorted.slice(0, Math.max(3, Math.ceil(sorted.length * 0.1)));
  if (top.length === 0) return { pattern: null, timing: null, hashtags: [], mediaMix: null, examples: [] };

  // Caption length & emoji count
  const lengths = top.map((p) => (p.caption ?? '').length);
  const emojiCounts = top.map((p) => {
    const text = p.caption ?? '';
    return (text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) ?? []).length;
  });
  const hasQuestion = top.filter((p) => /\?/.test(p.caption ?? '')).length / top.length;

  // Posting day & hour
  const dayCounts = new Array(7).fill(0);
  const hourCounts = new Array(24).fill(0);
  for (const p of top) {
    if (p.createTime > 0) {
      const d = new Date(p.createTime * 1000);
      dayCounts[d.getDay()]++;
      hourCounts[d.getHours()]++;
    }
  }
  const topDay = dayCounts.indexOf(Math.max(...dayCounts));
  const topHour = hourCounts.indexOf(Math.max(...hourCounts));

  // Shared hashtags (appear in ≥2 top posts)
  const tagCounts = new Map();
  for (const p of top) {
    for (const t of p.hashtags ?? []) {
      const tag = (t ?? '').replace(/^#/, '').toLowerCase();
      if (!tag) continue;
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const sharedTags = [...tagCounts.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag]) => tag);

  // Media type distribution
  const typeCounts = new Map();
  for (const p of top) {
    const t = p.mediaType ?? 'OTHER';
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }
  const dominantType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    examples: top.slice(0, 3).map((p) => ({ id: p.id, shortcode: p.shortcode, viewCount: p.viewCount, likeCount: p.likeCount, caption: p.caption })),
    pattern: {
      medianLength: Math.round(median(lengths)),
      avgEmojiCount: Math.round(median(emojiCounts)),
      questionRate: Math.round(hasQuestion * 100)
    },
    timing: {
      topDay: DAY_NAMES_ID[topDay],
      topDayIndex: topDay,
      topHour,
      dayDistribution: dayCounts,
      hourDistribution: hourCounts
    },
    hashtags: sharedTags,
    mediaMix: {
      dominant: dominantType,
      counts: Object.fromEntries(typeCounts)
    }
  };
}

/**
 * Gap vs peer median (for the same platform).
 * Returns: ER gap (pp), avg likes gap, avg views gap, posting freq gap.
 */
export function competitorGap(account, peers) {
  if (!account || !Array.isArray(peers) || peers.length === 0) {
    return { erGap: 0, likesGap: 0, viewsGap: 0, postsPerWeekGap: 0, peerCount: 0 };
  }
  const samePlatform = peers.filter((p) => p.platform === account.platform && p.slug !== account.slug);
  if (samePlatform.length === 0) {
    return { erGap: 0, likesGap: 0, viewsGap: 0, postsPerWeekGap: 0, peerCount: 0 };
  }
  const peerERMedian = median(samePlatform.map((p) => p.engagementRate ?? 0).filter((v) => v > 0));
  const peerLikesMedian = median(samePlatform.map((p) => p.avgLikes ?? 0).filter((v) => v > 0));
  const peerViewsMedian = median(samePlatform.map((p) => p.avgViews ?? 0).filter((v) => v > 0));
  const peerFreqMedian = median(samePlatform.map((p) => p.postsPerWeek ?? 0).filter((v) => v > 0));

  const myER = account.engagementRate ?? 0;
  const myLikes = account.avgLikes ?? 0;
  const myViews = account.avgViews ?? 0;
  const myFreq = account.postsPerWeek ?? 0;

  return {
    erGap: Math.round((myER - peerERMedian) * 100) / 100,
    likesGap: Math.round(myLikes - peerLikesMedian),
    viewsGap: Math.round(myViews - peerViewsMedian),
    postsPerWeekGap: Math.round((myFreq - peerFreqMedian) * 10) / 10,
    peerMedian: { er: peerERMedian, likes: peerLikesMedian, views: peerViewsMedian, postsPerWeek: peerFreqMedian },
    peerCount: samePlatform.length
  };
}

/**
 * Content calendar recommendation — concrete "what to post when" based on best-performing slots.
 * Returns: top 3 day/hour combos with media type suggestion.
 */
export function contentCalendarRecommendation(posts, platform) {
  if (!Array.isArray(posts) || posts.length === 0) {
    return { slots: [], frequency: 0, mix: null };
  }
  const slots = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const matching = posts.filter((p) => {
        if (p.createTime <= 0) return false;
        const d = new Date(p.createTime * 1000);
        return d.getDay() === day && d.getHours() === hour;
      });
      if (matching.length === 0) continue;
      const avgER = matching.reduce((s, p) => s + ((p.likeCount ?? 0) + (p.commentCount ?? 0)), 0) / matching.length;
      const avgViews = matching.reduce((s, p) => s + (p.viewCount ?? 0), 0) / matching.length;
      slots.push({
        day,
        dayName: DAY_NAMES_ID[day],
        hour,
        postCount: matching.length,
        score: avgER + Math.log10(avgViews + 1) * 5
      });
    }
  }
  slots.sort((a, b) => b.score - a.score);
  const top = slots.slice(0, 3);

  // Determine media type mix suggestion
  const mix = contentMix(posts);
  const dominant = Object.entries(mix.counts ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0];

  // Recommended frequency
  const times = posts.map((p) => p.createTime).filter((t) => t > 0).sort((a, b) => a - b);
  let freq = 0;
  if (times.length >= 2) {
    const spanWeeks = (times[times.length - 1] - times[0]) / 604800;
    freq = spanWeeks > 0 ? Math.round((posts.length / spanWeeks) * 10) / 10 : posts.length;
  }

  return {
    slots: top,
    frequency: freq,
    mix: {
      dominant,
      counts: mix.counts,
      percentages: mix.percentages
    },
    platform
  };
}

/**
 * Heatmap split by media type — each cell shows avg engagement for that slot.
 * Returns: { REEL: [[24h x 7d]], VIDEO: [[...]], IMAGE: [[...]], CAROUSEL_ALBUM: [[...]] }
 */
export function postingHeatmapByMediaType(posts) {
  const types = ['REEL', 'VIDEO', 'IMAGE', 'CAROUSEL_ALBUM'];
  const result = {};
  for (const t of types) {
    const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
    const counts = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const p of posts ?? []) {
      if ((p.mediaType ?? '').toUpperCase() !== t) continue;
      if (p.createTime <= 0) continue;
      const d = new Date(p.createTime * 1000);
      const day = d.getDay();
      const hour = d.getHours();
      const score = (p.likeCount ?? 0) + (p.commentCount ?? 0) * 2;
      grid[day][hour] += score;
      counts[day][hour] += 1;
    }
    // Average per cell
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        grid[d][h] = counts[d][h] > 0 ? Math.round(grid[d][h] / counts[d][h]) : 0;
      }
    }
    result[t] = grid;
  }
  return result;
}

/**
 * Days since last viral post (top 10% by viewCount).
 * Useful for "you should aim to go viral every X days" advice.
 */
export function timeSinceLastViral(posts, now = Date.now()) {
  if (!Array.isArray(posts) || posts.length === 0) {
    return { days: null, lastViralDate: null, viralsPerMonth: 0 };
  }
  const withViews = posts.filter((p) => (p.viewCount ?? 0) > 0);
  if (withViews.length === 0) {
    return { days: null, lastViralDate: null, viralsPerMonth: 0 };
  }
  // Viral threshold: top 10% by views
  const sorted = [...withViews].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
  const threshold = sorted[Math.max(0, Math.floor(sorted.length * 0.1) - 1)]?.viewCount ?? 0;
  const virals = withViews.filter((p) => p.viewCount >= threshold);
  const mostRecent = virals.reduce((latest, p) => p.createTime > latest ? p.createTime : latest, 0);
  if (mostRecent === 0) return { days: null, lastViralDate: null, viralsPerMonth: 0 };

  const lastDate = new Date(mostRecent * 1000);
  const days = Math.round((now - lastDate.getTime()) / 86400000);
  const spanDays = (now - new Date(withViews.reduce((m, p) => Math.min(m, p.createTime), now / 1000) * 1000).getTime()) / 86400000;
  const viralsPerMonth = spanDays > 0 ? Math.round((virals.length / spanDays) * 30 * 10) / 10 : 0;

  return { days, lastViralDate: lastDate.toISOString().slice(0, 10), viralsPerMonth, totalVirals: virals.length };
}

export function crossAccountComparison(accountsData) {
  return accountsData
    .map((acc) => {
      const posts = acc.posts ?? [];
      const followerCount = acc.followerCount ?? 0;
      const totalLikes = posts.reduce((s, p) => s + (p.likeCount ?? 0), 0);
      const totalComments = posts.reduce((s, p) => s + (p.commentCount ?? 0), 0);
      const totalViews = posts.reduce((s, p) => s + (p.viewCount ?? 0), 0);
      const availability = dataAvailability(posts, acc.platform);
      // ER formula: pakai data yang reliable saja.
      // Untuk IG tanpa enrichment (likes=0), pakai views-based ER (kalau ada).
      // Untuk IG tanpa enrichment sama sekali, return null supaya caller bisa show "—".
      let er = 0;
      let hasER = false;
      if (acc.platform === 'tiktok') {
        // TT: ER = (likes + comments + shares) / views — semua field biasanya ada
        const totalShares = posts.reduce((s, p) => s + (p.shareCount ?? 0), 0);
        er = totalViews > 0 ? ((totalLikes + totalComments + totalShares) / totalViews) * 100 : 0;
        hasER = totalViews > 0;
      } else {
        // IG: ER = (avg likes + avg comments) / followers
        if (followerCount > 0 && (totalLikes > 0 || totalComments > 0)) {
          er = ((totalLikes + totalComments) / (posts.length || 1) / followerCount) * 100;
          hasER = true;
        }
      }
      // Frequency
      const times = posts.map((p) => p.createTime).filter((t) => t > 0).sort((a, b) => a - b);
      let postsPerWeek = 0;
      if (times.length >= 2) {
        const spanWeeks = (times[times.length - 1] - times[0]) / 604800;
        postsPerWeek = spanWeeks > 0 ? Math.round((posts.length / spanWeeks) * 10) / 10 : 0;
      }
      // Health score (V10 Phase 1B)
      const health = accountHealthScore(acc);
      return {
        slug: acc.slug,
        platform: acc.platform,
        username: acc.username,
        displayName: acc.displayName ?? acc.username,
        followerCount,
        postCount: posts.length,
        avgLikes: posts.length > 0 ? Math.round(totalLikes / posts.length) : 0,
        avgComments: posts.length > 0 ? Math.round(totalComments / posts.length) : 0,
        avgViews: posts.length > 0 ? Math.round(totalViews / posts.length) : 0,
        engagementRate: hasER ? er : null,
        hasER,
        postsPerWeek,
        healthScore: health.score,
        healthGrade: health.grade,
        healthBreakdown: health.breakdown,
        availability
      };
    })
    .sort((a, b) => (b.engagementRate ?? -1) - (a.engagementRate ?? -1));
}

// ---------- Aggregator ----------

export function computeAggregates(posts, followerCount, platform) {
  if (posts.length === 0) {
    return {
      totalPostsAnalyzed: 0,
      totalLikeCount: 0,
      totalCommentCount: 0,
      totalViewCount: 0,
      totalSaveCount: 0,
      avgLikeCount: 0,
      avgCommentCount: 0,
      avgViewCount: 0,
      avgSaveCount: 0,
      engagementRate: 0,
      postsPerWeek: 0
    };
  }
  const totalLikeCount = posts.reduce((s, p) => s + (p.likeCount ?? 0), 0);
  const totalCommentCount = posts.reduce((s, p) => s + (p.commentCount ?? 0), 0);
  const totalViewCount = posts.reduce((s, p) => s + (p.viewCount ?? 0), 0);
  const totalSaveCount = posts.reduce((s, p) => s + (p.saveCount ?? 0), 0);
  const avgLikeCount = totalLikeCount / posts.length;
  const avgCommentCount = totalCommentCount / posts.length;
  const avgViewCount = totalViewCount / posts.length;
  const avgSaveCount = totalSaveCount / posts.length;
  // IG: ER = (likes + comments + saves) / followers
  // TT: ER = (likes + comments + shares) / views
  let engagementRate = 0;
  if (platform === 'tiktok') {
    engagementRate = totalViewCount > 0 ? ((totalLikeCount + totalCommentCount + posts.reduce((s, p) => s + (p.shareCount ?? 0), 0)) / totalViewCount) * 100 : 0;
  } else {
    engagementRate = followerCount > 0 ? ((avgLikeCount + avgCommentCount + avgSaveCount) / followerCount) * 100 : 0;
  }
  const times = posts.map((p) => p.createTime).filter((t) => t > 0).sort((a, b) => a - b);
  let postsPerWeek = 0;
  if (times.length > 1) {
    const spanWeeks = (times[times.length - 1] - times[0]) / (60 * 60 * 24 * 7);
    postsPerWeek = spanWeeks > 0 ? posts.length / spanWeeks : posts.length;
  }
  return {
    totalPostsAnalyzed: posts.length,
    totalLikeCount,
    totalCommentCount,
    totalViewCount,
    totalSaveCount,
    avgLikeCount,
    avgCommentCount,
    avgViewCount,
    avgSaveCount,
    engagementRate,
    postsPerWeek
  };
}

export function computeAllInsights(account) {
  const posts = account.posts ?? [];
  const platform = account.platform;
  const followerCount = account.followerCount ?? 0;
  const aggregates = computeAggregates(posts, followerCount, platform);
  const benchmark = industryBenchmark(aggregates, followerCount, platform);
  const tiers = performanceTiers(posts);
  const availability = dataAvailability(posts, platform);
  // Posts per week for competitorGap consumption
  const times = posts.map((p) => p.createTime).filter((t) => t > 0).sort((a, b) => a - b);
  let postsPerWeek = 0;
  if (times.length >= 2) {
    const spanWeeks = (times[times.length - 1] - times[0]) / 604800;
    postsPerWeek = spanWeeks > 0 ? Math.round((posts.length / spanWeeks) * 10) / 10 : 0;
  }
  const enrichedAccount = { ...account, postsPerWeek, engagementRate: aggregates.engagementRate, avgLikes: aggregates.avgLikeCount, avgViews: aggregates.avgViewCount };
  return {
    aggregates,
    benchmark,
    tiers,
    availability,
    topByViews: topByMetric(posts, 'viewCount', 5),
    topByLikes: topByMetric(posts, 'likeCount', 5),
    topByComments: topByMetric(posts, 'commentCount', 5),
    topHashtags: topHashtags(posts),
    topMentions: topMentions(posts),
    performanceByDayOfWeek: performanceByDayOfWeek(posts),
    performanceByMonth: performanceByMonth(posts, followerCount),
    durationAnalysis: durationAnalysis(posts, followerCount),
    yearlySummary: yearlySummary(posts, followerCount),
    marketInsights: marketInsights(aggregates, benchmark, tiers),
    marketInsightsExtended: marketInsightsExtended(enrichedAccount, null), // placeholder; below we rebuild with full insights
    growthPotential: growthPotential(aggregates, benchmark, tiers),
    // 10 new
    bestTimeOfDay: bestTimeOfDay(posts),
    postingCadence: postingCadence(posts),
    contentMix: contentMix(posts),
    hashtagCoOccurrence: hashtagCoOccurrence(posts),
    hookClassification: hookClassification(posts),
    outlierPosts: outlierPosts(posts),
    growthVelocity: growthVelocity(posts, followerCount),
    internationalBenchmark: internationalBenchmark(aggregates, platform),
    contentPillars: contentPillars(posts),
    // V10 Phase 1B: 6 new analytics primitives
    healthScore: accountHealthScore(enrichedAccount),
    viralRecipe: viralPostRecipe(outlierPosts(posts).map((o) => o.post)),
    contentCalendar: contentCalendarRecommendation(posts, platform),
    heatmapByMediaType: postingHeatmapByMediaType(posts),
    lastViral: timeSinceLastViral(posts),
    topByMetricExtended: topByMetricExtended(posts, 3),
    normalizedHashtags: normalizedHashtags(posts),
    normalizedMentions: normalizedMentions(posts)
  };
  // Now rebuild the extended market insights with the full insights object so
  // it can see topHashtags, contentPillars, hookClassification, etc.
  result.marketInsightsExtended = marketInsightsExtended(enrichedAccount, result);
  return result;
}
