import { describe, it, expect } from 'vitest';
import {
  SPEC_TAB_LABELS,
  SPEC_TAB_ORDER,
  buildMonthlyPostSeries,
  formatCompact,
  formatCompactAge,
  getLandingBento,
  getLandingMetrics,
  getLandingSpecStats
} from './landingData.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-09-25T12:00:00Z');

const DAY_30 = 30 * DAY;

function manifest(overrides = {}) {
  return {
    accountCount: 2,
    totalPosts: 200,
    latestPostAt: NOW - 6 * HOUR,
    lastScrapeAt: NOW - 2 * HOUR,
    accounts: [
      { slug: 'a', username: 'akun_a', platform: 'instagram', postCount: 100, latestPostAt: NOW - 6 * HOUR, coverage: { engagedPostShare: 1 } },
      { slug: 'b', username: 'akun_b', platform: 'tiktok', postCount: 100, latestPostAt: NOW - 5 * DAY, coverage: { engagedPostShare: 0 } }
    ],
    ...overrides
  };
}

const accounts = [
  {
    slug: 'a',
    platform: 'instagram',
    posts: [
      { id: '1', createTime: (NOW - 2 * DAY) / 1000, likeCount: 300, commentCount: 20, viewCount: 9000 },
      { id: '2', createTime: (NOW - 40 * DAY) / 1000, likeCount: 100, commentCount: 5, viewCount: 3000 }
    ]
  },
  {
    slug: 'b',
    platform: 'tiktok',
    posts: [
      { id: '3', createTime: (NOW - 3 * DAY) / 1000, likeCount: 500, playCount: 20000 },
      { id: '4', createTime: (NOW - 20 * DAY) / 1000, likeCount: 50 }
    ]
  }
];

describe('formatCompact', () => {
  it('renders an em dash for non-numbers rather than NaN', () => {
    expect(formatCompact(null)).toBe('—');
    expect(formatCompact(undefined)).toBe('—');
  });

  it('uses Indonesian digit grouping', () => {
    expect(formatCompact(5170)).toBe('5.170');
    expect(formatCompact(9)).toBe('9');
  });
});

describe('formatCompactAge', () => {
  it('uses minutes, hours, days, then 30-day months', () => {
    expect(formatCompactAge(5 * 60 * 1000)).toBe('5m');
    expect(formatCompactAge(6 * HOUR)).toBe('6j');
    expect(formatCompactAge(9 * DAY)).toBe('9h');
    expect(formatCompactAge(70 * DAY)).toBe('2bl');
  });

  it('never reports zero minutes for a sub-minute age', () => {
    expect(formatCompactAge(500)).toBe('1m');
  });

  it('returns an em dash for an unknown age', () => {
    expect(formatCompactAge(null)).toBe('—');
  });
});

describe('getLandingMetrics', () => {
  it('returns exactly eight tiles, matching the prompt 2x4 grid', () => {
    expect(getLandingMetrics(accounts, manifest(), NOW)).toHaveLength(8);
  });

  it('sums real posts rather than trusting the manifest', () => {
    const m = getLandingMetrics(accounts, manifest({ totalPosts: 99999 }), NOW);
    expect(m[1].value).toBe('4');
  });

  it('falls back to the manifest when no accounts are loaded yet', () => {
    const m = getLandingMetrics([], manifest({ totalPosts: 5170 }), NOW);
    expect(m[0].value).toBe('2');
    expect(m[1].value).toBe('5.170');
  });

  it('counts only fresh accounts in the freshness ratio', () => {
    // manifest has one account inside 72h and one outside it.
    expect(getLandingMetrics(accounts, manifest(), NOW)[5].value).toBe('50');
  });

  it('never divides by zero with an empty portfolio', () => {
    const m = getLandingMetrics([], null, NOW);
    expect(m).toHaveLength(8);
    expect(m.every((tile) => typeof tile.value === 'string')).toBe(true);
  });

  it('reports manifest coverage even once the full dataset is loaded', () => {
    // Regression: this was gated on accounts.length === 0, so the tile showed an
    // em dash on every normal load instead of the real number.
    const withAccounts = getLandingMetrics(accounts, manifest(), NOW);
    const manifestOnly = getLandingMetrics([], manifest(), NOW);
    expect(withAccounts[6].value).toBe(manifestOnly[6].value);
    expect(withAccounts[6].value).not.toBe('—');
  });

  it('shows an em dash for coverage when there is no manifest', () => {
    expect(getLandingMetrics(accounts, null, NOW)[6].value).toBe('—');
  });
});

