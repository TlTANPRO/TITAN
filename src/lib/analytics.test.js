// Tests untuk 6 V10 Phase 1B analytics primitives
import { describe, it, expect } from 'vitest';
import {
  accountHealthScore,
  viralPostRecipe,
  competitorGap,
  contentCalendarRecommendation,
  postingHeatmapByMediaType,
  timeSinceLastViral
} from './analytics.js';

const now = 1718000000; // fixed timestamp 2024-06-10

function makeAccount(overrides = {}) {
  return {
    slug: 'ig-test',
    platform: 'instagram',
    username: 'test',
    followerCount: 10000,
    posts: [
      {
        id: 'p1', shortcode: 'AAA', mediaType: 'REEL',
        createTime: now - 7 * 86400,
        likeCount: 500, commentCount: 50, viewCount: 10000
      },
      {
        id: 'p2', shortcode: 'BBB', mediaType: 'IMAGE',
        createTime: now - 5 * 86400,
        likeCount: 100, commentCount: 5, viewCount: 0
      },
      {
        id: 'p3', shortcode: 'CCC', mediaType: 'CAROUSEL_ALBUM',
        createTime: now - 3 * 86400,
        likeCount: 300, commentCount: 20, viewCount: 0
      },
      {
        id: 'p4', shortcode: 'DDD', mediaType: 'REEL',
        createTime: now - 1 * 86400,
        likeCount: 50, commentCount: 2, viewCount: 5000
      }
    ],
    ...overrides
  };
}

describe('accountHealthScore', () => {
  it('returns 0-100 score and breakdown for valid account', () => {
    const acc = makeAccount();
    const result = accountHealthScore(acc);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.grade).toMatch(/^[A-E]$/);
    expect(result.breakdown).toHaveProperty('engagement');
    expect(result.breakdown).toHaveProperty('consistency');
    expect(result.breakdown).toHaveProperty('growth');
    expect(result.breakdown).toHaveProperty('diversity');
    const sum = result.breakdown.engagement * 0.4
      + result.breakdown.consistency * 0.25
      + result.breakdown.growth * 0.2
      + result.breakdown.diversity * 0.15;
    expect(Math.round(sum)).toBe(result.score);
  });

  it('returns 0 for empty account', () => {
    const r = accountHealthScore({ posts: [], platform: 'instagram' });
    expect(r.score).toBe(0);
  });
});

describe('viralPostRecipe', () => {
  it('returns top examples and pattern from outliers', () => {
    const posts = makeAccount().posts;
    const r = viralPostRecipe(posts);
    expect(r.examples.length).toBeGreaterThan(0);
    expect(r.examples.length).toBeLessThanOrEqual(3);
    expect(r.pattern).toHaveProperty('medianLength');
    expect(r.pattern).toHaveProperty('avgEmojiCount');
    expect(r.timing).toHaveProperty('topDay');
    expect(r.timing).toHaveProperty('topHour');
  });

  it('returns null pattern for empty posts', () => {
    const r = viralPostRecipe([]);
    expect(r.pattern).toBeNull();
  });
});

describe('competitorGap', () => {
  it('compares account to peer median', () => {
    const me = makeAccount({ engagementRate: 5, avgLikes: 1000, avgViews: 5000, postsPerWeek: 3 });
    const peers = [
      { platform: 'instagram', engagementRate: 3, avgLikes: 500, avgViews: 3000, postsPerWeek: 2 },
      { platform: 'instagram', engagementRate: 4, avgLikes: 800, avgViews: 4000, postsPerWeek: 4 }
    ];
    const gap = competitorGap(me, peers);
    expect(gap.peerCount).toBe(2);
    expect(gap.erGap).toBeGreaterThan(0); // I beat peer median
    expect(gap.likesGap).toBeGreaterThan(0);
  });

  it('returns zeros for empty peer list', () => {
    const me = makeAccount();
    const gap = competitorGap(me, []);
    expect(gap.peerCount).toBe(0);
    expect(gap.erGap).toBe(0);
  });
});

describe('contentCalendarRecommendation', () => {
  it('returns top 3 day/hour slots', () => {
    const posts = makeAccount().posts;
    const r = contentCalendarRecommendation(posts, 'instagram');
    expect(r.slots.length).toBeLessThanOrEqual(3);
    if (r.slots.length > 0) {
      expect(r.slots[0]).toHaveProperty('dayName');
      expect(r.slots[0]).toHaveProperty('hour');
    }
    expect(r.frequency).toBeGreaterThan(0);
    expect(r.mix).toBeTruthy();
  });

  it('returns empty for no posts', () => {
    const r = contentCalendarRecommendation([], 'instagram');
    expect(r.slots).toEqual([]);
    expect(r.frequency).toBe(0);
  });
});

describe('postingHeatmapByMediaType', () => {
  it('returns 7x24 grid for each media type', () => {
    const posts = makeAccount().posts;
    const r = postingHeatmapByMediaType(posts);
    expect(r).toHaveProperty('REEL');
    expect(r).toHaveProperty('IMAGE');
    expect(r).toHaveProperty('CAROUSEL_ALBUM');
    expect(r.REEL).toHaveLength(7);
    expect(r.REEL[0]).toHaveLength(24);
  });

  it('handles empty posts', () => {
    const r = postingHeatmapByMediaType([]);
    expect(r.REEL[3][12]).toBe(0);
  });
});

describe('timeSinceLastViral', () => {
  it('returns days since last viral post', () => {
    const posts = makeAccount().posts;
    const r = timeSinceLastViral(posts, now * 1000);
    expect(r.days).toBeGreaterThanOrEqual(0);
    expect(r.lastViralDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.viralsPerMonth).toBeGreaterThanOrEqual(0);
  });

  it('handles empty posts', () => {
    const r = timeSinceLastViral([], now * 1000);
    expect(r.days).toBeNull();
  });
});
