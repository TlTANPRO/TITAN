// normalize.test.js — V11 fix: extractHashtags / extractMentions must NOT
// produce doubled prefixes (`##`, `@@`) when upstream data is already
// double-prefixed (e.g. `##ardiantanah`).
import { describe, it, expect } from 'vitest';
import { extractHashtags, extractMentions } from './normalize.js';

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
