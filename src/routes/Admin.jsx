// /admin — Per-admin post tracking via hashtag markers.
//
// Maps each admin display name to a hashtag (#AgustusRE → Reni, etc.) and
// surfaces every post that carries that hashtag in a single unified table.
// Single source of truth for the mapping lives in src/lib/adminHashtags.js
// so scrapers, future exports, and other pages can reuse it.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Eye, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useAccounts } from '../hooks/useAccount.js';
import { ProxiedAvatar } from '../components/ProxiedAvatar.jsx';
import { PlatformIcon, platformLabel } from '../components/icons/PlatformIcon.jsx';
import { getAdminSummary } from '../lib/adminHashtags.js';
import { formatNumber, formatDate } from '../lib/format.js';

// Responsive column visibility — same pattern as EnhancedTable so mobile
// users keep the essential columns visible.
const COL_RESPONSIVE = {
  always: '',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell'
};

// Stable initials per admin for the summary card avatar.
function adminInitials(name) {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic accent pick based on admin index — keeps the four cards
// visually distinct without introducing a separate theme key.
const ADMIN_ACCENTS = [
  { ring: 'ring-accent-primary', text: 'text-accent-primary', chip: 'bg-accent-primary/10 text-accent-primary border-accent-primary/30' },
  { ring: 'ring-accent-success', text: 'text-accent-success', chip: 'bg-accent-success/10 text-accent-success border-accent-success/30' },
  { ring: 'ring-accent-warning', text: 'text-accent-warning', chip: 'bg-accent-warning/10 text-accent-warning border-accent-warning/30' },
  { ring: 'ring-accent-instagram', text: 'text-accent-instagram', chip: 'bg-accent-instagram/10 text-accent-instagram border-accent-instagram/30' }
];

const ADMIN_BY_NAME = new Map(ADMIN_HASHTAGS_PLACEHOLDER());

// Lazy lookup helper — fills the admin-name → accent map once at module load.
function ADMIN_HASHTAGS_PLACEHOLDER() {
  // Replaced below with the real import once we have the list. This is
  // pulled out to keep the accent definition order logically separate.
  return [];
}

function SortIcon({ active, dir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-accent-primary" /> : <ArrowDown className="w-3 h-3 text-accent-primary" />;
}

export default function Admin() {
  const accounts = useAccounts();

  const summary = useMemo(() => getAdminSummary(accounts), [accounts]);
  const totalAdminPosts = summary.reduce((s, a) => s + a.postCount, 0);
  const totalLikes = summary.reduce((s, a) => s + a.totalLikes, 0);
  const totalComments = summary.reduce((s, a) => s + a.totalComments, 0);
  const totalViews = summary.reduce((s, a) => s + a.totalViews, 0);

  // Build a flat row list across all admins with admin metadata attached.
  // Sort by createTime desc (newest first). Filter by selected admin when
  // a chip is active.
  const rows = useMemo(() => {
    const out = [];
    summary.forEach((admin, i) => {
      for (const p of admin.posts) {
        out.push({
          ...p,
          _admin: admin,
          _adminIndex: i,
          _key: `${admin.name}-${p._accountSlug}-${p.id}`
        });
      }
    });
    out.sort((a, b) => (b.createTime ?? 0) - (a.createTime ?? 0));
    return out;
  }, [summary]);

  const [adminFilter, setAdminFilter] = useState('all');
  const [sortKey, setSortKey] = useState('createTime');
  const [sortDir, setSortDir] = useState('desc');

  const filteredRows = useMemo(() => {
    let r = adminFilter === 'all' ? rows : rows.filter((row) => row._admin.name === adminFilter);
    r = [...r].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return r;
  }, [rows, adminFilter, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'createTime' ? 'desc' : 'desc');
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold tracking-widest uppercase text-text-muted">Section 09</span>
            <span className="text-text-muted">·</span>
            <span className="text-[10px] text-text-muted uppercase tracking-wider">Admin Tracker</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Admin</h1>
          <p className="text-sm text-text-muted mt-1">
            Postingan berdasarkan hashtag admin ·{' '}
            <span className="font-semibold text-text-primary tabular-nums">{totalAdminPosts}</span>{' '}
            total post dari {summary.filter((a) => a.postCount > 0).length} admin
          </p>
        </div>

        {/* Page-level KPI tiles */}
        <div className="grid grid-cols-3 gap-2 min-w-[280px]">
          <div className="surface px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Suka</div>
            <div className="text-lg font-bold text-text-primary tabular-nums">{formatNumber(totalLikes)}</div>
          </div>
          <div className="surface px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Komen</div>
            <div className="text-lg font-bold text-text-primary tabular-nums">{formatNumber(totalComments)}</div>
          </div>
          <div className="surface px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Views</div>
            <div className="text-lg font-bold text-text-primary tabular-nums">{formatNumber(totalViews)}</div>
          </div>
        </div>
      </div>

      {/* Admin cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {summary.map((admin, i) => {
          const accent = ADMIN_ACCENTS[i % ADMIN_ACCENTS.length];
          return (
            <div
              key={admin.name}
              className="surface p-4 hover:border-border-default transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-10 h-10 rounded-full ring-2 ${accent.ring} bg-bg-tertiary flex items-center justify-center text-sm font-bold ${accent.text}`}>
                    {adminInitials(admin.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-text-primary truncate">{admin.name}</div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border-subtle">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-text-muted">Post</div>
                  <div className="text-base font-bold text-text-primary tabular-nums">{admin.postCount}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-text-muted">Avg Suka</div>
                  <div className="text-base font-bold text-text-primary tabular-nums">
                    {admin.postCount > 0 ? formatNumber(Math.round(admin.totalLikes / admin.postCount)) : '—'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Unified admin post table */}
      <div className="surface overflow-hidden">
        <div className="flex items-center gap-2 p-3 border-b border-border-subtle flex-wrap">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">Filter Admin:</span>
          <button
            onClick={() => setAdminFilter('all')}
            className={`chip transition-colors ${adminFilter === 'all' ? 'bg-accent-primary text-white' : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'}`}
          >
            Semua
          </button>
          {summary.map((admin, i) => {
            const accent = ADMIN_ACCENTS[i % ADMIN_ACCENTS.length];
            const active = adminFilter === admin.name;
            return (
              <button
                key={admin.name}
                onClick={() => setAdminFilter(admin.name)}
                className={`chip transition-colors inline-flex items-center gap-1 ${active ? 'bg-accent-primary text-white' : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'}`}
              >
                {admin.name}
                <span className={`ml-1 px-1.5 text-[10px] font-semibold rounded-full ${active ? 'bg-white/20' : 'bg-bg-primary/40'}`}>
                  {admin.postCount}
                </span>
              </button>
            );
          })}
          <span className="ml-auto text-[10px] text-text-muted">{filteredRows.length} post</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-text-muted uppercase border-b border-border-subtle">
                <th className="py-3 px-4 text-left font-medium">Admin</th>
                <th className="py-3 px-4 text-left font-medium">Akun</th>
                <th className={`py-3 px-4 text-left font-medium ${COL_RESPONSIVE.md}`}>Platform</th>
                <th
                  className="py-3 px-4 text-left font-medium cursor-pointer select-none"
                  onClick={() => handleSort('createTime')}
                >
                  <span className="inline-flex items-center gap-1.5">
                    Tanggal
                    <SortIcon active={sortKey === 'createTime'} dir={sortDir} />
                  </span>
                </th>
                <th className={`py-3 px-4 text-left font-medium ${COL_RESPONSIVE.lg}`}>Caption</th>
                <th
                  className="py-3 px-4 text-right font-medium cursor-pointer select-none"
                  onClick={() => handleSort('likeCount')}
                >
                  <span className="inline-flex items-center gap-1.5">
                    Suka
                    <SortIcon active={sortKey === 'likeCount'} dir={sortDir} />
                  </span>
                </th>
                <th
                  className={`py-3 px-4 text-right font-medium cursor-pointer select-none ${COL_RESPONSIVE.md}`}
                  onClick={() => handleSort('commentCount')}
                >
                  <span className="inline-flex items-center gap-1.5">
                    Komen
                    <SortIcon active={sortKey === 'commentCount'} dir={sortDir} />
                  </span>
                </th>
                <th
                  className={`py-3 px-4 text-right font-medium cursor-pointer select-none ${COL_RESPONSIVE.md}`}
                  onClick={() => handleSort('viewCount')}
                >
                  <span className="inline-flex items-center gap-1.5">
                    Views
                    <SortIcon active={sortKey === 'viewCount'} dir={sortDir} />
                  </span>
                </th>
                <th className="py-3 px-4 text-right font-medium">Buka</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-sm text-text-muted">
                    Belum ada post dengan hashtag admin.
                  </td>
                </tr>
              ) : (
                filteredRows.map((p) => {
                  const accent = ADMIN_ACCENTS[p._adminIndex % ADMIN_ACCENTS.length];
                  return (
                    <tr
                      key={p._key}
                      className="border-b border-border-subtle/50 hover:bg-bg-tertiary/50"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-7 h-7 rounded-full ring-2 ${accent.ring} bg-bg-tertiary flex items-center justify-center text-[10px] font-bold ${accent.text} flex-shrink-0`}>
                            {adminInitials(p._admin.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-text-primary truncate">{p._admin.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 min-w-0">
                          <ProxiedAvatar account={p._account} size={28} className="flex-shrink-0" />
                          <Link
                            to={`/account/${p._accountSlug}`}
                            className="text-text-primary hover:text-accent-primary font-medium truncate"
                          >
                            @{p._accountUsername}
                          </Link>
                        </div>
                      </td>
                      <td className={`py-3 px-4 text-text-secondary ${COL_RESPONSIVE.md}`}>
                        <span className="inline-flex items-center gap-1">
                          <PlatformIcon platform={p._accountPlatform} className="w-3.5 h-3.5" />
                          <span className="hidden md:inline">{platformLabel(p._accountPlatform)}</span>
                          <span className="md:hidden">{p._accountPlatform === 'instagram' ? 'IG' : 'TT'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-text-secondary whitespace-nowrap tabular-nums">
                        {p.createTime ? formatDate(p.createTime > 1e12 ? p.createTime : p.createTime * 1000) : '—'}
                      </td>
                      <td className={`py-3 px-4 text-text-secondary max-w-xs ${COL_RESPONSIVE.lg}`}>
                        <p className="line-clamp-2 text-xs leading-relaxed">
                          {p.caption || '(tanpa caption)'}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Heart className="w-3 h-3 text-accent-danger" />
                          {formatNumber(p.likeCount ?? 0)}
                        </span>
                      </td>
                      <td className={`py-3 px-4 text-right tabular-nums ${COL_RESPONSIVE.md}`}>
                        <span className="inline-flex items-center gap-1">
                          <MessageCircle className="w-3 h-3 text-accent-warning" />
                          {formatNumber(p.commentCount ?? 0)}
                        </span>
                      </td>
                      <td className={`py-3 px-4 text-right tabular-nums ${COL_RESPONSIVE.md}`}>
                        {p.viewCount > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <Eye className="w-3 h-3 text-accent-primary" />
                            {formatNumber(p.viewCount)}
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {p.postUrl ? (
                          <a
                            href={p.postUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-accent-primary hover:underline text-xs"
                            aria-label={`Buka post ${p.id}`}
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span className="hidden md:inline">Buka</span>
                          </a>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
