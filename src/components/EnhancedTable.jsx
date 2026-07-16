// EnhancedTable — sortable columns + platform filter chips + platform badge
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { formatNumber, formatPercent } from '../lib/format.js';
import { PlatformIcon, platformLabel } from './icons/PlatformIcon.jsx';

const PLATFORM_FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' }
];

// V11: tambah Avg Comments & Avg Shares agar data di tabel match data aktual.
const COLUMNS = [
  { key: 'username', label: 'Akun', align: 'left', sortable: true },
  { key: 'platform', label: 'Platform', align: 'left', sortable: true },
  { key: 'followerCount', label: 'Pengikut', align: 'right', sortable: true },
  { key: 'postCount', label: 'Post', align: 'right', sortable: true },
  { key: 'avgLikes', label: 'Avg Suka', align: 'right', sortable: true },
  { key: 'avgComments', label: 'Avg Komen', align: 'right', sortable: true },
  { key: 'avgViews', label: 'Avg Tayangan', align: 'right', sortable: true },
  { key: 'engagementRate', label: 'ER', align: 'right', sortable: true },
  { key: 'healthScore', label: 'Health', align: 'right', sortable: true }
];

function SortIcon({ active, dir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-accent-primary" /> : <ArrowDown className="w-3 h-3 text-accent-primary" />;
}

export function EnhancedTable({ comparison }) {
  const [sortKey, setSortKey] = useState('engagementRate');
  const [sortDir, setSortDir] = useState('desc');
  const [platform, setPlatform] = useState('all');

  const filtered = useMemo(() => {
    if (platform === 'all') return comparison;
    return comparison.filter((a) => a.platform === platform);
  }, [comparison, platform]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // nulls last
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  return (
    <div className="surface overflow-hidden">
      <div className="flex items-center gap-2 p-3 border-b border-border-subtle flex-wrap">
        <span className="text-[10px] text-text-muted uppercase tracking-wider">Filter:</span>
        {PLATFORM_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setPlatform(f.key)}
            className={`chip transition-colors flex items-center gap-1 ${platform === f.key ? 'bg-accent-primary text-white' : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'}`}
          >
            {f.key !== 'all' && <PlatformIcon platform={f.key} className="w-3 h-3" />}
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-text-muted">{sorted.length} akun</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-text-muted uppercase border-b border-border-subtle">
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={`py-3 px-4 font-medium cursor-pointer select-none ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                  onClick={() => c.sortable && handleSort(c.key)}
                >
                  <span className={`inline-flex items-center gap-1.5 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}>
                    {c.label}
                    {c.sortable && <SortIcon active={sortKey === c.key} dir={sortDir} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((a, i) => (
              <tr key={a.slug} className="border-b border-border-subtle/50 hover:bg-bg-tertiary/50">
                <td className="py-3 px-4 text-text-muted tabular-nums">{i + 1}</td>
                <td className="py-3 px-4">
                  <Link to={`/account/${a.slug}`} className="text-text-primary hover:text-accent-primary font-medium">@{a.username}</Link>
                </td>
                <td className="py-3 px-4 text-text-secondary">
                  <span className="inline-flex items-center gap-1">
                    <PlatformIcon platform={a.platform} className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">{platformLabel(a.platform)}</span>
                    <span className="md:hidden">{a.platform === 'instagram' ? 'IG' : 'TT'}</span>
                  </span>
                </td>
                <td className="py-3 px-4 text-right tabular-nums">{formatNumber(a.followerCount)}</td>
                <td className="py-3 px-4 text-right tabular-nums">{a.postCount}</td>
                <td className="py-3 px-4 text-right tabular-nums">{formatNumber(a.avgLikes)}</td>
                <td className="py-3 px-4 text-right tabular-nums">{formatNumber(a.avgComments)}</td>
                <td className="py-3 px-4 text-right tabular-nums">{formatNumber(a.avgViews)}</td>
                <td className="py-3 px-4 text-right tabular-nums font-semibold">
                  {a.hasER ? <span className="text-accent-success">{formatPercent(a.engagementRate)}</span> : <span className="text-text-muted" title="Data like/komentar tidak tersedia">—</span>}
                </td>
                <td className="py-3 px-4 text-right tabular-nums">
                  <span className={`text-xs font-semibold ${
                    a.healthScore >= 80 ? 'text-emerald-500' :
                    a.healthScore >= 65 ? 'text-sky-500' :
                    a.healthScore >= 50 ? 'text-yellow-500' :
                    a.healthScore >= 35 ? 'text-orange-500' : 'text-rose-500'
                  }`}>
                    {Number.isFinite(a.healthScore) ? a.healthScore : 0}
                    <span className="text-text-muted font-normal ml-1">({a.healthGrade ?? '—'})</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
