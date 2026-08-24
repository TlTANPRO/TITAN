// V21: /compare — Cross-account comparison view.
// Pick 2-4 accounts, view unified metrics side-by-side with sparkline trends.
// ST3: mobile cards (<sm collapse), colorblind-safe max highlight (text
// "Terbaik" + ring border, bukan color-only), MAX_COMPARE tooltip, h1 + main landmark.
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Info, GitCompareArrows } from 'lucide-react';
import { useAccounts, useCrossAccountComparison } from '../hooks/useAccount.js';
import { ProxiedAvatar } from '../components/ProxiedAvatar.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { PulseBar } from '../components/ui/PulseBar.jsx';
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
      <PageHeader
        icon={GitCompareArrows}
        title="Bandingkan Akun"
        subtitle="Pilih 2-4 akun untuk dibandingkan side-by-side"
      />

      <PulseBar />

      {/* Picker */}
      <div className="surface p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wider">
            Pilih Akun ({selectedSlugs.length}/{MAX_COMPARE})
          </div>
          <div className="group relative">
            <Info className="w-3 h-3 text-text-muted cursor-help" aria-label="Info batas pilih akun" />
            <div className="invisible group-hover:visible absolute left-0 top-full mt-1 z-10 px-2 py-1 rounded bg-bg-overlay text-[10px] text-text-primary whitespace-nowrap shadow-md border border-border-subtle">
              Maksimal {MAX_COMPARE} akun agar tabel tetap mudah dibaca di layar sempit.
            </div>
          </div>
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
                aria-pressed={isSelected}
                aria-label={isSelected ? `Hapus @${a.username} dari perbandingan` : `Tambah @${a.username} ke perbandingan`}
                className={`
                  flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium
                  border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary
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

      {/* Compare table (desktop ≥sm) */}
      {selected.length < 2 ? (
        <div className="surface p-4">
          <EmptyState
            title="Pilih minimal 2 akun"
            description="Klik akun di atas untuk mulai membandingkan metrik."
          />
        </div>
      ) : (
        <>
          {/* Desktop table — hidden on mobile */}
          <div className="surface overflow-hidden hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th className="px-3 py-3 text-left font-medium text-text-muted uppercase text-[10px] tracking-wider w-24 sm:w-32">
                      Metric
                    </th>
                    {selected.map((a) => (
                      <th key={a.slug} className="px-3 py-3 text-left font-medium border-l border-border-subtle/50 min-w-[140px]">
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
                        <td className="px-3 py-2.5 text-xs text-text-muted font-medium whitespace-nowrap">{m.label}</td>
                        {selected.map((a) => {
                          const v = a[m.key] ?? 0;
                          const isMax = v === max && v > 0;
                          return (
                            <td
                              key={a.slug}
                              className={`px-3 py-2.5 tabular-nums border-l border-border-subtle/50 whitespace-nowrap ${
                                m.highlight ? 'text-accent-primary font-bold' : 'text-text-primary'
                              } ${isMax ? 'bg-accent-success/5 ring-1 ring-accent-success/30 rounded' : ''}`}
                            >
                              <span className="inline-flex items-center gap-1.5">
                                {m.format(v)}
                                {isMax && (
                                  <span className="text-[10px] font-semibold text-accent-success uppercase tracking-wide" aria-label={`Nilai terbaik untuk ${m.label}`}>
                                    Terbaik
                                  </span>
                                )}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-1.5 text-[10px] text-text-muted sm:hidden border-t border-border-subtle/50 bg-bg-tertiary/30">
              ← Geser untuk melihat kolom lainnya →
            </div>
          </div>

          {/* Mobile cards — visible only <sm */}
          <div className="space-y-3 sm:hidden">
            {METRIC_ROWS.map((m) => {
              const vals = selected.map((a) => a[m.key] ?? 0);
              const max = Math.max(...vals);
              return (
                <div key={m.key} className="surface p-3">
                  <div className={`text-xs uppercase tracking-wider font-semibold mb-2 ${
                    m.highlight ? 'text-accent-primary' : 'text-text-muted'
                  }`}>
                    {m.label}
                  </div>
                  <div className="space-y-1.5">
                    {selected.map((a) => {
                      const v = a[m.key] ?? 0;
                      const isMax = v === max && v > 0;
                      return (
                        <div
                          key={a.slug}
                          className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded ${
                            isMax ? 'bg-accent-success/10 ring-1 ring-accent-success/30' : 'bg-bg-tertiary/30'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <ProxiedAvatar account={a} size={20} />
                            <span className="text-xs text-text-primary truncate">@{a.username}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className={`tabular-nums text-sm font-semibold ${
                              m.highlight ? 'text-accent-primary' : 'text-text-primary'
                            }`}>
                              {m.format(v)}
                            </span>
                            {isMax && (
                              <span className="text-[9px] font-bold text-accent-success uppercase tracking-wide">
                                Terbaik
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
