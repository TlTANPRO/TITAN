// ViralRecipe — top-3 outliers + pattern + timing + hashtag + pre-generated insight
// V11: 10+ reasons panel (caption, emoji, question, format, prime-time, niche
// hashtag, mention, recency, consistency, hook, CTA, top pillar). AI label
// dropped — section is now an analytics explainer, not "AI analysis".
// V25.7: removed Bot icon (AI symbol), font-bold → font-semibold.
import { Link } from 'react-router-dom';
import { Sparkles, Clock, Hash, MessageCircle, Heart, Eye, CheckCircle2, Lightbulb, Zap, Repeat, Tag, Calendar, TrendingUp } from 'lucide-react';
import { formatNumber } from '../lib/format.js';
import { getInsight } from '../lib/insights.js';
import { PlatformIcon, platformLabel } from './icons/PlatformIcon.jsx';

const DAY_LABELS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function shortCaption(caption, max = 100) {
  if (!caption) return '(tanpa caption)';
  if (caption.length <= max) return caption;
  return caption.slice(0, max) + '…';
}

// V11: derive 10+ evidence-backed reasons from the recipe + outliers.
function buildViralReasons(recipe, outliers, account) {
  const reasons = [];
  const pattern = recipe?.pattern ?? {};
  const timing = recipe?.timing ?? {};
  const hashtags = recipe?.hashtags ?? [];
  const mediaMix = recipe?.mediaMix ?? {};
  const total = (outliers ?? []).length;
  const median = Number(pattern.medianLength ?? 0);
  const avgEmoji = Number(pattern.avgEmojiCount ?? 0);
  const qRate = Number(pattern.questionRate ?? 0);
  const ctaRate = Number(pattern.ctaRate ?? 0);
  const dominant = mediaMix?.dominant;
  const topHour = Number(timing?.topHour ?? 0);
  const topDay = timing?.topDay;
  const postCount = account?.postCount ?? 0;
  const recentOutliers = (outliers ?? []).filter((p) => p.daysAgo <= 30).length;
  const er = account?.engagementRate ?? account?.aggregates?.engagementRate ?? 0;

  if (median > 0) {
    reasons.push({
      icon: Tag,
      label: 'Panjang caption optimal',
      detail: `Median caption ${median} karakter — cukup untuk hook + value, tidak terlalu panjang untuk drop-off.`
    });
  }
  if (avgEmoji > 0) {
    reasons.push({
      icon: Sparkles,
      label: `${avgEmoji} emoji per post`,
      detail: 'Caption pakai emoji cukup banyak — menangkap eyeball di feed, meningkatkan CTR.'
    });
  }
  if (qRate > 0) {
    reasons.push({
      icon: MessageCircle,
      label: `${qRate}% caption berisi pertanyaan`,
      detail: 'Pertanyaan memicu komentar dan DM — sinyal kuat untuk algoritma IG/TT 2026.'
    });
  }
  if (ctaRate > 0) {
    reasons.push({
      icon: Zap,
      label: `${ctaRate}% punya call-to-action`,
      detail: 'CTA eksplisit (save, share, komen) melipatgandakan interaksi dibanding caption pasif.'
    });
  }
  if (dominant) {
    reasons.push({
      icon: Hash,
      label: `Format ${dominant} dominan`,
      detail: `${dominant} mendominasi komposisi — format yang terbukti paling kuat di akun ini.`
    });
  }
  if (Number.isFinite(topHour) && topHour > 0) {
    reasons.push({
      icon: Clock,
      label: `Posting di jam ${topHour}:00 WIB`,
      detail: `Prime time ${topHour}:00${topDay ? ` pada ${topDay}` : ''} — audiens paling aktif, distribusi organik lebih luas.`
    });
  }
  if (hashtags.length > 0) {
    reasons.push({
      icon: Hash,
      label: 'Hashtag niche konsisten',
      detail: `Tag konsisten di ≥2 post viral: ${hashtags.slice(0, 3).join(', ')} — bantu algoritma kategorikan niche.`
    });
  }
  if (recentOutliers > 0 && total > 0) {
    reasons.push({
      icon: Calendar,
      label: `${recentOutliers}/${total} outlier dalam 30 hari terakhir`,
      detail: 'Momentum masih panas — formula ini masih bekerja, double-down untuk 2-4 minggu ke depan.'
    });
  }
  if (postCount >= 50) {
    reasons.push({
      icon: Repeat,
      label: 'Konsistensi posting tinggi',
      detail: `${postCount} post dianalisis — sample cukup besar, pola outlier bisa diandalkan, bukan kebetulan.`
    });
  }
  if ((er ?? 0) > 3) {
    reasons.push({
      icon: TrendingUp,
      label: 'ER di atas benchmark industri',
      detail: `ER ${er.toFixed(2)}% di atas standar 3% (IG) / 5.5% (TT) — kualitas audiens tinggi, distribusi organik sehat.`
    });
  }
  if (total >= 5) {
    reasons.push({
      icon: CheckCircle2,
      label: 'Outlier terdistribusi di banyak post',
      detail: `${total} post berkinerja > 2σ — bukan 1-2 post kebetulan, ada formula yang bisa di-replikasi.`
    });
  }
  if (account?.platform === 'tiktok' && total > 0) {
    reasons.push({
      icon: TrendingUp,
      label: 'Algoritma TikTok-friendly',
      detail: 'Post viral di TikTok muncul di FYP tanpa following — replay, share, dan watch time jadi sinyal utama.'
    });
  }
  if (account?.platform === 'instagram' && dominant === 'REEL') {
    reasons.push({
      icon: TrendingUp,
      label: 'IG Reel = reach 2-3× lebih besar',
      detail: 'IG 2026 memberi distribusi organik 2-3× lebih besar ke Reel vs foto — format terbukti outperform.'
    });
  }

  return reasons.slice(0, 12);
}

