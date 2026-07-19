// V21.1: Account Overview tab — profile header, top-5 posts, outliers, health score.
// First tab of /account/:slug.
import { Eye, Heart, MessageSquare, Sparkles, Award, TrendingUp, Activity, Target } from 'lucide-react';
import ProfileHeader from '../ProfileHeader.jsx';
import OutlierCard from '../OutlierCard.jsx';
import StatCard from '../StatCard.jsx';
import { SectionHeader } from '../ui/SectionHeader.jsx';
import { PlatformIcon } from '../icons/PlatformIcon.jsx';
import { formatNumber, formatPercent, formatCompact } from '../../lib/format.js';

const TIER_LABELS = {
  viral: { label: 'Sangat Viral', color: 'text-purple-400', desc: '> 3× rata-rata' },
  tinggi: { label: 'Performa Tinggi', color: 'text-accent-warning', desc: '1.5–3× rata-rata' },
  bagus: { label: 'Performa Bagus', color: 'text-accent-success', desc: '0.75–1.5× rata-rata' },
  rataRata: { label: 'Rata-rata', color: 'text-text-secondary', desc: '0.3–0.75× rata-rata' },
  rendah: { label: 'Rendah', color: 'text-text-muted', desc: '< 0.3× rata-rata' }
};

function HealthBar({ label, value }) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-text-muted">
        <span>{label}</span>
        <span className="font-semibold text-text-primary tabular-nums">{safeValue}</span>
      </div>
      <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden mt-0.5">
        <div
          className={`h-full ${
            safeValue >= 80 ? 'bg-emerald-500' :
            safeValue >= 60 ? 'bg-sky-500' :
            safeValue >= 40 ? 'bg-yellow-500' :
            'bg-rose-500'
          }`}
          style={{ width: `${Math.min(100, safeValue)}%` }}
        />
      </div>
    </div>
  );
}

