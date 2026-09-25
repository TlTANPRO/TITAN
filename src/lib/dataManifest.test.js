import { describe, it, expect } from 'vitest';
import {
  getManifestCoverage,
  getManifestFreshness,
  getManifestStaleAccounts
} from './dataManifest.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-09-25T12:00:00Z');

function manifest(overrides = {}) {
  return {
    schemaVersion: 2,
    generatedAt: '2026-09-25T11:55:00Z',
    lastScrapeAt: NOW - 2 * HOUR,
    latestPostAt: NOW - 6 * HOUR,
    accountCount: 2,
    totalPosts: 120,
    version: 'abc123',
    contentStatus: 'fresh',
    platforms: {
      instagram: { accountCount: 1, postCount: 60, latestPostAt: NOW - 6 * HOUR },
      tiktok: { accountCount: 1, postCount: 60, latestPostAt: NOW - 5 * 24 * HOUR }
    },
    accounts: [
      { slug: 'a', postCount: 60, latestPostAt: NOW - 6 * HOUR, coverage: { engagedPostShare: 1 } },
      { slug: 'b', postCount: 60, latestPostAt: NOW - 5 * DAY, coverage: { engagedPostShare: 0.5 } }
    ],
    ...overrides
  };
}

describe('getManifestFreshness', () => {
  it('returns null without a manifest so callers can fall back', () => {
    expect(getManifestFreshness(null, NOW)).toBeNull();
  });

  it('marks content under 24h as success and exposes the version', () => {
    const result = getManifestFreshness(manifest(), NOW);
    expect(result.tone).toBe('success');
    expect(result.source).toBe('manifest');
    expect(result.version).toBe('abc123');
    expect(result.schemaVersion).toBe(2);
    expect(result.ageMs).toBe(6 * HOUR);
  });

  it('marks content between 24h and 72h as warning', () => {
    const result = getManifestFreshness(manifest({ latestPostAt: NOW - 2 * DAY }), NOW);
    expect(result.tone).toBe('warning');
  });

  it('marks content over 72h as danger', () => {
    const result = getManifestFreshness(manifest({ latestPostAt: NOW - 10 * DAY }), NOW);
    expect(result.tone).toBe('danger');
  });

  it('is neutral when no post timestamp exists at all', () => {
    const result = getManifestFreshness(manifest({ latestPostAt: null }), NOW);
    expect(result.tone).toBe('neutral');
    expect(result.ageMs).toBeNull();
  });

  it('rolls platform freshness up independently of the portfolio', () => {
    const result = getManifestFreshness(manifest(), NOW);
    expect(result.platforms.instagram.tone).toBe('success');
    expect(result.platforms.tiktok.tone).toBe('danger');
    expect(result.platforms.instagram.accountCount).toBe(1);
  });

  it('treats a missing platform as neutral rather than crashing', () => {
    const result = getManifestFreshness(manifest({ platforms: {} }), NOW);
    expect(result.platforms).toEqual({});
  });
});

describe('getManifestStaleAccounts', () => {
  it('returns an empty list when nothing is manifest-known', () => {
    expect(getManifestStaleAccounts(null, NOW)).toEqual([]);
    expect(getManifestStaleAccounts({}, NOW)).toEqual([]);
  });

  it('lists only accounts past the 72h threshold, worst first', () => {
    const stale = getManifestStaleAccounts(manifest(), NOW);
    expect(stale.map((a) => a.slug)).toEqual(['b']);
  });

  it('flags an account with no post timestamp at all', () => {
    const input = manifest({
      accounts: [{ slug: 'c', postCount: 0, latestPostAt: null, coverage: { engagedPostShare: 0 } }]
    });
    expect(getManifestStaleAccounts(input, NOW).map((a) => a.slug)).toEqual(['c']);
  });
});

describe('getManifestCoverage', () => {
  it('averages the per-account engagement share', () => {
    expect(getManifestCoverage(manifest(), NOW)).toBeCloseTo(0.75, 5);
  });

  it('returns null when there is nothing to average', () => {
    expect(getManifestCoverage(null, NOW)).toBeNull();
    expect(getManifestCoverage({ accounts: [] }, NOW)).toBeNull();
  });

  it('ignores accounts whose share is not a number', () => {
    const input = manifest({
      accounts: [
        { slug: 'a', latestPostAt: NOW, coverage: { engagedPostShare: 1 } },
        { slug: 'b', latestPostAt: NOW, coverage: {} }
      ]
    });
    expect(getManifestCoverage(input, NOW)).toBe(1);
  });
});
