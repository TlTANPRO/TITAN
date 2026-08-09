// normalize.test.js — V11 fix: extractHashtags / extractMentions must NOT
// produce doubled prefixes (`##`, `@@`) when upstream data is already
// double-prefixed (e.g. `##ardiantanah`).
//
// V17 fix: normalizeAccount must pass through `localAvatar` so ProxiedAvatar
// can render the real profile photo. Regression test added after a bug where
// normalizeAccount dropped the localAvatar field, causing all 9 accounts to
// show the brand-icon tile fallback instead of the real photo.
import { describe, it, expect } from 'vitest';
import { extractHashtags, extractMentions, normalizeAccount, normalizePost } from './normalize.js';

describe('extractHashtags', () => {
  it('returns empty array for null/undefined/empty input', () => {
    expect(extractHashtags(null)).toEqual([]);
    expect(extractHashtags(undefined)).toEqual([]);
    expect(extractHashtags('')).toEqual([]);
  });

  it('extracts single hashtag', () => {
    expect(extractHashtags('#magnolia')).toEqual(['#magnolia']);
  });

  it('extracts multiple hashtags', () => {
    expect(extractHashtags('#magnolia #properti')).toEqual(['#magnolia', '#properti']);
  });

  it('lowercases and dedupes', () => {
    expect(extractHashtags('#Magnolia #magnolia #MAGNOLIA')).toEqual(['#magnolia']);
  });

  it('handles Indonesian unicode letters', () => {
    expect(extractHashtags('#properti #lelangjakarta #propertiLelangJakarta')).toContain('#properti');
    expect(extractHashtags('#properti #lelangjakarta #propertiLelangJakarta')).toContain('#lelangjakarta');
    expect(extractHashtags('#properti #lelangjakarta #propertiLelangJakarta')).toContain('#propertilelangjakarta');
  });

  it('never produces doubled ##', () => {
    // The bug: a regex with no word boundary would match ##ardiantanah as
    // a single tag and the renderer would prepend # → ##ardiantanah.
    const result = extractHashtags('lihat ##ardiantanah');
    expect(result).toEqual(['#ardiantanah']);
    expect(result.every((t) => !t.startsWith('##'))).toBe(true);
  });

  it('anchors on whitespace or BOL', () => {
    expect(extractHashtags('hello#world')).toEqual([]);
    expect(extractHashtags('hello #world')).toEqual(['#world']);
  });
});

describe('extractMentions', () => {
  it('returns empty array for null/undefined/empty input', () => {
    expect(extractMentions(null)).toEqual([]);
    expect(extractMentions(undefined)).toEqual([]);
    expect(extractMentions('')).toEqual([]);
  });

  it('extracts single mention', () => {
    expect(extractMentions('@magnolia.coffee')).toEqual(['@magnolia.coffee']);
  });

  it('extracts multiple mentions', () => {
    expect(extractMentions('@magnolia @ardiantanah')).toEqual(['@magnolia', '@ardiantanah']);
  });

  it('lowercases and dedupes', () => {
    expect(extractMentions('@Magnolia @magnolia')).toEqual(['@magnolia']);
  });

  it('never produces doubled @@', () => {
    const result = extractMentions('follow @@magnolia.coffee');
    expect(result).toEqual(['@magnolia.coffee']);
    expect(result.every((t) => !t.startsWith('@@'))).toBe(true);
  });

  it('anchors on whitespace or BOL', () => {
    expect(extractMentions('hello@world')).toEqual([]);
    expect(extractMentions('hello @world')).toEqual(['@world']);
  });
});

describe('normalizeAccount — localAvatar passthrough (V17)', () => {
  it('passes through localAvatar when present', () => {
    const raw = {
      account: {
        slug: 'ig-test',
        username: 'test',
        localAvatar: '/TITAN/assets/avatars/ig-test.jpg'
      },
      posts: []
    };
    const result = normalizeAccount(raw, 'instagram');
    expect(result.localAvatar).toBe('/TITAN/assets/avatars/ig-test.jpg');
  });

  it('returns empty string when localAvatar is missing', () => {
    const raw = {
      account: { slug: 'ig-test', username: 'test' },
      posts: []
    };
    const result = normalizeAccount(raw, 'instagram');
    expect(result.localAvatar).toBe('');
  });

  it('preserves all 9 IG/TT accounts through normalization', () => {
    // Smoke test: 9 real accounts all have localAvatar paths
    const slugs = [
      ['ig-majangmejeng_', '/TITAN/assets/avatars/ig-majangmejeng_.jpg'],
      ['ig-syahfalahproperti', '/TITAN/assets/avatars/ig-syahfalahproperti.jpg'],
      ['ig-nisyanandaa', '/TITAN/assets/avatars/ig-nisyanandaa.jpg'],
      ['ig-ardiantanah', '/TITAN/assets/avatars/ig-ardiantanah.jpg'],
      ['tt-majangmejeng_', '/TITAN/assets/avatars/tt-majangmejeng_.jpeg'],
      ['tt-syahfalahproperti', '/TITAN/assets/avatars/tt-syahfalahproperti.jpeg'],
      ['tt-ardian.tanah', '/TITAN/assets/avatars/tt-ardian.tanah.jpeg'],
      ['tt-ardiantanahmenjawab', '/TITAN/assets/avatars/tt-ardiantanahmenjawab.jpeg'],
      ['tt-itsnisyananda', '/TITAN/assets/avatars/tt-itsnisyananda.jpeg']
    ];
    for (const [slug, expected] of slugs) {
      const platform = slug.startsWith('ig-') ? 'instagram' : 'tiktok';
      const raw = {
        account: { slug, username: 'x', localAvatar: expected },
        posts: []
      };
      const result = normalizeAccount(raw, platform);
      expect(result.localAvatar).toBe(expected);
    }
  });
});

