// ViralRecipe — top-3 outliers + pattern + timing + hashtag + AI insight
import { Link } from 'react-router-dom';
import { Sparkles, Clock, Hash, MessageCircle, Heart, Eye, Bot } from 'lucide-react';
import { formatNumber } from '../lib/format.js';
import { getInsight } from '../lib/insights.js';

const DAY_LABELS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function shortCaption(caption, max = 100) {
  if (!caption) return '(tanpa caption)';
  if (caption.length <= max) return caption;
  return caption.slice(0, max) + '…';
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
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center text-white font-bold text-xs">
                #{i + 1}
              </div>
              <div className="flex-1 min-w-0">
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="surface p-3 bg-bg-tertiary/50">
          <div className="flex items-center gap-2 text-xs font-semibold text-text-primary uppercase tracking-wider mb-2">
            <Clock className="w-3.5 h-3.5 text-accent-primary" />
            Waktu Posting Terbaik
          </div>
          <div className="text-sm text-text-secondary">
            Hari <span className="font-bold text-text-primary">{timing?.topDay ?? '—'}</span> sekitar jam{' '}
            <span className="font-bold text-text-primary">{timing?.topHour ?? 0}:00</span>
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

      {/* AI insight panel (pre-generated, lazy-loaded) */}
      {aiText && (
        <div className="surface p-3 mt-4 border border-accent-primary/30 bg-accent-primary/5">
          <div className="flex items-center gap-2 text-xs font-semibold text-accent-primary uppercase tracking-wider mb-2">
            <Bot className="w-3.5 h-3.5" />
            Analisis AI — Mengapa Post Ini Viral
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
      <div className="text-base font-bold text-text-primary mt-0.5">{value}</div>
    </div>
  );
}
