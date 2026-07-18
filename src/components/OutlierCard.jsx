import { ExternalLink, TrendingUp, Flame, Award, Sparkles } from 'lucide-react';
import { formatNumber, formatDate, formatCompact } from '../lib/format.js';

// Kategori viral berdasarkan z-score sigma
function viralCategory(z) {
  if (z >= 5) return { label: 'Sangat Viral', color: 'text-purple-400 bg-purple-500/10', icon: Flame };
  if (z >= 3) return { label: 'Konten Viral', color: 'text-accent-warning bg-accent-warning/10', icon: Award };
  return { label: 'Performa Unggul', color: 'text-accent-success bg-accent-success/10', icon: Sparkles };
}

// Estimasi multiplier: z=2 → 4× median, z=3 → 9×, dst (sketsa)
function multiplierLabel(z) {
  const m = Math.max(1, Math.round(z * z));
  return `~${m}× lebih tinggi dari rata-rata`;
}

export default function OutlierCard({ outlier }) {
  const { post, z } = outlier;
  const cat = viralCategory(z);
  const CatIcon = cat.icon;
  return (
    <div className="surface p-4 flex flex-col gap-2 border-l-2 border-l-accent-warning">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`chip ${cat.color}`} title={`${z.toFixed(1)}σ · ${multiplierLabel(z)}`}>
            <CatIcon className="w-3 h-3" />
            {cat.label}
          </span>
          <span className="text-xs text-text-muted">
            {post.mediaType ?? 'POST'} · {formatDate(post.timestamp)}
          </span>
        </div>
        {post.postUrl && (
          <a href={post.postUrl} target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-accent-primary">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
      <p className="text-sm text-text-primary line-clamp-3">{post.caption || '(tanpa caption)'}</p>
      <div className="flex items-center gap-4 text-xs text-text-secondary pt-2 border-t border-border-subtle flex-wrap">
        {(post.likeCount ?? 0) > 0 && <span>❤️ {formatNumber(post.likeCount)}</span>}
        {(post.commentCount ?? 0) > 0 && <span>💬 {formatNumber(post.commentCount)}</span>}
        {(post.viewCount ?? 0) > 0 && <span>👁 {formatCompact(post.viewCount)}</span>}
        {(post.shareCount ?? 0) > 0 && <span>↗ {formatNumber(post.shareCount)}</span>}
        {(post.saveCount ?? 0) > 0 && <span>🔖 {formatNumber(post.saveCount)}</span>}
        {post.likeCount === 0 && post.viewCount === 0 && (
          <span className="text-text-muted italic">Metrik interaksi tidak tersedia</span>
        )}
      </div>
    </div>
  );
}
