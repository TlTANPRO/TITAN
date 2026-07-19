// PostExplorer — full posts list dengan filter mediaType, time range, sort, dan search.
//
// Filter chips: media type (All/Reel/Image/Carousel/Video) + time range
// Sort: Newest / Most viewed / Most liked / Highest ER
// Search: caption/hashtag substring → highlight matching posts
//
// Renders client-side only (post set kecil, <1000 per account, useMemo cukup).
import { useMemo, useState } from 'react';
import { Filter, Search, ArrowUpDown, X } from 'lucide-react';
import { formatNumber, formatPercent, formatCompact } from '../lib/format.js';

const MEDIA_FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: 'REEL', label: 'Reels' },
  { key: 'IMAGE', label: 'Foto' },
  { key: 'CAROUSEL_ALBUM', label: 'Carousel' },
  { key: 'VIDEO', label: 'Video' }
];

const RANGE_FILTERS = [
  { key: 'all', label: 'Semua waktu', days: null },
  { key: '30d', label: '30 hari', days: 30 },
  { key: '90d', label: '90 hari', days: 90 },
  { key: '6mo', label: '6 bulan', days: 180 },
  { key: '1y', label: '1 tahun', days: 365 }
];

const SORT_OPTIONS = [
  { key: 'newest', label: 'Terbaru' },
  { key: 'views', label: 'Tayangan' },
  { key: 'likes', label: 'Suka' },
  { key: 'er', label: 'ER Tertinggi' }
];

