// WeeklyBriefing — 1-paragraph AI summary of last 7 days cross-account
// Falls back to pure analytics digest when no AI insight is cached.
import { Sparkles, Bot } from 'lucide-react';
import { useMemo } from 'react';
import { formatNumber, formatPercent } from '../lib/format.js';
import { getWeeklyBriefing } from '../lib/insights.js';

function generateDigest(accounts) {
  const now = Date.now() / 1000;
  const weekAgo = now - 7 * 86400;
  const lastWeek = [];
  for (const acc of accounts) {
    for (const p of acc.posts ?? []) {
      if (p.createTime >= weekAgo) {
        lastWeek.push({ ...p, _platform: acc.platform, _username: acc.username });
      }
    }
  }
  if (lastWeek.length === 0) return null;
  lastWeek.sort((a, b) => b.viewCount - a.viewCount);
  const topViral = lastWeek[0];
  const totalPosts = lastWeek.length;
  const totalViews = lastWeek.reduce((s, p) => s + (p.viewCount ?? 0), 0);
  const totalLikes = lastWeek.reduce((s, p) => s + (p.likeCount ?? 0), 0);
  const igCount = lastWeek.filter((p) => p._platform === 'instagram').length;
  const ttCount = lastWeek.filter((p) => p._platform === 'tiktok').length;

  return {
    totalPosts,
    totalViews,
    totalLikes,
    topViral,
    igCount,
    ttCount
  };
}

export function WeeklyBriefing({ accounts }) {
  const digest = useMemo(() => generateDigest(accounts), [accounts]);
  const aiText = getWeeklyBriefing();
  const hasAi = Boolean(aiText);

  if (!digest && !hasAi) {
    return (
      <div className="surface p-6 text-center text-text-muted text-sm">
        Belum ada aktivitas 7 hari terakhir.
      </div>
    );
  }

  return (
    <div className="surface p-5 bg-gradient-to-br from-accent-primary/5 to-accent-secondary/5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent-primary" />
          Ringkasan Mingguan
        </h3>
        <span className="text-[10px] text-text-muted uppercase tracking-wider">7 hari terakhir</span>
      </div>
      {hasAi ? (
        <div>
          <div className="text-sm text-text-primary leading-relaxed whitespace-pre-line">{aiText}</div>
          <div className="text-[10px] text-text-muted mt-3 flex items-center gap-1">
            <Bot className="w-3 h-3 text-accent-primary" />
            AI-generated · pre-cached di ai-insights.json
          </div>
        </div>
      ) : (
        digest && (
          <div>
            <div className="text-sm text-text-primary leading-relaxed">
              9 akun mempublikasikan <span className="font-semibold text-accent-primary">{digest.totalPosts} postingan</span> dalam 7 hari terakhir
              ({digest.igCount} Instagram, {digest.ttCount} TikTok),
              meraup <span className="font-semibold text-accent-primary">{formatNumber(digest.totalViews)} tayangan</span> dan{' '}
              <span className="font-semibold text-accent-primary">{formatNumber(digest.totalLikes)} suka</span>.
              {digest.topViral && (
                <>
                  {' '}Post viral tertinggi datang dari <span className="font-semibold">@{digest.topViral._username}</span> dengan{' '}
                  <span className="font-semibold text-accent-success">{formatNumber(digest.topViral.viewCount)} tayangan</span>.
                </>
              )}
            </div>
            <div className="text-[10px] text-text-muted mt-3 italic">
              Ringkasan otomatis. Run `pnpm insights:generate` untuk AI generatif.
            </div>
          </div>
        )
      )}
    </div>
  );
}
