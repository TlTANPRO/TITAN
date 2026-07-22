// V32.2: AccountMetadata — bento grid of 8 metadata cards surfacing
// every metric the dataStore tracks. Uses the V32.1 availability matrix
// (account.availability) to honestly display "Tidak tersedia" for
// low-coverage metrics instead of fake zeros.
import { Users, UserPlus, Hash, Heart, Eye, MessageSquare, Share2, Bookmark } from 'lucide-react';
import { formatCompact } from '../lib/format.js';

const FIELDS = [
  { key: 'followers', label: 'Pengikut', icon: Users, source: (a) => a.followerCount ?? 0 },
  { key: 'following', label: 'Mengikuti', icon: UserPlus, source: (a, agg) => agg?.following?.value ?? a.followingCount ?? 0 },
  { key: 'posts', label: 'Total Postingan', icon: Hash, source: (a, agg) => agg?.totalPostsAnalyzed ?? a.postCount ?? a.posts?.length ?? 0 },
  { key: 'likes', label: 'Total Suka', icon: Heart, source: (a, agg) => agg?.totalLikeCount ?? 0 },
  { key: 'views', label: 'Total Tayangan', icon: Eye, source: (a, agg) => agg?.totalViewCount ?? 0 },
  { key: 'comments', label: 'Total Komentar', icon: MessageSquare, source: (a, agg) => agg?.totalCommentCount ?? 0 },
  { key: 'shares', label: 'Total Bagikan', icon: Share2, source: (a, agg) => agg?.totalShareCount ?? 0 },
  { key: 'saves', label: 'Total Simpan', icon: Bookmark, source: (a, agg) => agg?.totalSaveCount ?? 0 }
];

export default function AccountMetadata({ account, aggregates }) {
  const av = account?.availability ?? {};
  return (
    <section aria-label="Akun & Metadata" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Akun &amp; Metadata
        </h3>
        <span className="text-[10px] text-text-muted">Cakupan per metrik dihitung dari {account?.posts?.length ?? 0} post</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {FIELDS.map(({ key, label, icon: Icon, source }, index) => {
          const value = source(account, aggregates);
          const cov = av[key]?.coverage;
          const hasData = key === 'following'
            ? (av.following?.hasData ?? value > 0)
            : (cov === undefined ? value > 0 : cov > 0);
          const delayMs = index * 50;
          return (
            <div
              key={key}
              className="surface-2 border border-border-default rounded-xl p-3 flex flex-col gap-1.5 motion-safe:animate-sunburst-in transition-all duration-base ease-out hover:-translate-y-0.5 hover:border-border-strong min-w-0 overflow-hidden"
              style={{ animationDelay: `${delayMs}ms` }}
            >
              <div className="flex items-center gap-1.5 text-text-muted text-[10px] uppercase tracking-wider font-medium min-w-0">
                <Icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} aria-hidden="true" />
                <span className="truncate">{label}</span>
              </div>
              <div className="text-base sm:text-lg font-semibold tabular-nums text-text-primary truncate">
                {hasData ? formatCompact(value) : 'Tidak tersedia'}
              </div>
              {cov !== undefined && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 bg-bg-hover rounded-full overflow-hidden" aria-hidden="true">
                    <div
                      className="h-full bg-accent-primary transition-all duration-slow ease-out"
                      style={{ width: `${Math.round(cov * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-text-muted tabular-nums">
                    {Math.round(cov * 100)}%
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
