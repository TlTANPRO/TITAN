import { describe, expect, it } from 'vitest';
import {
  formatRelativeAge,
  getAgeMs,
  getLatestPostAt,
  getPortfolioFreshness
} from './dataFreshness.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('data freshness helpers', () => {
  it('normalizes second, millisecond, and ISO post timestamps', () => {
    const accounts = [{
      posts: [
        { createTime: 1_700_000_000 },
        { timestamp: 1_700_000_000_000 }
      ]
    }];

    expect(getLatestPostAt(accounts)).toBe(1_700_000_000_000);
    expect(getAgeMs(1_700_000_000, 1_700_000_000_000 + HOUR)).toBe(HOUR);
    expect(getAgeMs('2026-09-24T00:00:00.000Z', Date.parse('2026-09-25T00:00:00.000Z'))).toBe(DAY);
  });

  it('uses days instead of an hours suffix for multi-day values', () => {
    expect(formatRelativeAge(74 * DAY)).toBe('2 bulan');
    expect(formatRelativeAge(25 * 60 * 1000)).toBe('25m');
    expect(formatRelativeAge(3 * HOUR)).toBe('3j');
  });

  it('separates content freshness from the latest scrape time', () => {
    const now = Date.parse('2026-09-25T00:00:00.000Z');
    const status = getPortfolioFreshness([{
      platform: 'instagram',
      scrapedAt: '2026-09-24T23:00:00.000Z',
      posts: [{ createTime: now / 1000 - 4 * DAY / 1000 }]
    }], now);

    expect(status.tone).toBe('danger');
    expect(status.label).toBe('Konten 4 hari');
    expect(status.lastScrapeAt).toBe(Date.parse('2026-09-24T23:00:00.000Z'));
    expect(status.platforms.instagram.accountCount).toBe(1);
    expect(status.platforms.tiktok.accountCount).toBe(0);
  });

  it('returns a neutral state when no post data exists', () => {
    const status = getPortfolioFreshness([], 1718000000000);
    expect(status.tone).toBe('neutral');
    expect(status.label).toBe('Belum ada data konten');
    expect(status.latestPostAt).toBeNull();
  });
});
