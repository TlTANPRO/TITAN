// Tests for adminComments lib — marker detection, normalization, aggregates.
import { describe, it, expect } from 'vitest';
import {
  loadAdminComments,
  buildAdminKpi,
  buildMonthlyKpi,
  listCommentMonths,
  groupByPost,
  previewCommentText,
  extractMarkerTag,
  detectAdmin
} from './adminComments.js';

const SAMPLE = {
  comments: [
    { id: 'c1', platform: 'instagram', admin: 'Rifqi', adminTag: '-Rf', postUrl: 'https://a/p/1', commentText: 'Salut lur, info edukatif! -Rf', timestampMs: 1785571200000, isOwnPost: false },
    { id: 'c2', platform: 'instagram', admin: 'Reni', adminTag: '-Re', postUrl: 'https://a/p/1', commentText: 'Btw ada update terbaru lur. -Re', timestampMs: 1785666600000, isOwnPost: true },
    { id: 'c3', platform: 'instagram', admin: 'Reta', adminTag: '-Rm', postUrl: 'https://a/p/2', commentText: 'Info bermanfaat! -Rm', timestampMs: 1785766500000, isOwnPost: false },
    { id: 'c4', platform: 'instagram', admin: 'Julian', adminTag: '-Ju', postUrl: 'https://a/p/3', commentText: 'Spot bagus lur -Ju', timestampMs: 1785920400000, isOwnPost: false },
    // PRE-Aug-1: must be dropped
    { id: 'old', platform: 'instagram', admin: 'Rifqi', adminTag: '-Rf', postUrl: 'https://a/p/0', commentText: 'Old comment -Rf', timestampMs: 1700000000000, isOwnPost: false },
    // Missing admin, detected from text
    { id: 'c5', platform: 'instagram', adminTag: '-Riki', postUrl: 'https://a/p/4', commentText: 'Setuju lur -Riki', timestampMs: 1786454400000, isOwnPost: false }
  ]
};

describe('detectAdmin', () => {
  it('matches canonical markers', () => {
    expect(detectAdmin('text -Rf')).toBe('Rifqi');
    expect(detectAdmin('text -Rm')).toBe('Reta');
    expect(detectAdmin('text -Re')).toBe('Reni');
    expect(detectAdmin('text -Ju')).toBe('Julian');
  });
  it('matches aliases', () => {
    expect(detectAdmin('text -Riki')).toBe('Rifqi');
    expect(detectAdmin('text -Rifki')).toBe('Rifqi');
    expect(detectAdmin('text -Julian')).toBe('Julian');
  });
  it('matches case-insensitive', () => {
    expect(detectAdmin('text -RF')).toBe('Rifqi');
    expect(detectAdmin('text -rE')).toBe('Reni');
  });
  it('returns null when no marker', () => {
    expect(detectAdmin('plain text')).toBe(null);
    expect(detectAdmin('')).toBe(null);
    expect(detectAdmin(null)).toBe(null);
  });
});

describe('loadAdminComments', () => {
  it('filters out pre-Aug-1 comments', () => {
    const out = loadAdminComments(SAMPLE);
    expect(out.length).toBe(5);
    expect(out.some((c) => c.id === 'old')).toBe(false);
  });
  it('sorts newest first', () => {
    const out = loadAdminComments(SAMPLE);
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].timestampMs).toBeGreaterThanOrEqual(out[i].timestampMs);
    }
  });
  it('resolves admin from text when admin field missing', () => {
    const out = loadAdminComments(SAMPLE);
    const c5 = out.find((c) => c.id === 'c5');
    expect(c5.admin).toBe('Rifqi');
  });
  it('drops rows with bad timestamp', () => {
    const bad = { comments: [{ id: 'bad', admin: 'Rifqi', timestampMs: -1, commentText: '-Rf' }] };
    expect(loadAdminComments(bad).length).toBe(0);
  });
  it('accepts array input', () => {
    const out = loadAdminComments(SAMPLE.comments);
    expect(out.length).toBe(5);
  });
});

describe('buildAdminKpi', () => {
  it('returns rows for canonical admin order', () => {
    const kpi = buildAdminKpi(loadAdminComments(SAMPLE));
    expect(kpi.map((r) => r.admin)).toEqual(['Reni', 'Rifqi', 'Reta', 'Julian']);
  });
  it('counts own vs external correctly', () => {
    const kpi = buildAdminKpi(loadAdminComments(SAMPLE));
    const rifqi = kpi.find((r) => r.admin === 'Rifqi');
    expect(rifqi.commentCount).toBe(2);
    expect(rifqi.ownPostCount).toBe(0);
    expect(rifqi.externalPostCount).toBe(2);
    const reni = kpi.find((r) => r.admin === 'Reni');
    expect(reni.commentCount).toBe(1);
    expect(reni.ownPostCount).toBe(1);
  });
});

describe('buildMonthlyKpi', () => {
  it('groups by monthKey + admin', () => {
    const m = buildMonthlyKpi(loadAdminComments(SAMPLE));
    expect(m.length).toBeGreaterThan(0);
    for (const row of m) {
      expect(row.monthKey).toMatch(/^\d{4}-\d{2}$/);
      expect(row.commentCount).toBeGreaterThan(0);
    }
  });
  it('sorts month DESC then admin order', () => {
    const m = buildMonthlyKpi(loadAdminComments(SAMPLE));
    for (let i = 1; i < m.length; i++) {
      if (m[i - 1].monthKey !== m[i].monthKey) {
        expect(m[i - 1].monthKey > m[i].monthKey).toBe(true);
      }
    }
  });
});

describe('listCommentMonths', () => {
  it('returns DESC distinct months', () => {
    const months = listCommentMonths(loadAdminComments(SAMPLE));
    for (let i = 1; i < months.length; i++) {
      expect(months[i - 1] > months[i]).toBe(true);
    }
  });
});

describe('groupByPost', () => {
  it('groups comments by postUrl', () => {
    const groups = groupByPost(loadAdminComments(SAMPLE));
    expect(groups.get('https://a/p/1').length).toBe(2);
    expect(groups.get('https://a/p/2').length).toBe(1);
  });
  it('sorts each group newest first', () => {
    const groups = groupByPost(loadAdminComments(SAMPLE));
    for (const arr of groups.values()) {
      for (let i = 1; i < arr.length; i++) {
        expect(arr[i - 1].timestampMs).toBeGreaterThanOrEqual(arr[i].timestampMs);
      }
    }
  });
});

describe('previewCommentText', () => {
  it('strips trailing marker tag', () => {
    expect(previewCommentText('Salut lur, info edukatif! -Rf')).toBe('Salut lur, info edukatif!');
  });
  it('truncates long text', () => {
    const long = 'a'.repeat(200) + ' -Rf';
    const out = previewCommentText(long, 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('extractMarkerTag', () => {
  it('extracts from comment text', () => {
    expect(extractMarkerTag('Salut lur -Rf')).toBe('-rf');
    expect(extractMarkerTag('Btw lur. -Re', null)).toBe('-re');
  });
  it('falls back to admin default marker', () => {
    expect(extractMarkerTag('', 'Rifqi')).toBe('-Rf');
    expect(extractMarkerTag('', 'Julian')).toBe('-Ju');
  });
});