function highlightMatch(text, query) {
  if (!text || !query) return text || '';
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-accent-warning/40 text-text-primary rounded px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function postER(p, followerCount) {
  if (followerCount <= 0) return 0;
  const likes = p.likeCount ?? 0;
  const comments = p.commentCount ?? 0;
  return ((likes + comments) / followerCount) * 100;
}

export function PostExplorer({ posts = [], followerCount = 0 }) {
  const [mediaType, setMediaType] = useState('all');
  const [range, setRange] = useState('all');
  const [sortKey, setSortKey] = useState('newest');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const now = Date.now() / 1000;
    const rangeDays = RANGE_FILTERS.find((r) => r.key === range)?.days;
    const cutoff = rangeDays ? now - rangeDays * 86400 : 0;
    const q = query.trim().toLowerCase();
    let list = posts.filter((p) => {
      if (mediaType !== 'all' && p.mediaType !== mediaType) return false;
      if (cutoff > 0 && (p.createTime ?? 0) < cutoff) return false;
      if (q) {
        const caption = (p.caption ?? '').toLowerCase();
        const tags = (p.hashtags ?? []).join(' ').toLowerCase();
        if (!caption.includes(q) && !tags.includes(q)) return false;
      }
      return true;
    });
    if (sortKey === 'newest') list = [...list].sort((a, b) => (b.createTime ?? 0) - (a.createTime ?? 0));
    else if (sortKey === 'views') list = [...list].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
    else if (sortKey === 'likes') list = [...list].sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));
    else if (sortKey === 'er') {
      list = [...list].sort((a, b) => postER(b, followerCount) - postER(a, followerCount));
    }
    return list;
  }, [posts, mediaType, range, sortKey, query, followerCount]);

  const hasFilters = mediaType !== 'all' || range !== 'all' || sortKey !== 'newest' || query.length > 0;

  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Filter className="w-4 h-4 text-accent-primary" />
          Daftar Lengkap Post
        </h3>
        <span className="text-[11px] text-text-muted tabular-nums">
          {filtered.length} dari {posts.length} post
        </span>
      </div>

      {/* Filter row 1: media type chips */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <span className="text-[10px] text-text-muted uppercase tracking-wider mr-1">Media:</span>
        {MEDIA_FILTERS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMediaType(m.key)}
            className={`chip text-[10px] cursor-pointer transition-colors ${
              mediaType === m.key
                ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/40'
                : 'bg-bg-tertiary text-text-muted border-border-subtle hover:text-text-primary'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Filter row 2: time range + sort + search */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="bg-bg-tertiary text-text-primary text-xs rounded-md px-2 py-1.5 border border-border-subtle focus:outline-none focus:border-accent-primary"
          aria-label="Rentang waktu"
        >
          {RANGE_FILTERS.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 text-text-muted text-[10px] uppercase tracking-wider">
          <ArrowUpDown className="w-3 h-3" />
          Sort:
        </div>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value)}
          className="bg-bg-tertiary text-text-primary text-xs rounded-md px-2 py-1.5 border border-border-subtle focus:outline-none focus:border-accent-primary"
          aria-label="Urutkan"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <div className="flex-1 min-w-[180px] relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari caption atau hashtag…"
            className="w-full bg-bg-tertiary text-text-primary text-xs rounded-md pl-7 pr-7 py-1.5 border border-border-subtle focus:outline-none focus:border-accent-primary placeholder:text-text-muted"
            aria-label="Cari post"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-0.5"
              aria-label="Bersihkan pencarian"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {hasFilters && (
          <button
            onClick={() => { setMediaType('all'); setRange('all'); setSortKey('newest'); setQuery(''); }}
            className="text-[10px] text-text-muted hover:text-text-primary underline"
          >
            Reset
          </button>
        )}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="text-sm text-text-muted italic py-6 text-center">
          Tidak ada post yang cocok dengan filter. Coba reset atau ubah kriteria.
        </div>
      ) : (
        <ul className="space-y-1.5 max-h-[600px] overflow-y-auto">
          {filtered.slice(0, 200).map((p) => {
            const er = postER(p, followerCount);
            const date = p.createTime > 0 ? new Date(p.createTime * 1000).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';
            return (
              <li
                key={p.id}
                className="text-xs py-2 px-2 rounded hover:bg-bg-tertiary/40 transition-colors"
              >
                {/* Mobile: card layout — date + media + metrics stacked */}
                <div className="flex sm:hidden flex-col gap-1">
                  <div className="flex items-center gap-2 text-text-muted tabular-nums">
                    <span className="text-[10px]">{date}</span>
                    <span className="text-[10px] uppercase tracking-wider">{p.mediaType ?? '—'}</span>
                  </div>
                  {p.postUrl ? (
                    <a
                      href={p.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="line-clamp-2 text-text-secondary hover:text-text-primary"
                    >
                      {highlightMatch(p.caption || '(tanpa caption)', query)}
                    </a>
                  ) : (
                    <span className="line-clamp-2 text-text-secondary">
                      {highlightMatch(p.caption || '(tanpa caption)', query)}
                    </span>
                  )}
                  <div className="flex items-center gap-3 text-[11px] tabular-nums text-text-muted">
                    <span title="Tayangan">👁 {formatCompact(p.viewCount ?? 0)}</span>
                    <span title="Suka">♥ {formatCompact(p.likeCount ?? 0)}</span>
                    {followerCount > 0 && <span className="text-accent-primary" title="ER">{formatPercent(er, 1)}</span>}
                  </div>
                </div>

                {/* Desktop: single row layout */}
                <div className="hidden sm:flex items-start gap-2">
                  <span className="text-text-muted w-20 flex-shrink-0 tabular-nums">{date}</span>
                  <span className="text-text-muted w-12 flex-shrink-0 text-[10px] uppercase tracking-wider">{p.mediaType ?? '—'}</span>
                  {p.postUrl ? (
                    <a
                      href={p.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-0 line-clamp-1 text-text-secondary hover:text-text-primary"
                    >
                      {highlightMatch(p.caption || '(tanpa caption)', query)}
                    </a>
                  ) : (
                    <span className="flex-1 min-w-0 line-clamp-1 text-text-secondary">
                      {highlightMatch(p.caption || '(tanpa caption)', query)}
                    </span>
                  )}
                  <span className="text-text-muted tabular-nums w-14 text-right flex-shrink-0" title="Tayangan">
                    {formatCompact(p.viewCount ?? 0)}
                  </span>
                  <span className="text-text-secondary tabular-nums w-14 text-right flex-shrink-0" title="Suka">
                    {formatCompact(p.likeCount ?? 0)}
                  </span>
                  {followerCount > 0 && (
                    <span className="text-accent-primary tabular-nums w-14 text-right flex-shrink-0" title="ER">
                      {formatPercent(er, 1)}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {filtered.length > 200 && (
        <div className="text-[10px] text-text-muted mt-2 text-center italic">
          Menampilkan 200 post pertama. Gunakan filter untuk mempersempit.
        </div>
      )}
    </div>
  );
}