export function ViralRecipe({ insights, account }) {
  const recipe = insights?.viralRecipe;
  const outliers = insights?.outlierPosts ?? [];
  const slug = account?.slug ?? account?.account?.slug;
  const aiText = slug ? getInsight(slug, 'viralRecipe') : null;
  if (!recipe || !recipe.examples || recipe.examples.length === 0) {
    return (
      <div className="surface p-5">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent-warning" />
          Resep Post Viral
        </h3>
        <p className="text-sm text-text-muted">Belum ada post outlier yang terdeteksi (perlu minimal 5 post dengan view data).</p>
      </div>
    );
  }

  // Caption pattern summary
  const { pattern, timing, hashtags, mediaMix, examples } = recipe;
  const reasons = buildViralReasons(recipe, outliers, account);

  return (
    <div className="surface p-5">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-accent-warning" />
        Resep Post Viral (Top 10% Performa)
      </h3>
      <p className="text-xs text-text-muted mb-4">
        Analisis pola dari {examples.length} post dengan performa terbaik. Gunakan sebagai blueprint untuk konten berikutnya.
      </p>

      {/* Top 3 example posts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        {examples.map((p, i) => (
          <Link
            key={p.id ?? i}
            to="#"
            className="surface p-3 hover:border-accent-primary transition-colors block"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-warning to-accent-secondary flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                #{i + 1}
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                <PlatformIcon platform={account?.platform} className="w-3 h-3 flex-shrink-0" />
                <div className="text-xs text-text-muted line-clamp-1">{shortCaption(p.caption, 60)}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-text-muted tabular-nums">
              <span><Eye className="w-3 h-3 inline" /> {formatNumber(p.viewCount ?? 0)}</span>
              <span><Heart className="w-3 h-3 inline" /> {formatNumber(p.likeCount ?? 0)}</span>
              <span><MessageCircle className="w-3 h-3 inline" /> {formatNumber(p.commentCount ?? 0)}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Pattern grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="Median Panjang Caption" value={`${pattern.medianLength} karakter`} />
        <Stat label="Rata-rata Emoji" value={`${pattern.avgEmojiCount} per post`} />
        <Stat label="Post dengan Pertanyaan" value={`${pattern.questionRate}%`} />
        <Stat label="Format Dominan" value={mediaMix?.dominant ?? '—'} />
      </div>

      {/* Timing + Hashtags */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="surface p-3 bg-bg-tertiary/50">
          <div className="flex items-center gap-2 text-xs font-semibold text-text-primary uppercase tracking-wider mb-2">
            <Clock className="w-3.5 h-3.5 text-accent-primary" />
            Waktu Posting Terbaik
          </div>
          <div className="text-sm text-text-secondary">
            Hari <span className="font-semibold text-text-primary">{timing?.topDay ?? '—'}</span> sekitar jam{' '}
            <span className="font-semibold text-text-primary">{timing?.topHour ?? 0}:00</span>
          </div>
          <div className="text-[10px] text-text-muted mt-1">
            Berdasarkan distribusi {examples.length} post viral
          </div>
        </div>
        <div className="surface p-3 bg-bg-tertiary/50">
          <div className="flex items-center gap-2 text-xs font-semibold text-text-primary uppercase tracking-wider mb-2">
            <Hash className="w-3.5 h-3.5 text-accent-primary" />
            Hashtag yang Muncul di ≥2 Post Viral
          </div>
          {hashtags && hashtags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {hashtags.map((tag, i) => (
                <span key={i} className="chip bg-accent-primary/10 text-accent-primary text-[10px]">#{tag}</span>
              ))}
            </div>
          ) : (
            <div className="text-xs text-text-muted">Tidak ada hashtag yang konsisten di post viral</div>
          )}
        </div>
      </div>

      {/* V11: 10+ reasons panel */}
      {reasons.length > 0 && (
        <div className="surface p-4 bg-bg-tertiary/30 border border-accent-warning/20">
          <div className="flex items-center gap-2 text-xs font-semibold text-accent-warning uppercase tracking-wider mb-3">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {reasons.length} Alasan Post Ini Viral — Bukti dari Data
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {reasons.map((r, i) => {
              const Icon = r.icon;
              return (
                <li key={i} className="flex items-start gap-2 leading-relaxed">
                  <Icon className="w-3.5 h-3.5 text-accent-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-semibold text-text-primary">{r.label}.</span>{' '}
                    <span className="text-text-secondary">{r.detail}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Pre-generated insight (analytics-only fallback when insight text unavailable) */}
      {aiText && (
        <div className="surface p-3 mt-4 border border-accent-primary/30 bg-accent-primary/5">
          <div className="flex items-center gap-2 text-xs font-semibold text-accent-primary uppercase tracking-wider mb-2">
            <Lightbulb className="w-3.5 h-3.5" />
            {platformLabel(account?.platform)} Insight — Mengapa Post Ini Viral
          </div>
          <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">{aiText}</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="surface p-2 bg-bg-tertiary/30">
      <div className="text-[10px] text-text-muted uppercase tracking-wider">{label}</div>
      <div className="text-base font-semibold text-text-primary mt-0.5">{value}</div>
    </div>
  );
}
