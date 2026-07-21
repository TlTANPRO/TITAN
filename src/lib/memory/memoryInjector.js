// Memory Layer 4: combine all layers → augmented system prompt
import { loadUserProfile, setUserName, getUserName } from './userProfile.js';
import { loadAccountContext } from './accountContext.js';
import { loadHistory } from './chatHistory.js';
import { computeAllInsights } from '../analytics.js';
import { getAccountBySlug, getAllAccounts, loadAccounts } from '../dataStore.js';
import { crossAccountComparison } from '../analytics.js';

const BASE_SYSTEM_PROMPT = `Kamu adalah analis social media marketing senior dengan keahlian setara konsultan Rival IQ / HubSpot. Tugasmu: membantu user memahami data akun Instagram/TikTok mereka, menjawab pertanyaan marketing dengan natural, insightful, dan berdasarkan data.

ATURAN PENTING:
- Jawab dengan natural seperti ngobrol dengan rekan kerja yang pinter — tidak ada template, tidak ada format tetap
- PAKAI DATA KONKRET dari "Live Analytics" di bawah — angka, nama akun, nama post, hashtag, tier — bukan generalitas
- Kalau user tanya analisis, tunjukkan reasoning berdasarkan angka (mis: "ER 1.4% < benchmark 2%, jadi underperform di tier ini")
- Untuk cross-account question ("akun mana yang..."), pakai tabel ranking dari "Cross-Account Ranking" di bawah
- Untuk pertanyaan di luar data, katakan terus terang dan tawarkan /search atau fetch URL
- Pakai bahasa Indonesia (campur English untuk istilah teknis) kecuali user minta bahasa lain
- Tidak perlu salam/closing template, langsung ke isi
- Panjang jawaban sesuaikan pertanyaan
- Kalau user menyebut nama mereka secara eksplisit, INGAT nama tersebut
- Kalau belum tahu nama user, panggil dengan "kamu" atau "Anda"
- Identitas user adalah fleksibel (multi-user dashboard), bukan single owner`;

// Format a number with Indonesian locale separators
function fmtNum(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('id-ID');
}
function fmtPct(n, d = 1) {
  if (n == null || isNaN(n)) return '0%';
  return `${Number(n).toFixed(d)}%`;
}
function fmtCompact(n) {
  if (n == null || isNaN(n)) return '0';
  const v = Number(n);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
}

