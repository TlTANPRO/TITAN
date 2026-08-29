// Unit tests for scrape-comments-tt-browser helpers (V38)
import { describe, it, expect } from 'vitest';
import { detectAdmin, flattenComments, ADMIN_PATTERNS } from './scrape-comments-tt-browser.mjs';

describe('detectAdmin', () => {
  it('detects dash-prefixed markers at end of text', () => {
    expect(detectAdmin('blaeeeen iku jenenge mbiaak -Rf')).toBe('Rifqi');
    expect(detectAdmin('oke admin -Re')).toBe('Reni');
    expect(detectAdmin('mantap -Rm')).toBe('Reta');
    expect(detectAdmin('siap -Ju')).toBe('Julian');
  });

  it('matches aliases', () => {
    expect(detectAdmin('cek -Riki')).toBe('Rifqi');
    expect(detectAdmin('cek -Rifki')).toBe('Rifqi');
    expect(detectAdmin('halo -Reta')).toBe('Reta');
    expect(detectAdmin('hai -Julian')).toBe('Julian');
  });

  it('is case-insensitive', () => {
    expect(detectAdmin('mantap -RF')).toBe('Rifqi');
    expect(detectAdmin('mantap -rm')).toBe('Reta');
  });

  it('allows optional spacers', () => {
    expect(detectAdmin('mantap - Rf')).toBe('Rifqi');
    expect(detectAdmin('mantap -  Rm ')).toBe('Reta');
  });

  it('does not match plain words or hashtag markers', () => {
    expect(detectAdmin('rf ini bagus')).toBeNull();
    expect(detectAdmin('#Rf bukan marker')).toBeNull();
    expect(detectAdmin('tidak ada')).toBeNull();
    expect(detectAdmin('')).toBeNull();
    expect(detectAdmin(null)).toBeNull();
  });

  it('marker patterns are mutually exclusive tags', () => {
    const tags = ADMIN_PATTERNS.map((p) => p.tag);
    expect(tags).toContain('-Re');
    expect(tags).toContain('-Rf');
    expect(tags).toContain('-Rm');
    expect(tags).toContain('-Ju');
  });
});

describe('flattenComments', () => {
  it('returns empty for missing comments', () => {
    expect(flattenComments({})).toEqual([]);
    expect(flattenComments(null)).toEqual([]);
    expect(flattenComments({ comments: null })).toEqual([]);
  });

  it('flattens top-level comments in order', () => {
    const body = {
      comments: [
        { cid: 'a', text: 'x' },
        { cid: 'b', text: 'y' }
      ]
    };
    expect(flattenComments(body).map((c) => c.cid)).toEqual(['a', 'b']);
  });

  it('recursively flattens reply threads (top-level first)', () => {
    const body = {
      comments: [
        {
          cid: 'a',
          text: 'x',
          reply_comment: [
            { cid: 'a1', text: 'reply1' },
            { cid: 'a2', text: 'reply2', reply_comment: [{ cid: 'a2x', text: 'deep' }] }
          ]
        },
        { cid: 'b', text: 'y' }
      ]
    };
    expect(flattenComments(body).map((c) => c.cid)).toEqual([
      'a',
      'a1',
      'a2',
      'a2x',
      'b'
    ]);
  });

  it('skips malformed entries', () => {
    const body = {
      comments: [null, undefined, {}, { cid: 'ok', text: 't' }]
    };
    expect(flattenComments(body).map((c) => c.cid)).toEqual(['ok']);
  });
});