function PostList({ posts, metric, icon: Icon, accent, emptyText }) {
  const items = (posts ?? []).filter((p) => (p[metric] ?? 0) > 0).slice(0, 5);
  if (items.length === 0) {
    return <div className="text-sm text-text-muted italic py-4 text-center">{emptyText ?? 'Belum ada post dengan metrik ini.'}</div>;
  }
  return (
    <ul className="text-sm space-y-2">
      {items.map((p, i) => (
        <li key={p.id ?? i} className="flex items-start gap-2 text-text-secondary">
          <span className="text-text-muted text-xs w-4 mt-0.5">{i + 1}.</span>
          {p.postUrl ? (
            <a href={p.postUrl} target="_blank" rel="noopener noreferrer" className="line-clamp-1 flex-1 hover:text-text-primary">
              {p.caption || '(tanpa caption)'}
            </a>
          ) : (
            <span className="line-clamp-1 flex-1">{p.caption || '(tanpa caption)'}</span>
          )}
          <span className={`text-xs tabular-nums flex items-center gap-1 ${accent}`}>
            {Icon && <Icon className="w-3 h-3" />}
            {formatCompact(p[metric])}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AccountOverview({ account, insights }) {
  const {
    aggregates, tiers, availability,
    topByViews, topByLikes, topByComments,
    outlierPosts, growthVelocity, healthScore, lastViral
  } = insights;

  return (
    <div className="space-y-6">
      <ProfileHeader
        account={{
          ...account,
          aggregates,
          availability,
          engagementRate: aggregates.engagementRate,
          tiers,
          cadence: insights.postingCadence
        }}
      />

      {availability.message && (
        <div className="surface p-4 border border-accent-warning/30 bg-accent-warning/5 flex items-start gap-3">
          <span className="text-xl" aria-hidden="true">⚠️</span>
          <div className="text-sm">
            <div className="font-semibold text-accent-warning mb-1">Data Terbatas Terdeteksi</div>
            <div className="text-text-secondary">{availability.message}</div>
            <div className="text-xs text-text-muted mt-1">Solusi: jalankan ulang <code className="bg-bg-tertiary px-1 rounded">pnpm scrape:ig:enrich</code> setelah 07:00 WIB untuk memperbarui data.</div>
          </div>
        </div>
      )}

      {/* Top 5 posts — Views, Likes, Comments */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="surface p-5">
          <SectionHeader icon={Eye} title="5 Post Teratas — Tayangan" subtitle="Post dengan jumlah tayangan tertinggi" />
          <PostList posts={topByViews} metric="viewCount" icon={Eye} accent="text-accent-primary" />
        </div>
        <div className="surface p-5">
          <SectionHeader icon={Heart} title="5 Post Teratas — Suka" subtitle={availability.likes ? 'Post dengan jumlah suka tertinggi' : 'Memerlukan enrichment /media/info'} />
          {availability.likes ? (
            <PostList posts={topByLikes} metric="likeCount" icon={Heart} accent="text-accent-danger" />
          ) : (
            <div className="text-sm text-text-muted italic py-4 text-center">Data like tidak tersedia untuk akun ini.</div>
          )}
        </div>
        <div className="surface p-5">
          <SectionHeader icon={MessageSquare} title="5 Post Teratas — Komentar" subtitle="Post dengan jumlah komentar tertinggi" />
          {availability.comments ? (
            <PostList posts={topByComments} metric="commentCount" icon={MessageSquare} accent="text-accent-warning" />
          ) : (
            <div className="text-sm text-text-muted italic py-4 text-center">Data komentar tidak tersedia untuk akun ini.</div>
          )}
        </div>
      </div>

      {/* Performance tier distribution */}
      <div className="surface p-5">
        <SectionHeader
          icon={Activity}
          title="Distribusi Tingkatan Performa"
          subtitle="Pengelompokan post berdasarkan rasio performa vs rata-rata akun"
        />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {Object.entries(TIER_LABELS).map(([k, meta]) => {
            const count = tiers[k] ?? 0;
            const total = Object.values(tiers).reduce((s, v) => s + v, 0);
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={k} className="bg-bg-tertiary rounded-lg p-3 text-center border border-border-subtle">
                <div className={`text-xs font-semibold uppercase tracking-wider ${meta.color}`}>{meta.label}</div>
                <div className="text-xs text-text-muted mt-0.5 mb-2">{meta.desc}</div>
                <div className={`text-2xl font-bold tabular-nums ${meta.color}`}>{count}</div>
                <div className="text-[10px] text-text-muted mt-1">{pct}% dari total</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Outlier posts */}
      {outlierPosts.length > 0 && (
        <div className="surface p-5">
          <SectionHeader
            icon={Sparkles}
            title="Post Outlier (Performa > 2σ)"
            subtitle={`${outlierPosts.length} post dengan performa jauh di atas rata-rata`}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {outlierPosts.slice(0, 6).map((o, i) => <OutlierCard key={i} outlier={o} />)}
          </div>
        </div>
      )}

      {/* Health score + Growth velocity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {healthScore && (
          <div className="surface p-5">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
              <Award className="w-4 h-4 text-accent-primary" />
              Account Health Score
              <PlatformIcon platform={account?.platform} className="w-3.5 h-3.5 ml-1" />
            </h3>
            <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
              <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl font-bold border-2 flex-shrink-0 ${
                (healthScore.score ?? 0) >= 80 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' :
                (healthScore.score ?? 0) >= 65 ? 'bg-sky-500/10 text-sky-500 border-sky-500/30' :
                (healthScore.score ?? 0) >= 50 ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' :
                (healthScore.score ?? 0) >= 35 ? 'bg-orange-500/10 text-orange-500 border-orange-500/30' :
                'bg-rose-500/10 text-rose-500 border-rose-500/30'
              }`}>
                {healthScore.grade ?? '—'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-2xl sm:text-3xl font-bold text-text-primary tabular-nums">{Number.isFinite(healthScore.score) ? healthScore.score : 0}<span className="text-base text-text-muted">/100</span></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-[11px]">
                  <HealthBar label="Engagement" value={healthScore.breakdown?.engagement ?? 0} />
                  <HealthBar label="Konsistensi" value={healthScore.breakdown?.consistency ?? 0} />
                  <HealthBar label="Pertumbuhan" value={healthScore.breakdown?.growth ?? 0} />
                  <HealthBar label="Diversitas" value={healthScore.breakdown?.diversity ?? 0} />
                </div>
              </div>
              {lastViral && (
                <div className="text-right">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider">Hari Sejak Viral Terakhir</div>
                  <div className="text-2xl font-bold text-text-primary tabular-nums">{lastViral.days ?? '—'}</div>
                  {lastViral.lastViralDate && (
                    <div className="text-[10px] text-text-muted">pada {lastViral.lastViralDate}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {growthVelocity.trend && growthVelocity.trend !== 'insufficient_data' && (
          <div className="grid grid-cols-1 gap-3 content-start">
            <StatCard
              label="Tren Pertumbuhan"
              value={growthVelocity.trend === 'up' ? '↑ Naik' : growthVelocity.trend === 'down' ? '↓ Turun' : '→ Stabil'}
              accent={growthVelocity.trend === 'up' ? 'text-accent-success' : growthVelocity.trend === 'down' ? 'text-accent-danger' : 'text-text-secondary'}
            />
            <StatCard label="Slope (per bulan)" value={growthVelocity.slope?.toFixed(3) ?? '0'} accent="text-text-primary" />
            <StatCard label="Proyeksi ER Bulan Depan" value={formatPercent(growthVelocity.forecast ?? 0, 3)} accent="text-accent-primary" />
          </div>
        )}
      </div>
    </div>
  );
}