describe('buildMonthlyPostSeries', () => {
  it('buckets posts oldest-to-newest into the requested window', () => {
    const series = buildMonthlyPostSeries(accounts, 6, NOW);
    expect(series).toHaveLength(6);
    // The newest post lands in the last bucket.
    expect(series[series.length - 1]).toBeGreaterThan(0);
  });

  it('ignores posts with unusable timestamps', () => {
    const series = buildMonthlyPostSeries(
      [{ posts: [{ createTime: 0 }, { createTime: 'bukan tanggal' }, { createTime: null }] }],
      6,
      NOW
    );
    expect(series.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('drops posts older than the window instead of bucketing them at index 0', () => {
    const series = buildMonthlyPostSeries(
      [{ posts: [{ createTime: (NOW - 400 * DAY) / 1000 }] }],
      6,
      NOW
    );
    expect(series.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('getLandingBento', () => {
  it('produces every field the six bento cards render', () => {
    const b = getLandingBento(accounts, manifest(), NOW);
    for (const key of [
      'postsStat', 'postsCaption', 'monthly',
      'accountsStat', 'accountsCaption',
      'freshnessStat', 'freshnessCaption',
      'coverageStat', 'coverageCaption', 'coverageKnown',
      'platformsStat', 'platformsCaption'
    ]) {
      expect(b[key]).toBeDefined();
    }
  });

  it('gives the staircase exactly six monthly buckets', () => {
    expect(getLandingBento(accounts, manifest(), NOW).monthly).toHaveLength(6);
  });

  it('reports an em dash for freshness when there is no content at all', () => {
    const b = getLandingBento([], manifest({ latestPostAt: null }), NOW);
    expect(b.freshnessStat).toBe('—');
    expect(b.freshnessCaption).toMatch(/Belum ada data/);
  });

  it('counts how many accounts actually have engagement metrics', () => {
    expect(getLandingBento(accounts, manifest(), NOW).coverageKnown).toBe(1);
  });
});

describe('getLandingSpecStats', () => {
  const stats = getLandingSpecStats(accounts, manifest(), NOW);

  it('builds one dataset per tab, in the declared order', () => {
    for (const key of SPEC_TAB_ORDER) {
      expect(stats[key], `missing dataset ${key}`).toBeTruthy();
    }
    expect(SPEC_TAB_ORDER).toHaveLength(4);
    expect(Object.keys(SPEC_TAB_LABELS)).toHaveLength(4);
  });

  it('gives every dataset a title, a summary and exactly four bars', () => {
    for (const key of SPEC_TAB_ORDER) {
      const d = stats[key];
      expect(typeof d.title).toBe('string');
      expect(d.summary.length).toBeGreaterThan(10);
      expect(d.bars, `${key} bar count`).toHaveLength(4);
    }
  });

  it('gives every bar the full prompt shape', () => {
    for (const key of SPEC_TAB_ORDER) {
      for (const bar of stats[key].bars) {
        expect(bar.label).toBeTruthy();
        expect(bar.note).toBeTruthy();
        expect(bar.value).toBeGreaterThanOrEqual(0);
        expect(bar.value).toBeLessThanOrEqual(100);
        expect(bar.rangeStart).toMatch(/%$/);
        expect(bar.rangeWidth).toMatch(/%$/);
        expect(bar.trace).toHaveLength(6);
        for (const point of bar.trace) {
          expect(point).toBeGreaterThanOrEqual(0);
          expect(point).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it('keeps every spark point inside its own bar value', () => {
    // A trace point past the fill would draw a spark the bar does not cover.
    for (const key of SPEC_TAB_ORDER) {
      for (const bar of stats[key].bars) {
        for (const point of bar.trace) {
          expect(point).toBeLessThanOrEqual(Math.ceil(bar.value) + 1);
        }
      }
    }
  });

  it('never emits a zero-width range band', () => {
    for (const key of SPEC_TAB_ORDER) {
      for (const bar of stats[key].bars) {
        expect(parseFloat(bar.rangeWidth)).toBeGreaterThan(0);
      }
    }
  });

  it('computes an empty-state tab for a platform with no accounts', () => {
    const noTikTok = getLandingSpecStats([accounts[0]], { ...manifest(), accounts: [manifest().accounts[0]] }, NOW);
    expect(noTikTok.tiktok.bars).toHaveLength(4);
    expect(noTikTok.tiktok.bars.every((b) => b.value === 0)).toBe(true);
    expect(noTikTok.tiktok.summary).toMatch(/tidak ada akun/i);
  });

  it('scores scrape cadence against a 48h budget', () => {
    const fresh = getLandingSpecStats(accounts, manifest({ lastScrapeAt: NOW - 2 * HOUR }), NOW);
    const late = getLandingSpecStats(accounts, manifest({ lastScrapeAt: NOW - 20 * HOUR }), NOW);
    const cadence = (s) =>
      s.kualitas.bars.find((b) => b.label === 'Kepatuhan jadwal scrape').value;
    expect(cadence(fresh)).toBeGreaterThan(cadence(late));
  });

  it('drops the cadence bar to zero when the pipeline has never run', () => {
    const never = getLandingSpecStats(accounts, manifest({ lastScrapeAt: null }), NOW);
    const cadence = never.kualitas.bars.find((b) => b.label === 'Kepatuhan jadwal scrape');
    expect(cadence.value).toBe(0);
    expect(cadence.note).toMatch(/belum pernah/);
  });
});
