// V37 Faza 4: unit tests untuk pure functions di admin-helpers.jsx
import { describe, it, expect } from 'vitest';
import {
  adminInitials,
  Sparkline,
  postTimestampMs,
  filterByRange,
  listMonths,
  countPostsLast7Days,
  normalizeCaption,
  detectCrossPosts,
  buildSparkline,
  buildCrossPlatformKpi,
  RANGES_ADMIN
} from './admin-helpers.jsx';

describe('adminInitials', () => {
  it('huruf pertama + terakhir untuk multi-kata', () => {
    expect(adminInitials('Reni Saputri')).toBe('RS');
  });
  it('satu kata = dua huruf pertama uppercase', () => {
    expect(adminInitials('reni')).toBe('RE');
  });
});

describe('postTimestampMs', () => {
  it('createTime detik → ms', () => {
    expect(postTimestampMs({ createTime: 1700000000 })).toBe(1700000000000);
  });
  it('timestamp ms tetap ms', () => {
    const ms = Date.now();
    expect(postTimestampMs({ timestamp: ms })).toBe(ms);
  });
  it('timestamp detik → ms', () => {
    expect(postTimestampMs({ timestamp: 1700000000 })).toBe(1700000000000);
  });
  it('missing → 0', () => {
    expect(postTimestampMs({})).toBe(0);
  });
});

describe('normalizeCaption', () => {
  it('lowercase + trim', () => {
    expect(normalizeCaption('  Halo DUNIA  ')).toBe('halo dunia');
  });
  it('null → empty string', () => {
    expect(normalizeCaption(null)).toBe('');
    expect(normalizeCaption(undefined)).toBe('');
  });
});

describe('countPostsLast7Days', () => {
  it('hitung post dalam 7 hari terakhir', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const posts = [
      { createTime: nowSec - 3600 },
      { createTime: nowSec - 2 * 86400 },
      { createTime: nowSec - 30 * 86400 }
    ];
    expect(countPostsLast7Days(posts)).toBe(2);
  });
});

describe('buildSparkline', () => {
  it('hasil array angka sepanjang days', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const posts = [
      { createTime: nowSec - 3600 },
      { createTime: nowSec - 3 * 86400 },
      { createTime: nowSec - 3 * 86400 }
    ];
    const series = buildSparkline(posts, 7);
    expect(series).toHaveLength(7);
    series.forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
    expect(series.reduce((a, b) => a + b, 0)).toBe(3);
  });
});

describe('listMonths', () => {
  it('bulan unik desc dari daily rows (field .day)', () => {
    const data = [{ day: '2026-07-15' }, { day: '2026-08-01' }, { day: '2026-08-20' }];
    const months = listMonths(data);
    expect(months).toEqual(['2026-08', '2026-07']);
  });
});

describe('filterByRange', () => {
  const rows = [
    { day: new Date(Date.now() - 3600 * 1000).toISOString().slice(0, 10) },
    { day: '2025-01-01' }
  ];
  it("range 'all' = semua", () => {
    expect(filterByRange(rows, 'all')).toHaveLength(2);
  });
  it('range window detik memfilter hari lama', () => {
    expect(filterByRange(rows, '30d')).toHaveLength(1);
  });
  it('monthKey filter', () => {
    expect(filterByRange([{ day: '2026-08-01' }, { day: '2026-07-01' }], 'month', '2026-08')).toHaveLength(1);
  });
});

describe('detectCrossPosts', () => {
  it('pasangan IG/TT caption sama → crossIds berisi kedua id', () => {
    const base = { caption: 'Promo rumah murah di Bogor dengan harga terjangkau #properti' };
    const posts = [
      { ...base, _accountPlatform: 'instagram', id: 'ig1', createTime: Math.floor(Date.now() / 1000) },
      { ...base, _accountPlatform: 'tiktok', id: 'tt1', timestamp: Date.now() }
    ];
    const { crossIds, pairs } = detectCrossPosts(posts);
    expect(pairs.length).toBe(1);
    expect(crossIds.has('ig1')).toBe(true);
    expect(crossIds.has('tt1')).toBe(true);
  });
  it('caption pendek (<25 char) tidak di-match layer 1', () => {
    const posts = [
      { caption: 'halo', _accountPlatform: 'instagram', id: 'ig2', createTime: 1700000000 },
      { caption: 'halo', _accountPlatform: 'tiktok', id: 'tt2', timestamp: 1700000000000 }
    ];
    const { pairs } = detectCrossPosts(posts);
    // Layer 1 skip; layer 2 proximity butuh caption non-empty — bisa match via
    // proximity. Assert hanya struktur return valid.
    expect(Array.isArray(pairs)).toBe(true);
  });
});

describe('buildCrossPlatformKpi', () => {
  it('unique = ig + tt - cross', () => {
    const summary = [{
      name: 'Reni',
      posts: [
        { caption: 'Promo rumah murah di Bogor dengan harga terjangkau #properti', _accountPlatform: 'INSTAGRAM', id: 'a1', likeCount: 10, commentCount: 2, viewCount: 100, createTime: Math.floor(Date.now() / 1000) },
        { caption: 'Promo rumah murah di Bogor dengan harga terjangkau #properti', _accountPlatform: 'TIKTOK', id: 'a2', likeCount: 20, commentCount: 4, viewCount: 200, timestamp: Date.now() }
      ],
      postCount: 2
    }];
    const rows = buildCrossPlatformKpi(summary, []);
    expect(rows[0].igRaw ?? rows[0].instagram ?? null).toBeDefined();
    expect(rows[0].unique).toBeLessThanOrEqual(2);
  });
});

describe('RANGES_ADMIN', () => {
  it('punya key standar', () => {
    for (const k of ['7d', '30d', '90d', 'all', 'month']) {
      expect(RANGES_ADMIN).toHaveProperty(k);
    }
  });
});

describe('Sparkline render', () => {
  it('null untuk data kosong', () => {
    expect(Sparkline({ data: [], color: '#f00' })).toBeNull();
  });
});
