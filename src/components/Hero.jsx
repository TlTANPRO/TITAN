// Hero — V22.1: aggregate KPI strip only. Top Viral Post moved to its own
// dedicated "Top 5 Viral (7 Hari)" row 2 in Home to avoid duplication.
// V33: token-based icon swatches, delta-vs-7d footer per tile. No raw
// Tailwind colors (was text-pink-500 / text-cyan-500).
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

  // Delta vs 7 days ago. For each metric, sum last-7d value / prior-7d value
  // as a percentage change. Posts is a 7d count, likes/views aggregate last
  // 7 days of activity.
  const delta = useMemo(() => {
    const nowSec = Date.now() / 1000;
    const d7 = 7 * 86400;
    const lastCut = nowSec - d7;
    const prevCut = nowSec - 2 * d7;
    let postsLast = 0, postsPrev = 0;
    let likesLast = 0, likesPrev = 0;
    let viewsLast = 0, viewsPrev = 0;
    for (const acc of accounts) {
      for (const p of acc.posts ?? []) {
        const ct = p.createTime ?? 0;
        if (!ct) continue;
        if (ct >= lastCut) {
          postsLast += 1;
          likesLast += p.likeCount ?? 0;
          viewsLast += p.viewCount ?? 0;
        } else if (ct >= prevCut) {
          postsPrev += 1;
          likesPrev += p.likeCount ?? 0;
          viewsPrev += p.viewCount ?? 0;
        }
      }
    }
    const pct = (last, prev) => {
      if (prev <= 0) return last > 0 ? 100 : 0;
      return ((last - prev) / prev) * 100;
    };
    return {
      posts: pct(postsLast, postsPrev),
      likes: pct(likesLast, likesPrev),
      views: pct(viewsLast, viewsPrev)
    };
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
        <KpiItem icon={<Users className="w-4 h-4" />} label="Total Pengikut" value={formatNumber(kpi.totalFollowers)} accent="primary" href="/account?sort=followerCount" />
        <KpiItem icon={<Sparkles className="w-4 h-4" />} label="Total Postingan" value={formatNumber(kpi.totalPosts)} accent="secondary" delta={delta.posts} href="/library" />
        <KpiItem icon={<Heart className="w-4 h-4" />} label="Total Suka" value={formatNumber(kpi.totalLikes)} accent="danger" delta={delta.likes} href="/library?sortBy=likeCount" />
        <KpiItem icon={<Eye className="w-4 h-4" />} label="Total Tayangan" value={formatNumber(kpi.totalViews)} accent="instagram" delta={delta.views} href="/library?sortBy=viewCount" />
      </div>

      {latestScrape && (
        <div className="text-[10px] text-text-muted mt-4 pt-3 border-t border-border-subtle/50 text-right">
          Data terakhir diupdate: {latestScrape.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
        </div>
      )}
    </section>
  );
}

// Icon swatch background tinted to the accent. V33 token migration:
// replaces raw text-pink-500 / text-cyan-500 with semantic accent tokens.
const ACCENT_SWATCH = {
  primary:   { text: 'text-accent-primary',   swatch: 'bg-accent-primary/10' },
  secondary: { text: 'text-accent-secondary', swatch: 'bg-accent-secondary/10' },
  success:   { text: 'text-accent-success',   swatch: 'bg-accent-success/10' },
  warning:   { text: 'text-accent-warning',   swatch: 'bg-accent-warning/10' },
  danger:    { text: 'text-accent-danger',    swatch: 'bg-accent-danger/10' },
  instagram: { text: 'text-accent-instagram', swatch: 'bg-accent-instagram/10' },
  tiktok:    { text: 'text-accent-tiktok',    swatch: 'bg-accent-tiktok/10' }
};

function KpiItem({ icon, label, value, accent = 'primary', href, delta }) {
  const tone = ACCENT_SWATCH[accent] ?? ACCENT_SWATCH.primary;
  const content = (
    <>
      <div className={`inline-flex items-center justify-center w-9 h-9 rounded-md ${tone.swatch} ${tone.text} mb-2`}>
        {icon}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-text-muted font-medium">{label}</div>
      <div className="text-display-lg text-text-primary tabular-nums mt-0.5">{value}</div>
      {typeof delta === 'number' && (
        <div className={`text-[10px] mt-1.5 tabular-nums font-medium inline-flex items-center gap-1 ${delta >= 0 ? 'text-accent-success' : 'text-accent-danger'}`}>
          <span aria-hidden="true">{delta >= 0 ? '↑' : '↓'}</span>
          <span>{Math.abs(delta).toFixed(1)}%</span>
          <span className="text-text-muted font-normal">vs 7d</span>
        </div>
      )}
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        className="block hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary rounded"
        aria-label={`Lihat detail ${label}`}
      >
        {content}
      </a>
    );
  }
  return <div>{content}</div>;
}