// Build per-account analytics block for system prompt
// Capped to ~2500 tokens to avoid blowing up context window
function buildAccountAnalyticsBlock(insights, account) {
  const lines = [];
  const { aggregates, benchmark, tiers, availability, topByViews, topByLikes, topByComments,
    topHashtags, topMentions, performanceByDayOfWeek, performanceByMonth, marketInsights,
    growthPotential, healthScore, lastViral, contentMix, hookClassification, contentPillars,
    bestTimeOfDay, outlierPosts, postingCadence, viralRecipe } = insights;

  // 1. Aggregates (Ringkasan)
  lines.push('### Ringkasan Performa');
  lines.push(`- Followers: ${fmtNum(account.followerCount)} | Posts: ${fmtNum(account.postCount ?? account.posts?.length)} | Platform: ${account.platform}`);
  lines.push(`- ER: ${fmtPct(aggregates.engagementRate, 2)} | Avg likes/post: ${fmtCompact(aggregates.avgLikeCount)} | Avg views/post: ${fmtCompact(aggregates.avgViewCount)}`);
  lines.push(`- Avg comments/post: ${fmtCompact(aggregates.avgCommentCount)} | Avg shares/post: ${fmtCompact(aggregates.avgShareCount)}`);
  if (availability.message) lines.push(`- Data: ${availability.message}`);

  // 2. Benchmark
  lines.push('', '### Benchmark vs Industri');
  lines.push(`- ER akun ini: ${fmtPct(benchmark.engagementRateComparison === 'above' ? 2.5 : 1.2)} (${benchmark.engagementRateComparison === 'above' ? 'di atas' : benchmark.engagementRateComparison === 'below' ? 'di bawah' : 'rata-rata'} median)`);
  if (benchmark.postingFrequencyBenchmark) lines.push(`- Frekuensi posting: ${fmtNum(aggregates.postsPerWeek ?? 0)}×/minggu vs benchmark ${fmtNum(benchmark.postingFrequencyBenchmark)}×`);

  // 3. Performance tiers
  lines.push('', '### Distribusi Tingkatan Performa');
  lines.push(`- Sangat viral (>3× rata-rata): ${tiers.viral ?? 0} post`);
  lines.push(`- Tinggi (1.5-3×): ${tiers.tinggi ?? 0} post`);
  lines.push(`- Bagus (0.75-1.5×): ${tiers.bagus ?? 0} post`);
  lines.push(`- Rata-rata (0.3-0.75×): ${tiers.rataRata ?? 0} post`);
  lines.push(`- Rendah (<0.3×): ${tiers.rendah ?? 0} post`);

  // 4. Top 3 posts by each metric
  if (topByViews?.length > 0) {
    lines.push('', '### Top 3 Post — Views');
    for (const p of topByViews.slice(0, 3)) {
      const cap = (p.caption || '').slice(0, 80).replace(/\n/g, ' ');
      lines.push(`- [${fmtCompact(p.viewCount)} views, ${fmtCompact(p.likeCount)} likes] "${cap}…"`);
    }
  }
  if (topByLikes?.length > 0) {
    lines.push('', '### Top 3 Post — Likes');
    for (const p of topByLikes.slice(0, 3)) {
      const cap = (p.caption || '').slice(0, 80).replace(/\n/g, ' ');
      lines.push(`- [${fmtCompact(p.likeCount)} likes, ${fmtCompact(p.viewCount)} views] "${cap}…"`);
    }
  }
  if (topByComments?.length > 0) {
    lines.push('', '### Top 3 Post — Komentar');
    for (const p of topByComments.slice(0, 3)) {
      const cap = (p.caption || '').slice(0, 80).replace(/\n/g, ' ');
      lines.push(`- [${fmtCompact(p.commentCount)} komentar] "${cap}…"`);
    }
  }

  // 5. Top hashtags & mentions
  if (topHashtags?.length > 0) {
    lines.push('', '### Top 10 Hashtag');
    lines.push(topHashtags.slice(0, 10).map((h) => `#${h.tag}(${h.count})`).join(' '));
  }
  if (topMentions?.length > 0) {
    lines.push('', '### Top 5 Mention');
    lines.push(topMentions.slice(0, 5).map((m) => `@${m.mention}(${m.count})`).join(' '));
  }

  // 6. Performance by day of week
  if (performanceByDayOfWeek?.length > 0) {
    lines.push('', '### Rata-rata Likes per Hari');
    const top = [...performanceByDayOfWeek].sort((a, b) => (b.avgLikeCount ?? 0) - (a.avgLikeCount ?? 0)).slice(0, 3);
    lines.push(`- Top 3 hari: ${top.map((d) => `${d.day}(${fmtCompact(d.avgLikeCount)})`).join(', ')}`);
  }

  // 7. Content mix
  if (contentMix?.counts) {
    const mix = Object.entries(contentMix.counts).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(', ');
    if (mix) lines.push('', `### Komposisi Format: ${mix}`);
  }

  // 8. Hook classification
  if (hookClassification && Object.keys(hookClassification).length > 0) {
    lines.push('', '### Hook Caption');
    lines.push(Object.entries(hookClassification).map(([k, v]) => `${k}:${v}`).join(', '));
  }

  // 9. Health score
  if (healthScore) {
    lines.push('', `### Health Score: ${healthScore.grade} (${healthScore.score}/100)`);
    lines.push(`- Engagement: ${healthScore.breakdown.engagement} | Consistency: ${healthScore.breakdown.consistency} | Growth: ${healthScore.breakdown.growth} | Diversity: ${healthScore.breakdown.diversity}`);
  }

  // 10. Last viral
  if (lastViral?.lastViralDate) {
    lines.push('', `### Hari sejak viral terakhir: ${lastViral.days} hari (pada ${lastViral.lastViralDate})`);
  }

  // 11. Growth potential
  if (growthPotential) {
    lines.push('', `### Potensi Pertumbuhan: ${growthPotential.score}/100 (${growthPotential.label})`);
    lines.push(`- ${growthPotential.reasoning}`);
  }

  // 12. Posting cadence
  if (postingCadence) {
    lines.push('', `### Konsistensi Posting: ${postingCadence.score}/100 (avg gap ${postingCadence.avgGapDays?.toFixed(1)} hari)`);
  }

  // 13. Market insights (SWOT)
  if (marketInsights) {
    lines.push('', '### Kekuatan (auto-detected)');
    for (const s of (marketInsights.strengths ?? []).slice(0, 3)) lines.push(`- ${s}`);
    lines.push('', '### Kelemahan (auto-detected)');
    for (const w of (marketInsights.weaknesses ?? []).slice(0, 3)) lines.push(`- ${w}`);
    lines.push('', '### Rekomendasi (auto-detected)');
    for (const r of (marketInsights.recommendations ?? []).slice(0, 3)) lines.push(`- ${r}`);
  }

  // 14. Outlier posts
  if (outlierPosts?.length > 0) {
    lines.push('', `### ${outlierPosts.length} Post Outlier (performa > 2σ)`);
    for (const o of outlierPosts.slice(0, 3)) {
      const p = o.post ?? o;
      const cap = (p.caption || '').slice(0, 80).replace(/\n/g, ' ');
      lines.push(`- [${fmtCompact(p.viewCount)} views, ${fmtCompact(p.likeCount)} likes] "${cap}…"`);
    }
  }

  // 15. Content pillars
  if (contentPillars?.length > 0) {
    lines.push('', '### Pilar Konten (TF-IDF)');
    for (const p of contentPillars.slice(0, 3)) {
      lines.push(`- ${p.pillar}${p.relatedTerms ? ` (${p.relatedTerms.slice(0, 3).join(', ')})` : ''}`);
    }
  }

  return lines.join('\n');
}

