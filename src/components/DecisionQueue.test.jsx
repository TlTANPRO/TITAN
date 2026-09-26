import { describe, it, expect } from 'vitest';
import { buildQueue } from './DecisionQueue.jsx';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-09-25T12:00:00Z');

function manifest(overrides = {}) {
  return {
    accountCount: 2,
    totalPosts: 100,
    lastScrapeAt: NOW - 2 * HOUR,
    latestPostAt: NOW - 6 * HOUR,
    accounts: [
      { slug: 'a', username: 'akun_a', postCount: 50, latestPostAt: NOW - 6 * HOUR, coverage: { engagedPostShare: 1 } },
      { slug: 'b', username: 'akun_b', postCount: 50, latestPostAt: NOW - 5 * HOUR, coverage: { engagedPostShare: 1 } }
    ],
    ...overrides
  };
}

const ORDER = { blocker: 0, warn: 1, info: 2 };

describe('buildQueue', () => {
  it('says so plainly when nothing needs action', () => {
    const items = buildQueue([], manifest(), NOW);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('clear');
    expect(items[0].severity).toBe('info');
  });

  it('raises a blocker when content is older than 72h', () => {
    const items = buildQueue([], manifest({ latestPostAt: NOW - 10 * DAY }), NOW);
    const stale = items.find((i) => i.id === 'stale-content');
    expect(stale).toBeTruthy();
    expect(stale.severity).toBe('blocker');
    expect(stale.detail).toMatch(/10 hari/);
  });

  it('warns about aging content between 24h and 72h', () => {
    const items = buildQueue([], manifest({ latestPostAt: NOW - 2 * DAY }), NOW);
    expect(items.find((i) => i.id === 'stale-content')).toBeUndefined();
    const aging = items.find((i) => i.id === 'aging-content');
    expect(aging.severity).toBe('warn');
    expect(aging.detail).toMatch(/72 jam/);
  });

  it('stays quiet for content under 24h', () => {
    const items = buildQueue([], manifest({ latestPostAt: NOW - 3 * HOUR }), NOW);
    expect(items.some((i) => i.id === 'aging-content')).toBe(false);
    expect(items.some((i) => i.id === 'stale-content')).toBe(false);
  });

  it('treats a zero engagement share as a blocker, not as zero engagement', () => {
    const input = manifest({
      accounts: [
        { slug: 'a', username: 'akun_a', postCount: 50, latestPostAt: NOW - HOUR, coverage: { engagedPostShare: 0 } }
      ]
    });
    const items = buildQueue([], input, NOW);
    const item = items.find((i) => i.id === 'account-a');
    expect(item.severity).toBe('blocker');
    expect(item.detail).toMatch(/tidak diukur/);
  });

  it('flags an account whose content went stale', () => {
    const input = manifest({
      accounts: [
        { slug: 'a', username: 'akun_a', postCount: 50, latestPostAt: NOW - 8 * DAY, coverage: { engagedPostShare: 1 } }
      ]
    });
    const items = buildQueue([], input, NOW);
    const item = items.find((i) => i.id === 'account-a');
    expect(item.severity).toBe('warn');
    expect(item.title).toMatch(/8 hari/);
  });

  it('caps the queue at five items so it stays a worklist', () => {
    const input = manifest({
      latestPostAt: NOW - 9 * DAY,
      accounts: Array.from({ length: 9 }, (_, i) => ({
        slug: `s${i}`,
        username: `akun_${i}`,
        postCount: 10,
        latestPostAt: NOW - 9 * DAY,
        coverage: { engagedPostShare: 0 }
      }))
    });
    // 1 portfolio-level blocker + at most 3 account-level items.
    expect(buildQueue([], input, NOW)).toHaveLength(4);
  });

  it('orders blockers before warnings before info', () => {
    const input = manifest({
      latestPostAt: NOW - 10 * DAY,
      accounts: [
        { slug: 'old', username: 'lama', postCount: 5, latestPostAt: NOW - 30 * DAY, coverage: { engagedPostShare: 1 } }
      ]
    });
    const severities = buildQueue([], input, NOW).map((i) => ORDER[i.severity]);
    expect(severities).toEqual([...severities].sort((a, b) => a - b));
  });

  it('survives a manifest with no timestamp at all', () => {
    const items = buildQueue([], manifest({ latestPostAt: null, lastScrapeAt: null }), NOW);
    expect(items.some((i) => i.id === 'stale-content')).toBe(false);
  });

  // --- load health, added after the degraded-flag bug ---
  it('raises a blocker when the data failed to load, ahead of every other signal', () => {
    // With zero accounts the content checks would quietly pass, so without this
    // the queue would claim "nothing to do" over an empty dashboard.
    const items = buildQueue([], null, NOW, { loadError: 'HTTP 404 for /TITAN/accounts-full.json' });
    expect(items[0].id).toBe('load-failed');
    expect(items[0].severity).toBe('blocker');
    expect(items[0].detail).toMatch(/bukan karena tidak ada konten/i);
    expect(items[0].detail).toMatch(/404/);
  });

  it('warns when running on the local split payloads', () => {
    const items = buildQueue([], manifest(), NOW, { degraded: true });
    const item = items.find((i) => i.id === 'degraded');
    expect(item).toBeTruthy();
    expect(item.severity).toBe('warn');
    expect(item.detail).toMatch(/hanya terjadi di mode lokal/i);
  });

  it('stays quiet about degraded mode on a normal load', () => {
    const items = buildQueue([], manifest(), NOW, { degraded: false, loadError: null });
    expect(items.some((i) => i.id === 'degraded')).toBe(false);
    expect(items.some((i) => i.id === 'load-failed')).toBe(false);
  });
});
