// Unit tests for scrape-tt-urlebird parsers — fixtures from REAL live responses (2026-08-23)
import { describe, it, expect } from 'vitest';
import { parseProfileListing, parseDetail, idToTimestamp } from './scrape-tt-urlebird.mjs';

// REAL fixture: captured from r.jina.ai/https://urlebird.com/user/majangmejeng_/
const REAL_PROFILE_MD = `[Home](https://urlebird.com/)

[Seorang anak perempuan di bawah umur berinisial SM warga Kec...](https://urlebird.com/video/seorang-anak-perempuan-di-bawah-umur-berinisial-sm-warga-kecamat-7676691411500174612/)

[](https://urlebird.com/video/seorang-anak-perempuan-di-bawah-umur-berinisial-sm-warga-kecamat-7676691411500174612/)

![Image 4: @Majang Mejeng](https://i.axod.net/x.jpeg)

6 days ago

[Lanjutin nyantainya, besok wayahe alakoh pole cak. 📩 Hubungi...](https://urlebird.com/video/lanjutin-nyantainya-besok-wayahe-alakoh-pole-cak-hubungi-kami-u-7677130257551559954/)

[](https://urlebird.com/video/lanjutin-nyantainya-besok-wayahe-alakoh-pole-cak-hubungi-kami-u-7677130257551559954/)

7 hours ago

[INFO LOKER!!! Silahkan mendaftar daripada menunggu 19 juta l...](https://urlebird.com/video/info-loker-silahkan-mendaftar-daripada-menunggu-19-juta-l-7674785794996980999/)

1 week ago
`;

// REAL fixture: captured from r.jina.ai/https://urlebird.com/video/lanjutin-...-7677130257551559954/
const REAL_DETAIL_MD = `## [Majang Mejeng · @majangmejeng_](https://urlebird.com/user/majangmejeng_/)

###### Posted 3 hours ago

 19.41K followers 

 642 views

 3 likes

 0 comments

 1 shares

[𝒏𝒂𝒚𝒃𝒍𝒖𝒆🫧 - original sound](https://urlebird.com/song/original-sound-7647816460810586888/)

# Lanjutin nyantainya, besok wayahe alakoh pole cak. 📩 Hubungi kami untuk kolaborasi, promosi, dan sponsorship. #majangmejeng #wongmajang #AgustusRF
`;

describe('parseProfileListing', () => {
  it('extracts unique video ids from real urlebird markdown', () => {
    const out = parseProfileListing(REAL_PROFILE_MD);
    expect(out).toHaveLength(3);
    expect(out.map((x) => x.id)).toContain('7676691411500174612');
    expect(out.map((x) => x.id)).toContain('7677130257551559954');
  });

  it('dedupes caption-link + empty-link pairs for same id', () => {
    const out = parseProfileListing(REAL_PROFILE_MD);
    const ids = out.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('captures relative time text', () => {
    const out = parseProfileListing(REAL_PROFILE_MD);
    const target = out.find((x) => x.id === '7676691411500174612');
    expect(target.agoText).toBe('6 days ago');
  });

  it('captures the real urlebird slug for detail-page URL', () => {
    const out = parseProfileListing(REAL_PROFILE_MD);
    const target = out.find((x) => x.id === '7676691411500174612');
    expect(target.slug).toBe('seorang-anak-perempuan-di-bawah-umur-berinisial-sm-warga-kecamat-7676691411500174612');
  });

  it('returns empty array for page without videos', () => {
    expect(parseProfileListing('# Home\n[Trending](https://urlebird.com/trending/)')).toEqual([]);
  });
});

describe('idToTimestamp (TikTok snowflake)', () => {
  it('decodes verified real video id to exact UTC time', () => {
    // 7677130257551559954 -> verified 2026-08-23T07:46:19Z (page said "3 hours ago" at 19:30+07)
    expect(idToTimestamp('7677130257551559954')).toBe('2026-08-23T07:46:19.000Z');
  });

  it('returns ISO string', () => {
    expect(idToTimestamp('7676691411500174612')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('parseDetail', () => {
  it('extracts real stats from detail page', () => {
    const d = parseDetail(REAL_DETAIL_MD);
    expect(d.viewCount).toBe(642);
    expect(d.likeCount).toBe(3);
    expect(d.commentCount).toBe(0);
    expect(d.shareCount).toBe(1);
  });

  it('extracts full caption with hashtags (case-normalized)', () => {
    const d = parseDetail(REAL_DETAIL_MD);
    expect(d.caption).toContain('Lanjutin nyantainya');
    expect(d.hashtags).toContain('#majangmejeng');
    expect(d.hashtags).toContain('#wongmajang');
    expect(d.hashtags).toContain('#agustusrf'); // #AgustusRF lowercased
  });

  it('parses K-suffixed follower counts in stats', () => {
    const md = '###### Posted 1 day ago\n\n 1.2K views\n\n 45 likes\n\n 2 comments\n\n 0 shares';
    const d = parseDetail(md);
    expect(d.viewCount).toBe(1200);
    expect(d.likeCount).toBe(45);
  });

  it('returns zeros when stats missing (defensive)', () => {
    const d = parseDetail('no stats here');
    expect(d.viewCount).toBe(0);
    expect(d.hashtags).toEqual([]);
  });
});
