// ProfileHeader — large profile section for a single account.
// Uses the real profile photo via the Worker /avatar proxy. If the URL is
// missing or fails, we render a colored brand-icon tile — never a letter.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, AlertTriangle } from 'lucide-react';
import { proxiedImage } from '../lib/imageProxy.js';
import { formatCompact, formatPercent } from '../lib/format.js';
import { PlatformIcon, platformLabel } from './icons/PlatformIcon.jsx';

function StatPill({ label, value, accent, hint }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-2.5 bg-bg-elevated border border-border-subtle rounded-xl" title={hint ?? undefined}>
      <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${accent ?? 'text-text-primary'}`}>{value}</span>
    </div>
  );
}

// Tentukan label pill dengan fallback "Tidak tersedia" untuk section yang butuh enrichment
function resolveValue(metric, availability, isIG, aggregates) {
  switch (metric) {
    case 'posts':
      return {
        value: formatCompact(aggregates.totalPostsAnalyzed ?? 0),
        accent: 'text-text-primary',
        hint: null
      };
    case 'views':
      return {
        value: formatCompact(aggregates.totalViewCount ?? 0),
        accent: 'text-text-primary',
        hint: null
      };
    case 'likes':
      if (isIG && !availability.likes) {
        return { value: 'Tidak tersedia', accent: 'text-text-muted', hint: availability.message };
      }
      return { value: formatCompact(aggregates.totalLikeCount ?? 0), accent: 'text-accent-danger', hint: null };
    case 'comments':
      if (isIG && !availability.comments) {
        return { value: 'Tidak tersedia', accent: 'text-text-muted', hint: availability.message };
      }
      return { value: formatCompact(aggregates.totalCommentCount ?? 0), accent: 'text-accent-primary', hint: null };
    case 'avgViews':
      return {
        value: formatCompact(Math.round(aggregates.avgViewCount ?? 0)),
        accent: 'text-text-primary',
        hint: null
      };
    case 'er':
      if (isIG && !availability.engagement) {
        return { value: 'Tidak tersedia', accent: 'text-text-muted', hint: availability.message };
      }
      return { value: formatPercent(aggregates.engagementRate ?? null), accent: 'text-accent-success', hint: null };
    default:
      return { value: '-', accent: 'text-text-muted', hint: null };
  }
}

export default function ProfileHeader({ account }) {
  const isIG = account.platform === 'instagram';
  const [avatarFailed, setAvatarFailed] = useState(false);
  const showImg = account.avatarUrl && !avatarFailed;
  const aggregates = account.aggregates ?? null;
  const availability = account.availability ?? {
    likes: true,
    comments: true,
    views: true,
    engagement: true,
    message: null
  };
  const postCount = aggregates?.totalPostsAnalyzed ?? account.postCount ?? account.posts?.length ?? 0;

  // 6 stat pill profesional bahasa Indonesia — sesuai plan C1
  const pills = aggregates
    ? [
        { key: 'posts', label: 'Total Video', ...resolveValue('posts', availability, isIG, aggregates) },
        { key: 'views', label: 'Total Tayangan', ...resolveValue('views', availability, isIG, aggregates) },
        { key: 'likes', label: 'Total Suka', ...resolveValue('likes', availability, isIG, aggregates) },
        { key: 'comments', label: 'Total Komentar', ...resolveValue('comments', availability, isIG, aggregates) },
        { key: 'avgViews', label: 'Rata-rata Tayangan', ...resolveValue('avgViews', availability, isIG, aggregates) },
        { key: 'er', label: 'Engagement Rate', ...resolveValue('er', availability, isIG, aggregates) }
      ]
    : [
        { key: 'followers', label: 'Pengikut', value: formatCompact(account.followerCount ?? 0), accent: 'text-text-primary' },
        { key: 'following', label: 'Mengikuti', value: formatCompact(account.followingCount ?? 0), accent: 'text-text-primary' },
        { key: 'posts', label: 'Jumlah Postingan', value: formatCompact(postCount), accent: 'text-text-primary' },
        { key: 'er', label: 'Engagement Rate', value: formatPercent(account.engagementRate ?? null), accent: 'text-accent-success' },
        { key: 'tiers', label: 'Tiers Viral+', value: account.tiers?.viral != null ? String(account.tiers.viral + (account.tiers.tinggi ?? 0)) : '-', accent: 'text-accent-warning' },
        { key: 'cadence', label: 'Skor Konsistensi', value: account.cadence?.score != null ? `${account.cadence.score}/100` : '-', accent: 'text-text-primary' }
      ];

  return (
    <section className="surface p-6">
      <Link to="/" className="text-xs text-text-muted hover:text-text-primary inline-flex items-center gap-1 mb-4">
        ← Kembali ke daftar akun
      </Link>
      <div className="flex items-start gap-5 flex-wrap">
        {showImg ? (
          <img
            src={proxiedImage(account.avatarUrl)}
            alt={account.username}
            onError={() => setAvatarFailed(true)}
            className="w-20 h-20 rounded-full object-cover bg-bg-tertiary flex-shrink-0"
          />
        ) : (
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center flex-shrink-0 ${
              isIG
                ? 'bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500'
                : 'bg-black'
            }`}
          >
            <PlatformIcon platform={account.platform} className="w-10 h-10 text-white" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-1.5">
              <PlatformIcon platform={account.platform} className="w-5 h-5" />
              @{account.username}
            </h1>
            {account.isVerified && (
              <span className="inline-flex items-center gap-1 chip bg-accent-primary/10 text-accent-primary text-[10px]">
                <BadgeCheck className="w-3 h-3" /> Terverifikasi
              </span>
            )}
            <span className={`chip ${isIG ? 'bg-accent-instagram/10 text-accent-instagram' : 'bg-accent-tiktok/10 text-accent-tiktok'}`}>
              {platformLabel(account.platform)}
            </span>
            {availability.message && (
              <span className="chip bg-accent-warning/10 text-accent-warning text-[10px]" title={availability.message}>
                <AlertTriangle className="w-3 h-3" /> Data Terbatas
              </span>
            )}
          </div>
          {account.displayName && <p className="text-sm text-text-secondary mb-2">{account.displayName}</p>}
          {account.bio && <p className="text-sm text-text-muted max-w-2xl">{account.bio}</p>}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {pills.map((p) => (
          <StatPill key={p.key} label={p.label} value={p.value} accent={p.accent} hint={p.hint} />
        ))}
      </div>
    </section>
  );
}
