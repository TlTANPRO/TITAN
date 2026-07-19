// V21: /library — Global post library (filterable, sortable across all 9 accounts).
// Filter by account, platform, date range, media type. Search caption text.
import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Filter as FilterIcon, ExternalLink, Heart, MessageCircle, Eye } from 'lucide-react';
import { useAccounts } from '../hooks/useAccount.js';
import { ProxiedAvatar } from '../components/ProxiedAvatar.jsx';
import { PlatformIcon, platformLabel } from '../components/icons/PlatformIcon.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { formatNumber, formatCompact } from '../lib/format.js';

export default function Library() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';
  const initialSort = searchParams.get('sortBy') ?? 'createTime';
  const accounts = useAccounts();
  const [search, setSearch] = useState(initialQ);
  const [platform, setPlatform] = useState('all');
  const [accountSlugs, setAccountSlugs] = useState([]);
  const [mediaType, setMediaType] = useState('all');
  const [sortBy, setSortBy] = useState(initialSort);

  // Sync sort → URL (so Hero KPI links like ?sortBy=viewCount take effect)
  useMemo(() => {
    const next = new URLSearchParams(searchParams);
    if (sortBy === 'createTime') next.delete('sortBy');
    else next.set('sortBy', sortBy);
    if (search.trim()) next.set('q', search.trim());
    else next.delete('q');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, search]);

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
      return bv - av;
    });
    return result.slice(0, 200);
  }, [allPosts, platform, accountSlugs, mediaType, search, sortBy]);

  const MEDIA_TYPES = [
    { value: 'all', label: 'Semua Format' },
    { value: 'IMAGE', label: 'Foto' },
    { value: 'REEL', label: 'Reels' },
    { value: 'VIDEO', label: 'Video' },
    { value: 'CAROUSEL_ALBUM', label: 'Carousel' }
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Library Post</h1>
        <p className="text-sm text-text-muted mt-0.5">
          {filtered.length} post dari total {allPosts.length} · tampil 200 teratas
        </p>
      </div>

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
          <select id="library-sort" name="sortBy" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort"
            className="text-sm bg-bg-tertiary border border-border-subtle rounded px-3 py-1.5 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary">
            <option value="createTime">Terbaru</option>
            <option value="likeCount">Likes Terbanyak</option>
            <option value="viewCount">Views Terbanyak</option>
            <option value="commentCount">Komentar Terbanyak</option>
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
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
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

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="surface p-4">
          <EmptyState title="Tidak ada post" description="Coba ubah filter atau kata kunci." />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <div key={`${p._accountSlug}-${p.id}`} className="surface p-3 hover:border-border-default transition-colors">
              <div className="flex items-start gap-3">
                <ProxiedAvatar account={p._account} size={36} className="flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs text-text-muted mb-1">
                    <span className="font-semibold text-text-secondary">@{p._accountUsername}</span>
                    <PlatformIcon platform={p._accountPlatform} className="w-3 h-3" />
                    <span>·</span>
                    <span>{new Date((p.createTime > 1e12 ? p.createTime : p.createTime * 1000)).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    <span>·</span>
                    <span className="text-text-muted">{p.mediaType ?? 'IMAGE'}</span>
                  </div>
                  <p className="text-sm text-text-primary line-clamp-2 leading-relaxed mb-2">
                    {p.caption || '(tanpa caption)'}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Heart className="w-3 h-3 text-accent-danger" />
                      {formatCompact(p.likeCount ?? 0)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="w-3 h-3 text-accent-warning" />
                      {formatCompact(p.commentCount ?? 0)}
                    </span>
                    {p.viewCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Eye className="w-3 h-3 text-accent-primary" />
                        {formatCompact(p.viewCount)}
                      </span>
                    )}
                    {p.postUrl && (
                      <a href={p.postUrl} target="_blank" rel="noopener noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-accent-primary hover:underline">
                        <ExternalLink className="w-3 h-3" />
                        Buka
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
