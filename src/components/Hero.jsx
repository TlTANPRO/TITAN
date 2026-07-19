// Hero — V22.1: aggregate KPI strip only. Top Viral Post moved to its own
// dedicated "Top 5 Viral (7 Hari)" row 2 in Home to avoid duplication.
import { useMemo } from 'react';
import { Users, Eye, Heart, Sparkles } from 'lucide-react';
import { formatNumber } from '../lib/format.js';

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiItem icon={<Users className="w-4 h-4" />} label="Total Pengikut" value={formatNumber(kpi.totalFollowers)} color="text-accent-primary" href="/account?sort=followerCount" />
        <KpiItem icon={<Sparkles className="w-4 h-4" />} label="Total Postingan" value={formatNumber(kpi.totalPosts)} color="text-accent-secondary" href="/library" />
        <KpiItem icon={<Heart className="w-4 h-4" />} label="Total Suka" value={formatNumber(kpi.totalLikes)} color="text-pink-500" href="/library?sortBy=likeCount" />
        <KpiItem icon={<Eye className="w-4 h-4" />} label="Total Tayangan" value={formatNumber(kpi.totalViews)} color="text-cyan-500" href="/library?sortBy=viewCount" />
      </div>

      {latestScrape && (
        <div className="text-[10px] text-text-muted mt-4 pt-3 border-t border-border-subtle/50 text-right">
          Data terakhir diupdate: {latestScrape.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
        </div>
      )}
    </section>
  );
}

function KpiItem({ icon, label, value, color, href }) {
  const content = (
    <>
      <div className={`flex items-center gap-1.5 text-xs ${color} font-medium`}>
        {icon}
        <span className="uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-display-lg text-text-primary tabular-nums mt-1">{value}</div>
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        className="block hover:opacity-70 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary rounded"
        aria-label={`Lihat detail ${label}`}
      >
        {content}
      </a>
    );
  }
  return <div>{content}</div>;
}