// Build cross-account ranking (untuk pertanyaan "akun mana yang...")
function buildCrossAccountBlock() {
  const all = getAllAccounts();
  if (!all || all.length === 0) return '';

  // crossAccountComparison compute ER/health dari posts langsung,
  // tidak butuh field tambahan.
  const comparison = crossAccountComparison(all);

  const lines = ['', '## Cross-Account Ranking (9 Akun)'];
  lines.push('### ER Tertinggi');
  const byER = comparison.filter((a) => a.hasER).sort((a, b) => b.engagementRate - a.engagementRate);
  byER.slice(0, 5).forEach((a, i) => {
    lines.push(`${i + 1}. @${a.username} (${a.platform === 'instagram' ? 'IG' : 'TT'}) — ER ${fmtPct(a.engagementRate, 2)}, ${fmtCompact(a.followerCount)} followers`);
  });

  lines.push('', '### Followers Terbanyak');
  const byFollowers = [...comparison].sort((a, b) => b.followerCount - a.followerCount);
  byFollowers.slice(0, 5).forEach((a, i) => {
    lines.push(`${i + 1}. @${a.username} (${a.platform === 'instagram' ? 'IG' : 'TT'}) — ${fmtCompact(a.followerCount)} followers, ER ${fmtPct(a.engagementRate, 2)}`);
  });

  lines.push('', '### Post Terbanyak');
  const byPosts = [...comparison].sort((a, b) => b.postCount - a.postCount);
  byPosts.slice(0, 5).forEach((a, i) => {
    lines.push(`${i + 1}. @${a.username} (${a.platform === 'instagram' ? 'IG' : 'TT'}) — ${a.postCount} post`);
  });

  // V30.3: Daftar lengkap semua akun — untuk pertanyaan "sebutkan semua akun"
  // Top-5 ranking di atas tidak include akun yang rank 6-9 di semua kategori
  // (mis. tt-syahfalahproperti: rank 7-9 di semua ranking → invisible ke AI
  // → AI halusinasi jawab "akun belum masuk pipeline"). Block ini WAJIB
  // ada supaya AI punya ground truth lengkap saat user tanya listing.
  // Sort: IG dulu, lalu TT (primary→secondary), alphabetical dalam platform
  // (deterministic → LLM bisa enumerate dengan benar).
  lines.push('', `### Daftar Lengkap ${comparison.length} Akun (ground truth — pakai untuk pertanyaan \"sebutkan semua akun\")`);
  const fullList = [...comparison].sort((a, b) => {
    if (a.platform !== b.platform) return a.platform === 'instagram' ? -1 : 1;
    return a.username.localeCompare(b.username);
  });
  fullList.forEach((a) => {
    const er = a.hasER ? `${a.engagementRate.toFixed(2)}%` : '—';
    const plat = a.platform === 'instagram' ? 'IG' : 'TT';
    const fol = a.followerCount.toLocaleString('id-ID');
    lines.push(`- @${a.username} (${plat}, ${fol} followers, ${a.postCount} posts, ER ${er})`);
  });

  return lines.join('\n');
}

