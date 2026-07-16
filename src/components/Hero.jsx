// Hero — aggregate KPI strip + top viral post across all 9 accounts
import { Link } from 'react-router-dom';
import { TrendingUp, Users, Eye, Heart, Sparkles } from 'lucide-react';
import { formatNumber } from '../lib/format.js';
import { useMemo } from 'react';

function relativeTime(unixSec) {
  const diff = Date.now() / 1000 - unixSec;
  if (diff < 60) return 'baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)}m lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}j lalu`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}h lalu`;
  return `${Math.floor(diff / 604800)}mgu lalu`;
}

export function Hero({ accounts, allPosts }) {
  const kpi = useMemo(() => {
    let totalFollowers = 0;
    let totalPosts = 0;
    let totalLikes = 0;
    let totalViews = 0;
    for (const acc of accounts) {
      totalFollowers += acc.followerCount ?? 0;
      const posts = acc.posts ?? [];
      totalPosts += posts.length;
      for (const p of posts) {
        totalLikes += p.likeCount ?? 0;
        totalViews += p.viewCount ?? 0;
      }
    }
    return { totalFollowers, totalPosts, totalLikes, totalViews };
  }, [accounts]);

  const topViral = useMemo(() => {
    const sorted = [...allPosts].filter((p) => p.viewCount > 0).sort((a, b) => b.viewCount - a.viewCount);
    return sorted[0] ?? null;
  }, [allPosts]);

  const latestScrape = useMemo(() => {
    const times = accounts
      .map((a) => a.stats?.lastAndroidFeedEnrichAt ?? a.stats?.lastGraphEnrichAt ?? null)
      .filter(Boolean)
      .map((s) => new Date(s).getTime());
    if (times.length === 0) return null;
    return new Date(Math.max(...times));
  }, [accounts]);

  return (
    <section className="surface p-6 bg-gradient-to-br from-bg-secondary to-bg-tertiary">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <KpiItem icon={<Users className="w-4 h-4" />} label="Total Pengikut" value={formatNumber(kpi.totalFollowers)} color="text-accent-primary" />
        <KpiItem icon={<Sparkles className="w-4 h-4" />} label="Total Postingan" value={formatNumber(kpi.totalPosts)} color="text-accent-secondary" />
        <KpiItem icon={<Heart className="w-4 h-4" />} label="Total Suka" value={formatNumber(kpi.totalLikes)} color="text-pink-500" />
        <KpiItem icon={<Eye className="w-4 h-4" />} label="Total Tayangan" value={formatNumber(kpi.totalViews)} color="text-cyan-500" />
      </div>

      {topViral && (
        <Link
          to={topViral._accountPlatform === 'tiktok' ? `/account/${topViral._accountSlug}` : `/account/${topViral._accountSlug}`}
          className="block surface p-4 hover:border-accent-primary transition-colors"
        >
          <div className="flex items-center gap-2 text-xs text-text-muted mb-2">
            <TrendingUp className="w-3.5 h-3.5 text-accent-success" />
            <span className="font-semibold uppercase tracking-wider">Top Viral Post</span>
            <span>·</span>
            <span>@{topViral._accountUsername} · {relativeTime(topViral.createTime)}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-text-primary line-clamp-2">{topViral.caption || '(tanpa caption)'}</div>
              <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
                <span><Eye className="w-3 h-3 inline" /> {formatNumber(topViral.viewCount)}</span>
                <span><Heart className="w-3 h-3 inline" /> {formatNumber(topViral.likeCount)}</span>
              </div>
            </div>
          </div>
        </Link>
      )}

      {latestScrape && (
        <div className="text-[10px] text-text-muted mt-3 text-right">
          Data terakhir diupdate: {latestScrape.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
        </div>
      )}
    </section>
  );
}

function KpiItem({ icon, label, value, color }) {
  return (
    <div>
      <div className={`flex items-center gap-1.5 text-xs ${color} font-medium`}>
        {icon}
        <span className="uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold text-text-primary tabular-nums mt-1">{value}</div>
    </div>
  );
}
