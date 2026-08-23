// V21: /library — Global post library (filterable, sortable across all 9 accounts).
// Filter by account, platform, date range, media type. Search caption text.
// ST4: cards → table (sortable headers, tabular surface), useMemo → useEffect
// untuk URL sync (no side effect inside memo), 200-cap visibility dengan CTA
// "Saring Lebih Ketat", h1 + main landmark.
import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ExternalLink, Heart, MessageCircle, Eye, ArrowUpDown, ArrowUp, ArrowDown, Library as LibraryIcon } from 'lucide-react';
import { useAccounts } from '../hooks/useAccount.js';
import { ProxiedAvatar } from '../components/ProxiedAvatar.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { PlatformIcon } from '../components/icons/PlatformIcon.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { formatCompact } from '../lib/format.js';

const RESULT_CAP = 200;

export default function Library() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';
  const initialSort = searchParams.get('sortBy') ?? 'createTime';
  const initialDir = searchParams.get('dir') ?? 'desc';
  const accounts = useAccounts();
  const [search, setSearch] = useState(initialQ);
  const [platform, setPlatform] = useState('all');
  const [accountSlugs, setAccountSlugs] = useState([]);
  const [mediaType, setMediaType] = useState('all');
  const [sortBy, setSortBy] = useState(initialSort);
  const [sortDir, setSortDir] = useState(initialDir);

  // ST4: URL sync via useEffect (bukan useMemo side-effect yang eslint-silenced).
  // Sync sortBy + dir + q ke URL sehingga Hero KPI links (?sortBy=viewCount) work.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (sortBy === 'createTime') next.delete('sortBy');
    else next.set('sortBy', sortBy);
    if (sortDir === 'desc') next.delete('dir');
    else next.set('dir', sortDir);
    if (search.trim()) next.set('q', search.trim());
    else next.delete('q');
    setSearchParams(next, { replace: true });
    // searchParams + setSearchParams stable identity per React Router docs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortDir, search]);

  // Flatten all posts across all accounts
  const allPosts = useMemo(() => {
    const out = [];
    for (const a of accounts) {
      for (const p of a.posts ?? []) {
        out.push({
          ...p,
          _account: a,
          _accountSlug: a.slug,
          _accountUsername: a.username,
          _accountPlatform: a.platform,
          _accountAvatar: a.localAvatar || a.profilePicUrl
        });
      }
    }
    return out;
  }, [accounts]);

  // Match-count sebelum cap dipotong, untuk surface "200 teratas" warning
  const matchedCount = useMemo(() => {
    let result = allPosts;
    if (platform !== 'all') {
      result = result.filter((p) => p._accountPlatform === platform);
    }
    if (accountSlugs.length > 0) {
      result = result.filter((p) => accountSlugs.includes(p._accountSlug));
    }
    if (mediaType !== 'all') {
      result = result.filter((p) => (p.mediaType ?? 'IMAGE') === mediaType);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((p) => (p.caption ?? '').toLowerCase().includes(q));
    }
    return result.length;
  }, [allPosts, platform, accountSlugs, mediaType, search]);

  const filtered = useMemo(() => {
    let result = allPosts;
    if (platform !== 'all') {
      result = result.filter((p) => p._accountPlatform === platform);
    }
    if (accountSlugs.length > 0) {
      result = result.filter((p) => accountSlugs.includes(p._accountSlug));
    }
    if (mediaType !== 'all') {
      result = result.filter((p) => (p.mediaType ?? 'IMAGE') === mediaType);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((p) => (p.caption ?? '').toLowerCase().includes(q));
    }
    result = [...result].sort((a, b) => {
      const av = a[sortBy] ?? 0;
      const bv = b[sortBy] ?? 0;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return result.slice(0, RESULT_CAP);
  }, [allPosts, platform, accountSlugs, mediaType, search, sortBy, sortDir]);

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const refineFilter = () => {
    // Quick win: reset mediaType kalau banyak variasi — user bisa iterate
    setMediaType('all');
  };

  const SortHeader = ({ col, label, align = 'left' }) => {
    const active = sortBy === col;
    const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th
        scope="col"
        className={`px-3 py-2.5 font-medium text-text-muted uppercase text-[10px] tracking-wider cursor-pointer hover:text-text-primary select-none ${
          align === 'right' ? 'text-right' : 'text-left'
        }`}
        onClick={() => handleSort(col)}
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
          {label}
          <Icon className={`w-3 h-3 ${active ? 'text-accent-primary' : 'opacity-30'}`} />
        </span>
      </th>
    );
  };

  const MEDIA_TYPES = [
    { value: 'all', label: 'Semua Format' },
    { value: 'IMAGE', label: 'Foto' },
    { value: 'REEL', label: 'Reels' },
    { value: 'VIDEO', label: 'Video' },
    { value: 'CAROUSEL_ALBUM', label: 'Carousel' }
  ];

  const isCapped = matchedCount > RESULT_CAP;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <PageHeader
        icon={LibraryIcon}
        title="Library Post"
        subtitle={
          isCapped
            ? `Menampilkan ${RESULT_CAP} teratas dari ${matchedCount} post cocok · refine filter untuk lihat semua`
            : `${filtered.length} post dari total ${allPosts.length}`
        }
      />

      {/* Filters */}
      <div className="surface p-3 space-y-2">
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
            <input
              id="library-search"
              name="q"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari di caption…"
              aria-label="Search captions"
              autoComplete="off"
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-bg-tertiary border border-border-subtle rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary"
            />
          </div>
          <select id="library-platform" name="platform" value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Platform"
            className="text-sm bg-bg-tertiary border border-border-subtle rounded px-3 py-1.5 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary">
            <option value="all">Semua Platform</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
          </select>
          <select id="library-mediatype" name="mediaType" value={mediaType} onChange={(e) => setMediaType(e.target.value)} aria-label="Media type"
            className="text-sm bg-bg-tertiary border border-border-subtle rounded px-3 py-1.5 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary">
            {MEDIA_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        {/* Account chips */}
        <div className="flex flex-wrap gap-1.5">
          {accounts.map((a) => {
            const isSelected = accountSlugs.includes(a.slug);
            return (
              <button
                key={a.slug}
                onClick={() => setAccountSlugs((prev) => isSelected ? prev.filter((s) => s !== a.slug) : [...prev, a.slug])}
                aria-pressed={isSelected}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${
                  isSelected
                    ? 'bg-accent-primary/10 border-accent-primary/40 text-accent-primary'
                    : 'bg-bg-tertiary border-border-subtle text-text-secondary hover:border-border-default'
                }`}
              >
                <ProxiedAvatar account={a} size={16} />
                @{a.username}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cap warning + refine CTA */}
      {isCapped && (
        <div className="surface p-3 bg-accent-warning/5 border-accent-warning/30 flex items-center justify-between gap-3">
          <p className="text-xs text-text-secondary">
            <strong className="text-accent-warning">{matchedCount - RESULT_CAP} post lagi tersembunyi</strong> di balik batas {RESULT_CAP}. Saring untuk lihat semuanya.
          </p>
          <button
            onClick={refineFilter}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent-warning/10 text-accent-warning border border-accent-warning/30 hover:bg-accent-warning/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-warning"
          >
            Reset Format
          </button>
        </div>
      )}

      {/* Results — tabular surface */}
      {filtered.length === 0 ? (
        <div className="surface p-4">
          <EmptyState title="Tidak ada post" description="Coba ubah filter atau kata kunci." />
        </div>
      ) : (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle bg-bg-tertiary/40">
                  <SortHeader col="createTime" label="Tanggal" />
                  <th scope="col" className="px-3 py-2.5 font-medium text-text-muted uppercase text-[10px] tracking-wider text-left">Akun</th>
                  <th scope="col" className="px-3 py-2.5 font-medium text-text-muted uppercase text-[10px] tracking-wider text-left hidden md:table-cell">Caption</th>
                  <SortHeader col="likeCount" label="Suka" align="right" />
                  <SortHeader col="commentCount" label="Komen" align="right" />
                  <SortHeader col="viewCount" label="Tayangan" align="right" />
                  <th scope="col" className="px-3 py-2.5 font-medium text-text-muted uppercase text-[10px] tracking-wider text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  // createTime: ms if > 1e12, else unix seconds → multiply
                  const ts = p.createTime > 1e12 ? p.createTime : p.createTime * 1000;
                  return (
                    <tr
                      key={`${p._accountSlug}-${p.id}`}
                      className="border-b border-border-subtle/50 hover:bg-bg-tertiary/30 transition-colors"
                    >
                      <td className="px-3 py-2.5 text-xs text-text-muted whitespace-nowrap tabular-nums">
                        {new Date(ts).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <ProxiedAvatar account={p._account} size={20} />
                          <span className="text-xs font-medium text-text-primary">@{p._accountUsername}</span>
                          <PlatformIcon platform={p._accountPlatform} className="w-3 h-3 opacity-50" />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-text-secondary hidden md:table-cell">
                        <p className="line-clamp-1 max-w-[280px]" title={p.caption}>
                          {p.caption || '(tanpa caption)'}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className="inline-flex items-center gap-1 text-xs">
                          <Heart className="w-3 h-3 text-accent-danger opacity-70" />
                          <span className="text-text-primary">{formatCompact(p.likeCount ?? 0)}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className="inline-flex items-center gap-1 text-xs">
                          <MessageCircle className="w-3 h-3 text-accent-warning opacity-70" />
                          <span className="text-text-primary">{formatCompact(p.commentCount ?? 0)}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {p.viewCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs">
                            <Eye className="w-3 h-3 text-accent-primary opacity-70" />
                            <span className="text-text-primary">{formatCompact(p.viewCount)}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {p.postUrl ? (
                          <a
                            href={p.postUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Buka post @${p._accountUsername} di platform`}
                            className="inline-flex items-center gap-1 text-xs text-accent-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary rounded"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Buka
                          </a>
                        ) : (
                          <span className="text-xs text-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-[10px] text-text-muted border-t border-border-subtle/50 bg-bg-tertiary/20 flex justify-between">
            <span>Menampilkan {filtered.length} dari {matchedCount} cocok</span>
            {isCapped && <span>+{matchedCount - RESULT_CAP} lagi tersembunyi</span>}
          </div>
        </div>
      )}
    </div>
  );
}
