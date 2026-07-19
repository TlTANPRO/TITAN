// V21: /compare — Cross-account comparison view.
// Pick 2-4 accounts, view unified metrics side-by-side with sparkline trends.
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { useAccounts, useCrossAccountComparison } from '../hooks/useAccount.js';
import { ProxiedAvatar } from '../components/ProxiedAvatar.jsx';
import { PlatformIcon } from '../components/icons/PlatformIcon.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { formatNumber, formatPercent } from '../lib/format.js';

const MAX_COMPARE = 4;

export default function Compare() {
  const rawAccounts = useAccounts();
  const comparison = useCrossAccountComparison();
  const navigate = useNavigate();
  const [selectedSlugs, setSelectedSlugs] = useState(() => {
    return rawAccounts.slice(0, 2).map((a) => a.slug);
  });

  const selected = useMemo(() => {
    return selectedSlugs
      .map((slug) => {
        const acc = rawAccounts.find((a) => a.slug === slug);
        const comp = comparison.find((c) => c.slug === slug);
        return acc && comp ? { ...acc, ...comp } : null;
      })
      .filter(Boolean);
  }, [selectedSlugs, rawAccounts, comparison]);

  const toggle = (slug) => {
    setSelectedSlugs((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= MAX_COMPARE) return prev; // cap
      return [...prev, slug];
    });
  };

  const METRIC_ROWS = [
    { key: 'engagementRate', label: 'Engagement Rate', format: formatPercent, highlight: true },
    { key: 'avgLikes', label: 'Avg Likes', format: formatNumber },
    { key: 'avgViews', label: 'Avg Views', format: formatNumber },
    { key: 'avgComments', label: 'Avg Comments', format: formatNumber },
    { key: 'postsPerWeek', label: 'Posts / Minggu', format: (n) => n?.toFixed(1) ?? '0' },
    { key: 'followerCount', label: 'Followers', format: formatNumber },
    { key: 'postCount', label: 'Total Posts', format: formatNumber }
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Bandingkan Akun</h1>
        <p className="text-sm text-text-muted mt-0.5">Pilih 2-4 akun untuk dibandingkan side-by-side</p>
      </div>

      {/* Picker */}
      <div className="surface p-3">
        <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
          Pilih Akun ({selectedSlugs.length}/{MAX_COMPARE})
        </div>
        <div className="flex flex-wrap gap-2">
          {rawAccounts.map((a) => {
            const isSelected = selectedSlugs.includes(a.slug);
            const disabled = !isSelected && selectedSlugs.length >= MAX_COMPARE;
            return (
              <button
                key={a.slug}
                onClick={() => toggle(a.slug)}
                disabled={disabled}
                className={`
                  flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium
                  border transition-colors
                  ${isSelected
                    ? 'bg-accent-primary/10 border-accent-primary/40 text-accent-primary'
                    : 'bg-bg-tertiary border-border-subtle text-text-secondary hover:border-border-default'
                  }
                  ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <ProxiedAvatar account={a} size={20} />
                <span>@{a.username}</span>
                <PlatformIcon platform={a.platform} className="w-3 h-3 opacity-50" />
                {isSelected && <Check className="w-3 h-3" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Compare table */}
      {selected.length < 2 ? (
        <div className="surface p-4">
          <EmptyState
            title="Pilih minimal 2 akun"
            description="Klik akun di atas untuk mulai membandingkan metrik."
          />
        </div>
      ) : (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="px-3 py-3 text-left font-medium text-text-muted uppercase text-[10px] tracking-wider w-32">
                    Metric
                  </th>
                  {selected.map((a) => (
                    <th key={a.slug} className="px-3 py-3 text-left font-medium border-l border-border-subtle/50">
                      <button
                        onClick={() => navigate(`/account/${a.slug}`)}
                        className="flex items-center gap-2 group"
                      >
                        <ProxiedAvatar account={a} size={28} />
                        <div className="min-w-0">
                          <div className="font-semibold text-text-primary group-hover:text-accent-primary truncate">
                            @{a.username}
                          </div>
                          <div className="text-[10px] text-text-muted">
                            {formatNumber(a.followerCount)} followers
                          </div>
                        </div>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRIC_ROWS.map((m) => {
                  const vals = selected.map((a) => a[m.key] ?? 0);
                  const max = Math.max(...vals);
                  return (
                    <tr key={m.key} className="border-b border-border-subtle/50">
                      <td className="px-3 py-2.5 text-xs text-text-muted font-medium">{m.label}</td>
                      {selected.map((a) => {
                        const v = a[m.key] ?? 0;
                        const isMax = v === max && v > 0;
                        return (
                          <td
                            key={a.slug}
                            className={`px-3 py-2.5 tabular-nums border-l border-border-subtle/50 ${
                              m.highlight ? 'text-accent-primary font-bold' : 'text-text-primary'
                            } ${isMax ? 'bg-accent-success/5' : ''}`}
                          >
                            {m.format(v)}
                            {isMax && <span className="ml-1 text-[10px] text-accent-success">★</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
