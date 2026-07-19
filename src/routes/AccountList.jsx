// V21: /account — Account list view (Strapi-inspired table).
// Filter by platform, sort, search. Each row clickable to detail page.
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowUpDown } from 'lucide-react';
import { useAccounts, useCrossAccountComparison } from '../hooks/useAccount.js';
import { ProxiedAvatar } from '../components/ProxiedAvatar.jsx';
import { PlatformIcon, platformLabel } from '../components/icons/PlatformIcon.jsx';
import { FreshnessBadge } from '../components/ui/FreshnessBadge.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { formatNumber, formatPercent } from '../lib/format.js';

const PLATFORM_FILTERS = [
  { value: 'all', label: 'Semua Platform' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' }
];

export default function AccountList() {
  const rawAccounts = useAccounts();
  const comparison = useCrossAccountComparison();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('all');
  const [sortKey, setSortKey] = useState('engagementRate');
  const [sortDir, setSortDir] = useState('desc');

  const enriched = useMemo(() => {
    return rawAccounts.map((a) => {
      const comp = comparison.find((c) => c.slug === a.slug) || {};
      return {
        ...a,
        engagementRate: comp.engagementRate ?? 0,
        avgLikes: comp.avgLikes ?? 0,
        avgViews: comp.avgViews ?? 0,
        avgComments: comp.avgComments ?? 0,
        lastPostAt: a.lastPostAt
      };
    });
  }, [rawAccounts, comparison]);

  const filtered = useMemo(() => {
    let result = enriched;
    if (platform !== 'all') {
      result = result.filter((a) => a.platform === platform);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) => a.username.toLowerCase().includes(q) || (a.displayName || '').toLowerCase().includes(q)
      );
    }
    result = [...result].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return result;
  }, [enriched, platform, search, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortHeader = ({ k, label, align = 'left', responsive = 'show' }) => {
    const cls = responsive === 'md' ? 'hidden md:table-cell' : responsive === 'lg' ? 'hidden lg:table-cell' : '';
    return (
      <th
        onClick={() => toggleSort(k)}
        className={`px-3 py-2 text-${align} font-medium text-text-muted uppercase text-[10px] tracking-wider cursor-pointer hover:text-text-primary select-none ${cls}`}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <ArrowUpDown className={`w-3 h-3 ${sortKey === k ? 'text-accent-primary' : 'opacity-30'}`} />
        </span>
      </th>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Daftar Akun</h1>
        <p className="text-sm text-text-muted mt-0.5">{rawAccounts.length} akun · 4 Instagram + 5 TikTok</p>
      </div>

      {/* Filters */}
      <div className="surface p-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
          <input
            id="accounts-search"
            name="q"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari username atau nama…"
            aria-label="Search accounts"
            autoComplete="off"
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-bg-tertiary border border-border-subtle rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary"
          />
        </div>
        <select
          id="accounts-platform"
          name="platform"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          aria-label="Platform filter"
          autoComplete="off"
          className="text-sm bg-bg-tertiary border border-border-subtle rounded px-3 py-1.5 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
        >
          {PLATFORM_FILTERS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="surface p-4">
          <EmptyState
            title="Tidak ada akun"
            description="Coba ubah filter atau kata kunci pencarian."
          />
        </div>
      ) : (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="px-3 py-2 text-left font-medium text-text-muted uppercase text-[10px] tracking-wider">Akun</th>
                  <th className="px-3 py-2 text-left font-medium text-text-muted uppercase text-[10px] tracking-wider hidden md:table-cell">Platform</th>
                  <SortHeader k="followerCount" label="Followers" align="right" />
                  <SortHeader k="posts.length" label="Posts" align="right" responsive="md" />
                  <SortHeader k="engagementRate" label="ER" align="right" />
                  <SortHeader k="avgLikes" label="Avg Likes" align="right" responsive="md" />
                  <SortHeader k="avgViews" label="Avg Views" align="right" responsive="lg" />
                  <th className="px-3 py-2 text-left font-medium text-text-muted uppercase text-[10px] tracking-wider">Data</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr
                    key={a.slug}
                    onClick={() => navigate(`/account/${a.slug}`)}
                    className="border-b border-border-subtle/50 hover:bg-bg-tertiary/40 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ProxiedAvatar account={a} size={32} className="flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="font-semibold text-text-primary truncate">@{a.username}</div>
                          {a.displayName && a.displayName !== a.username && (
                            <div className="text-xs text-text-muted truncate">{a.displayName}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                        <PlatformIcon platform={a.platform} className="w-3.5 h-3.5" />
                        {platformLabel(a.platform)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">
                      {formatNumber(a.followerCount)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary hidden md:table-cell">
                      {formatNumber(a.posts?.length ?? 0)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-accent-primary">
                      {formatPercent(a.engagementRate)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary hidden md:table-cell">
                      {formatNumber(a.avgLikes)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary hidden lg:table-cell">
                      {formatNumber(a.avgViews)}
                    </td>
                    <td className="px-3 py-2.5">
                      <FreshnessBadge lastPostAt={a.lastPostAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