export async function buildSystemPrompt(accountSlug, accountData = null) {
  // Ensure dataStore loaded sebelum baca data — kalau dataStore belum ready
  // (mis. race condition first load), tunggu sampai selesai. Setelah loaded
  // pertama kali, ini no-op karena cached.
  await loadAccounts();

  // Auto-detect name from history kalau belum ada di localStorage
  const history = loadHistory();
  if (!getUserName()) {
    const detected = extractUserNameFromHistory(history);
    if (detected) setUserName(detected);
  }
  const profile = await loadUserProfile();
  const accountCtx = loadAccountContext(accountSlug);

  const lines = [BASE_SYSTEM_PROMPT, '', '## User Profile', profile];

  // 1. Account metadata (ringkas)
  if (accountData) {
    lines.push('', '## Account Metadata', `User sedang membuka akun ${accountData.platform} @${accountData.username}.`);
    lines.push(`- Display name: ${accountData.displayName ?? accountData.username}`);
    lines.push(`- Followers: ${(accountData.followerCount ?? 0).toLocaleString('id-ID')}`);
    lines.push(`- Posts: ${accountData.postCount ?? (accountData.posts?.length ?? 0)}`);
    if (accountData.bio) lines.push(`- Bio: ${accountData.bio}`);
    if (accountData.isVerified) lines.push(`- Verified: ya`);
  }

  // 2. LIVE ANALYTICS — kalau ada slug DAN data di dataStore, compute dan inject
  // Ini bagian yang paling penting: AI harus punya akses ke data konkret
  if (accountSlug) {
    const fullAccount = getAccountBySlug(accountSlug);
    if (fullAccount && fullAccount.posts?.length > 0) {
      try {
        const insights = computeAllInsights(fullAccount);
        lines.push('', '## Live Analytics (auto-computed dari data real-time)');
        lines.push(buildAccountAnalyticsBlock(insights, fullAccount));
      } catch (e) {
        // fallback diam-diam kalau analytics gagal
        console.warn('[TITAN] analytics injection failed:', e.message);
      }
    }
  }

  // 3. Cross-account ranking — selalu di-inject supaya AI bisa jawab
  // pertanyaan lintas akun dari mana saja (Home, AccountPage, Global)
  const crossBlock = buildCrossAccountBlock();
  if (crossBlock) {
    lines.push(crossBlock);
  }

  // 4. Memory layers (existing)
  if (accountCtx.recentTopics?.length > 0) {
    lines.push('', '## Topik yang Baru Dibahas', accountCtx.recentTopics.map((t) => `- ${t}`).join('\n'));
  }
  if (accountCtx.conversationSummary) {
    lines.push('', '## Ringkasan Percakapan', accountCtx.conversationSummary);
  }
  if (accountCtx.customNotes) {
    lines.push('', '## Catatan User', accountCtx.customNotes);
  }

  const recentHistory = history.slice(-10);
  if (recentHistory.length > 0) {
    lines.push('', '## Riwayat Chat Terakhir', recentHistory.map((m) => `[${m.role}] ${m.content.slice(0, 200)}`).join('\n'));
  }

  return lines.join('\n');
}

// Extract user-provided name dari recent messages.
// Pattern yang dikenali: "nama saya X", "panggil saya X", "saya X (perkenalan)",
// "aku X (perkenalan)", atau explicit "namaku X".
function extractUserNameFromHistory(history) {
  // Scan only user messages, latest first
  const userMsgs = history.filter((m) => m.role === 'user');
  for (let i = userMsgs.length - 1; i >= 0; i--) {
    const text = (userMsgs[i].content || '').slice(0, 500);
    // Pattern: "nama saya X" / "namaku X" / "nama ku X"
    let m = text.match(/(?:nama\s+saya|namaku|nama\s+ku|kenalkan\s+nama\s+saya)\s+([A-Z][a-zA-ZÀ-ſ]{1,30}(?:\s+[A-Z][a-zA-ZÀ-ſ]{1,30})?)/);
    if (m) return m[1].trim();
    // Pattern: "panggil saya X"
    m = text.match(/panggil\s+saya\s+([A-Z][a-zA-ZÀ-ſ]{1,30})/);
    if (m) return m[1].trim();
    // Pattern: "saya X (kalau di awal kalimat, eksplisit perkenalan)"
    //   Only match kalau di awal, diikuti kata kerja/akhir kalimat
    m = text.match(/^\s*saya\s+([A-Z][a-zA-ZÀ-ſ]{2,30})(?:\s+[,.;]|\s+(?:marketing|content|sales|admin|HRD|finance|finance|legal))/i);
    if (m) return m[1].trim();
  }
  return null;
}