describe('availability matrix (V32.1)', () => {
  it('computes per-metric coverage as fraction of posts with valid data', () => {
    const raw = {
      account: { slug: 'test-ig', username: 'test', followerCount: 1000, followingCount: 0, postCount: 3 },
      posts: [
        { id: '1', likeCount: 10, commentCount: 1, viewCount: 100, postedAt: '2026-07-22T00:00:00.000Z' },
        { id: '2', likeCount: 0, commentCount: 0, viewCount: 0, postedAt: '2026-07-21T00:00:00.000Z' },
        { id: '3', likeCount: 5, commentCount: 0, viewCount: 50, postedAt: '' }
      ]
    };
    const out = normalizeAccount(raw, 'instagram');
    expect(out.availability.likes.coverage).toBeCloseTo(2 / 3, 5);
    expect(out.availability.comments.coverage).toBeCloseTo(1 / 3, 5);
    expect(out.availability.views.coverage).toBeCloseTo(2 / 3, 5);
    expect(out.availability.postedAt.coverage).toBeCloseTo(2 / 3, 5);
    expect(out.availability.following.hasData).toBe(false);
    expect(out.availability.following.value).toBe(0);
  });

  it('returns zero-coverage matrix for accounts with no posts', () => {
    const raw = { account: { slug: 'empty', username: 'empty' }, posts: [] };
    const out = normalizeAccount(raw, 'instagram');
    expect(out.availability.likes.coverage).toBe(0);
    expect(out.availability.comments.coverage).toBe(0);
    expect(out.availability.postedAt.coverage).toBe(0);
    expect(out.availability.following.hasData).toBe(false);
  });
});

describe('normalizePost — createTime fallback to timestamp (V32.3)', () => {
  // Bug: free IG scraper V28 only writes `timestamp` field, never `createTime`.
  // normalizePost fallback chain used to skip raw.timestamp → normalized
  // post.createTime = 0 → dataStore filter excluded from Live Activity Feed.
  // Fix: add raw.timestamp to fallback + normalize to sec.
  it('picks timestamp when no createTime/taken_at present (free IG scraper output)', () => {
    const raw = {
      id: '3959869110041692153',
      timestamp: 1786273205, // sec (free scraper writes taken_at here)
      caption: 'test'
    };
    const result = normalizePost(raw, 'instagram');
    expect(result.createTime).toBe(1786273205);
    expect(result.timestamp).toBe(1786273205000);
  });

  it('normalizes ms timestamp to seconds when used as createTime fallback', () => {
    const raw = {
      id: 'old-ig-post',
      timestamp: 1783945430000 // ms (ENSEMBLEDATA history)
    };
    const result = normalizePost(raw, 'instagram');
    expect(result.createTime).toBe(1783945430);
  });

  it('prefers raw.createTime over timestamp fallback', () => {
    const raw = {
      id: 'has-both',
      createTime: 1786273205,
      timestamp: 99999999
    };
    const result = normalizePost(raw, 'instagram');
    expect(result.createTime).toBe(1786273205);
  });
});

describe('normalizePost — TT postUrl fallback (V32.5)', () => {
  // Bug: free TT scraper leaves raw.videoUrl empty → normalizePost.postUrl
  // fell through to the IG branch and produced instagram.com URL for a TT
  // post. Admin table "Buka" link broken. Fix: pass accountUsername and
  // construct https://www.tiktok.com/@{username}/video/{id}.
  it('builds tiktok.com URL when videoUrl is empty but accountUsername provided', () => {
    const raw = { id: '7671952452672818440', caption: 'x' };
    const result = normalizePost(raw, 'tiktok', 'majangmejeng_');
    expect(result.postUrl).toBe('https://www.tiktok.com/@majangmejeng_/video/7671952452672818440');
  });

  it('prefers raw.videoUrl when present (TT)', () => {
    const raw = {
      id: '7671952452672818440',
      videoUrl: 'https://example.com/proxy/video.mp4',
      caption: 'x'
    };
    const result = normalizePost(raw, 'tiktok', 'majangmejeng_');
    // videoUrl is non-empty so we keep it (Buka link → actual play URL).
    // We do NOT want to silently replace a valid videoUrl with the canonical page URL.
    expect(result.postUrl).toBe('https://example.com/proxy/video.mp4');
  });

  it('builds instagram.com URL for IG posts when shortcode present', () => {
    const raw = { id: 'abc', shortcode: 'DavGLefkwbZ', caption: 'x' };
    const result = normalizePost(raw, 'instagram');
    expect(result.postUrl).toBe('https://www.instagram.com/p/DavGLefkwbZ/');
  });
});
