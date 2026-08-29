// Unit test for scrape-ig-cookie.mjs + scrape-tt-cookie.mjs pure functions
// Run: node scripts/_unit-test-cookies.mjs
import { parsePagePosts, normalizeItem, mergePosts, hashtagsFrom } from './scrape-tt-cookie.mjs';
import { normalizeMedia, mergePosts as mergeIg, extractHashtags } from './scrape-ig-cookie.mjs';

let passed = 0, failed = 0;
function assert(name, cond, detail) {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name} — ${detail ?? ''}`); }
}

// ---------- TikTok SIGI_STATE shape A ----------
const sigiHtml = `<html><head><script id="SIGI_STATE" type="application/json">${JSON.stringify({
  ItemModule: {
    7001: { id: '7001', desc: 'Hello #world @tester testing #World', createTime: 1000,
      stats: { diggCount: 5, shareCount: 2, commentCount: 3, playCount: 100 },
      video: { duration: 12, cover: { urlList: ['https://c/7001.jpg'] }, playAddr: { urlList: ['https://v/7001.mp4'] } },
      author: { uniqueId: 'majangmejeng_' } },
    7002: { id: '7002', desc: 'Other user post', createTime: 900,
      stats: { diggCount: 1, commentCount: 0, playCount: 50 },
      video: { duration: 5, cover: { urlList: ['https://c/7002.jpg'] } },
      author: { uniqueId: 'someone_else' } }
  }
})}</script></head></html>`;

const posts = parsePagePosts(sigiHtml, 'majangmejeng_');
assert('TT SIGI parse returns only owner posts', posts.length === 1, `got ${posts.length}`);
assert('TT desc/caption mapped', posts[0].caption === 'Hello #world @tester testing #World');
assert('TT stats mapped', posts[0].likeCount === 5 && posts[0].commentCount === 3 && posts[0].viewCount === 100);
assert('TT hashtags deduped+lowercased', JSON.stringify(posts[0].hashtags) === JSON.stringify(['#world']), JSON.stringify(posts[0].hashtags));
assert('TT id format username-id', posts[0].id === 'majangmejeng_-7001');
assert('TT shortcode', posts[0].shortcode === '7001');
assert('TT timestamp', posts[0].timestamp === 1000000 && posts[0].createTime === 1000);
assert('TT postUrl', posts[0].postUrl === 'https://www.tiktok.com/@majangmejeng_/video/7001');
assert('TT thumbnail', posts[0].thumbnailUrl === 'https://c/7001.jpg');

// ---------- TikTok UNIVERSAL_DATA shape B ----------
const uniHtml = `<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({
  __DEFAULT_SCOPE__: { 'webapp.user-detail': { itemList: {
    vid: [{ id: '8001', desc: 'vid B', createTime: 500,
      stats: { diggCount: 7, shareCount: 1, commentCount: 2, playCount: 333 },
      video: { duration: 8, cover: { urlList: ['https://c/8001.jpg'] } }, author: {} }] } } }
})}</script></html>`;
const postsB = parsePagePosts(uniHtml, 'majangmejeng_');
assert('TT UNIVERSAL shape parsed', postsB.length === 1 && postsB[0].shortcode === '8001' && postsB[0].viewCount === 333, `got ${postsB.length}`);

// ---------- TikTok merge append-only + MAX ----------
const { merged, added, upgraded } = mergePosts(
  [{ id: 'majangmejeng_-7001', shortcode: '7001', createTime: 1000, timestamp: 1000000, likeCount: 5, caption: 'old', hashtags: [] }],
  [{ id: 'majangmejeng_-7001', shortcode: '7001', createTime: 1000, timestamp: 1000000, likeCount: 99, commentCount: 10, caption: 'old' },
   { id: 'majangmejeng_-9000', shortcode: '9000', createTime: 2000, timestamp: 2000000, likeCount: 1, caption: 'new post', hashtags: ['#hi'] }]
);
assert('TT merge dedup', merged.length === 2, `got ${merged.length}`);
const upg7001 = merged.find((p) => p.shortcode === '7001');
assert('TT merge MAX stats', upg7001?.likeCount === 99 && upg7001?.commentCount === 10, JSON.stringify(merged));
assert('TT merge counts added=1 upgraded=1', added === 1 && upgraded === 1, `a=${added} u=${upgraded}`);
assert('TT hashtagsFrom on empty', hashtagsFrom('no tags here').length === 0);

// ---------- Instagram normalize ----------
const igItem = {
  id: 12345, code: 'ABC123', taken_at: 1700000000,
  like_count: 42, comment_count: 7, view_count: 999, save_count: 3,
  media_type: 2, product_type: 'clips', video_duration: 9,
  caption: { text: 'IG post #tag1 #tag1 @user' },
  image_versions2: { candidates: [{ url: 'https://ig/thumb.jpg' }] },
  video_versions: [{ url: 'https://ig/v.mp4' }]
};
const n = normalizeMedia(igItem);
assert('IG normalize mediaType REEL', n.mediaType === 'REEL');
assert('IG normalize shortcode', n.shortcode === 'ABC123');
assert('IG normalize counts', n.likeCount === 42 && n.viewCount === 999 && n.saveCount === 3);
assert('IG hashtags not set in normalize', n.hashtags === undefined, JSON.stringify(n.hashtags));
assert('IG hashtags fn lowercases', JSON.stringify(extractHashtags('IG post #Tag1 #tag1 @user')) === JSON.stringify(['#tag1', '#tag1']), JSON.stringify(extractHashtags('IG post #Tag1 #tag1 @user')));

const { merged: mIg, addedCount: aIg, upgradedCount: uIg } = mergeIg(
  [{ id: 'x', shortcode: 'ABC123', timestamp: 1700000000, likeCount: 1, commentCount: 1 }],
  [normalizeMedia(igItem), { id: 'y', shortcode: 'NEW1', timestamp: 1700000100, likeCount: 0, caption: '#hello' }]
);
assert('IG merge dedup + MAX', mIg.length === 2 && mIg.find((p) => p.shortcode === 'ABC123').likeCount === 42 && mIg.find((p) => p.shortcode === 'ABC123').commentCount === 7, JSON.stringify(mIg));
assert('IG merge added=1 upgraded=1', aIg === 1 && uIg === 1, `a=${aIg} u=${uIg}`);
assert('IG merge fills hashtags on added', mIg.find((p) => p.shortcode === 'NEW1').hashtags.join(',') === '#hello', JSON.stringify(mIg.find((p) => p.shortcode === 'NEW1')));

// ---------- IG carousel ----------
const carousel = normalizeMedia({ id: 2, code: 'CAR1', taken_at: 5, media_type: 8, caption: { text: '' } });
assert('IG carousel mediaType', carousel.mediaType === 'CAROUSEL_ALBUM');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);