// Unit tests for scrape-avatars-ig — fixture from REAL embed page (2026-08-23)
import { describe, it, expect } from 'vitest';
import { extractProfilePicUrls, validateAvatar } from './scrape-avatars-ig.mjs';

// REAL fragment from instagram.com/reel/DZtx3nUzmoV/embed/ HTML
const REAL_EMBED_HTML = `<html>...src="https://static.cdninstagram.com/rsrc.php/v4/yS/r/DSM-wzKjiMn.js"...
https://scontent.cdninstagram.com/v/t51.82787-19/685703204_18082653416230535_826891582451521014_n.jpg?stp=dst-jpg_s100x100_tt6&amp;_nc_cat=106&amp;ccb=7-5&amp;_nc_sid=bf7eb4&amp;efg=eyJ2ZW...
<img src="https://scontent.cdninstagram.com/v/t51.82787-19/685703204_18082653416230535_826891582451521014_n.jpg?stp=dst-jpg_s100x100_tt6&amp;_nc_cat=106">...`;

// Minimal magic bytes
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.alloc(3000, 1)]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, ...Buffer.alloc(3000, 1)]);
const HTML_BYTES = Buffer.from('<html>403 Forbidden</html>');

describe('extractProfilePicUrls', () => {
  it('extracts signed scontent URL from real embed HTML and decodes entities', () => {
    const urls = extractProfilePicUrls(REAL_EMBED_HTML);
    expect(urls.length).toBeGreaterThanOrEqual(1);
    expect(urls[0]).toContain('scontent.cdninstagram.com/v/t51.82787-19/');
    expect(urls[0]).not.toContain('&amp;');
    expect(urls[0]).toContain('_nc_cat=106');
  });

  it('ignores static.cdninstagram resources', () => {
    const urls = extractProfilePicUrls(REAL_EMBED_HTML);
    for (const u of urls) expect(u).not.toContain('static.cdninstagram.com');
  });

  it('returns empty for HTML without profile pic', () => {
    expect(extractProfilePicUrls('<html>login wall</html>')).toEqual([]);
  });
});

describe('validateAvatar', () => {
  it('accepts valid JPEG', () => {
    const { errors } = validateAvatar(JPEG, new Set());
    expect(errors).toEqual([]);
  });

  it('accepts valid PNG', () => {
    const { errors } = validateAvatar(PNG, new Set());
    expect(errors).toEqual([]);
  });

  it('rejects HTML error page (the og:image login-wall bug)', () => {
    const { errors } = validateAvatar(HTML_BYTES, new Set());
    expect(errors).toContain('not JPEG/PNG');
    expect(errors).toContain(`too small (${HTML_BYTES.length}b)`);
  });

  it('rejects duplicate image bytes across accounts', () => {
    const seen = new Set();
    validateAvatar(JPEG, seen);
    const { errors, hash } = validateAvatar(JPEG, seen);
    expect(errors).toContain('duplicate image (same bytes as another account)');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
