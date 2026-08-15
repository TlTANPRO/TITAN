// TikTok scraper via FREE methods using Jina proxy (bypasses TikWM rate limit)
// Strategy:
//   1. Load existing scraped data (from ENSEMBLEDATA previous scrape — already 95-100% enriched)
//   2. Use Jina reader to query TikWM /api/user/info (profile freshness: follower, bio)
//   3. Use Jina reader to query TikWM /api/feed/search (find posts by username as keyword)
//   4. Append-only merge with id-based dedup
//
// Jina URL pattern: https://r.jina.ai/{URL} — Jina fetches and returns content
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNTS_TT } from './accounts.mjs';
import { fetchWithRetry, HttpTerminalError } from './lib/http-retry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'scraped');
const DELAY_MS = 3000; // Jina rate limit
const JINA_BASE = 'https://r.jina.ai';
const TIKWM_BASE = 'https://www.tikwm.com/api';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// DDG-via-Jina: returns list of recent video IDs for a username via DuckDuckGo
// videos tab. Jina's HTML render preserves tiktok.com/@user/video/<19digit> links
// in the search results. Returns 1-5 IDs per query (DDG limits free captures).
// Used to feed TikWM per-video enrich (which doesn't need auth, just a video URL).
async function fetchTtVideoIdsViaDdg(username) {
  const q = `site:tiktok.com "${username}"`;
  const proxyUrl = `${JINA_BASE}/https://duckduckgo.com/?q=${encodeURIComponent(q)}&ia=videos&iax=videos`;
  const r = await fetchWithRetry(proxyUrl, {
    headers: { 'Accept': 'application/json', 'X-Respond-With': 'json' },
    signal: AbortSignal.timeout(20000)
  }, { tag: `Jina-DDG@${username}`, maxAttempts: 2 });
  const text = await r.text();
  let j;
  try { j = JSON.parse(text); } catch { throw new Error(`Jina non-JSON (DDG): ${text.slice(0, 200)}`); }
  const c = j?.data?.content ?? '';
  // Extract user-scoped video IDs only: tiktok.com/@<username>/video/<digits>
  const re = new RegExp(`tiktok\\.com/@${username.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}/video/(\\d{15,20})`, 'g');
  const ids = new Set();
  let m;
  while ((m = re.exec(c)) !== null) ids.add(m[1]);
  return [...ids];
}

// TikWM per-video enrichment (still works without CAPTCHA, weirdly).
// Endpoint: https://www.tikwm.com/api/?url=https://www.tiktok.com/@user/video/<id>
// Returns: { data: { id, title, create_time, digg_count, comment_count, share_count, play_count, ... } }
async function enrichTtVideo(videoId, username) {
  const url = `${TIKWM_BASE}/?url=${encodeURIComponent(`https://www.tiktok.com/@${username}/video/${videoId}`)}`;
  const r = await fetchWithRetry(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(20000)
  }, { tag: `TikWM-perVideo@${videoId}`, maxAttempts: 3 });
  const j = await r.json();
  if (j.code !== 0 || !j.data) return null;
  return j.data;
}

async function jinaGet(fullUrl, tag = 'Jina') {
  // Jina reader: GET https://r.jina.ai/{url}
  const proxyUrl = `${JINA_BASE}/${fullUrl}`;
  const res = await fetchWithRetry(proxyUrl, {
    headers: { 'Accept': 'application/json', 'X-Respond-With': 'json' },
    signal: AbortSignal.timeout(30000)
  }, { tag, maxAttempts: 3 });
  const text = await res.text();
  let j;
  try { j = JSON.parse(text); } catch { throw new Error(`Jina returned non-JSON: ${text.slice(0, 200)}`); }
  // Jina wraps: { code, status, data: { content, ... } }
  if (j?.data?.content) {
    try { return JSON.parse(j.data.content); } catch { throw new Error(`TikWM returned non-JSON: ${j.data.content.slice(0, 200)}`); }
  }
  throw new Error(`Unexpected Jina shape: ${text.slice(0, 200)}`);
}

async function getProfile(uniqueId) {
  const url = `${TIKWM_BASE}/user/info?unique_id=${encodeURIComponent(uniqueId)}`;
  const j = await jinaGet(url, `Jina-TT-profile@${uniqueId}`);
  if (j.code !== 0) throw new Error(`TikWM error: ${j.msg}`);
  const u = j.data.user;
  const s = j.data.stats;
  return {
    uniqueId: u.uniqueId,
    username: u.uniqueId,
    nickname: u.nickname,
    fullName: u.nickname,
    avatarUrl: u.avatarLarger || u.avatarMedium || u.avatarThumb || '',
    signature: u.signature || '',
    bio: u.signature || '',
    biography: u.signature || '',
    verified: Boolean(u.verified),
    followerCount: s.followerCount ?? 0,
    followingCount: s.followingCount ?? 0,
    heartCount: s.heartCount ?? 0,
    videoCount: s.videoCount ?? 0,
    postCount: s.videoCount ?? 0
  };
}

// V28: NEW free method — Jina reader for tiktok.com/@user web profile.
// Renders the public profile page and extracts Followers/Following/Likes counts.
// Faster than TikWM /user/info (no rate limit), but doesn't return avatar or bio
// as reliably. Used as primary source; falls back to TikWM if parsing fails.
//
// Jina returns Markdown-like content with bold counts: **9902**Followers
// Returns: { ok, followerCount, followingCount, heartCount, bio, source }
async function getProfileJina(uniqueId) {
  const url = `https://www.tiktok.com/@${uniqueId}`;
  const proxyUrl = `${JINA_BASE}/${url}`;
  const r = await fetchWithRetry(proxyUrl, {
    headers: { 'Accept': 'application/json', 'X-Respond-With': 'json' },
    signal: AbortSignal.timeout(20000)
  }, { tag: `Jina-TT-web@${uniqueId}`, maxAttempts: 3 });
  const text = await r.text();
  let j;
  try { j = JSON.parse(text); } catch { throw new Error(`Jina non-JSON: ${text.slice(0, 200)}`); }
  const c = j?.data?.content;
  if (!c) throw new Error('Jina missing data.content');

  // Counts: **180**Following / **9902**Followers / **29.3K**Likes
  // Use lookbehind to require the bold-marker (**) before the number.
  const m = (re) => {
    const match = c.match(re);
    if (!match) return 0;
    return parseCountString(match[1]);
  };
  const followingCount = m(/\*\*([\d.,KMB]+)\*\*\s*Following/i);
  const followerCount = m(/\*\*([\d.,KMB]+)\*\*\s*Followers/i);
  const heartCount = m(/\*\*([\d.,KMB]+)\*\*\s*Likes/i);

  // Bio: first ## line that isn't a count header. Some profiles have the
  // "## suka bercanda..." bio section, others have a 2nd "## " line with
  // a translation note. Skip any line whose body starts with ** (bolded counts).
  const bioMatch = c.match(/## ([^*\n#][^\n#]+)/);
  const bio = bioMatch ? bioMatch[1].trim() : '';

  return {
    followerCount,
    followingCount,
    heartCount,
    bio,
    source: 'jina-web'
  };
}

// Parse "29.3K" / "1.2M" / "9902" → integer
function parseCountString(s) {
  if (!s) return 0;
  const cleaned = String(s).replace(/,/g, '').trim();
  const m = cleaned.match(/^([\d.]+)\s*([KMB]?)$/i);
  if (!m) return 0;
  const num = parseFloat(m[1]);
  const suffix = (m[2] || '').toUpperCase();
  const mult = suffix === 'K' ? 1e3 : suffix === 'M' ? 1e6 : suffix === 'B' ? 1e9 : 1;
  return Math.round(num * mult);
}

async function searchVideos(keyword, maxPages = 3) {
  const allVideos = [];
  let cursor = 0;
  let hasMore = true;
  for (let p = 0; p < maxPages && hasMore; p++) {
    const url = `${TIKWM_BASE}/feed/search?keywords=${encodeURIComponent(keyword)}&count=30&cursor=${cursor}&web=1`;
    let j;
    try { j = await jinaGet(url, `Jina-TT-search@${keyword}`); } catch (e) {
      console.log(`  search page ${p+1} failed: ${e.message.slice(0, 60)}`);
      break;
    }
    if (j.code !== 0) break;
    const videos = j.data?.videos ?? [];
    if (videos.length === 0) break;
    allVideos.push(...videos);
    cursor = j.data.cursor ?? 0;
    hasMore = j.data.hasMore ?? false;
    console.log(`  search page ${p+1}: ${videos.length} videos (total ${allVideos.length}), hasMore=${hasMore}`);
    if (hasMore) await sleep(DELAY_MS);
  }
  return allVideos;
}

function extractHashtags(text) {
  const m = text.matchAll(/#([\p{L}0-9_]+)/gu);
  return [...m].map((x) => '#' + x[1].toLowerCase());
}
function extractMentions(text) {
  const m = text.matchAll(/@([\w.]+)/g);
  return [...m].map((x) => '@' + x[1].toLowerCase());
}

function normalizeTtVideo(v) {
  const id = String(v.video_id ?? v.aweme_id ?? '');
  if (!id) return null;
  const durSec = Number(v.duration ?? 0);
  const cover = v.cover || v.origin_cover || '';
  return {
    id,
    description: String(v.title ?? ''),
    caption: String(v.title ?? ''),
    createTime: Number(v.create_time ?? 0),
    timestamp: Number(v.create_time ?? 0) * 1000,
    coverUrl: typeof cover === 'string' ? cover : (cover.url_list?.[0] ?? ''),
    videoUrl: String(v.share_url ?? ''),
    playCount: Number(v.play_count ?? 0),
    diggCount: Number(v.digg_count ?? 0),
    likeCount: Number(v.digg_count ?? 0),
    commentCount: Number(v.comment_count ?? 0),
    shareCount: Number(v.share_count ?? 0),
    collectCount: Number(v.collect_count ?? 0),
    saveCount: Number(v.collect_count ?? 0),
    durationSeconds: durSec,
    duration: durSec,
    mediaType: durSec > 0 ? 'VIDEO' : 'IMAGE',
    hashtags: extractHashtags(v.title ?? ''),
    mentions: extractMentions(v.title ?? ''),
    musicTitle: v.music_info?.title ?? '',
    musicAuthor: v.music_info?.author ?? ''
  };
}

function mergePosts(existingPosts, newPosts) {
  const byId = new Map();
  for (const p of existingPosts || []) {
    if (p?.id) byId.set(String(p.id), { ...p });
  }
  let addedCount = 0;
  let upgradedCount = 0;
  for (const np of newPosts) {
    if (!np?.id) continue;
    const key = String(np.id);
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, np);
      addedCount++;
    } else {
      let changed = false;
      for (const f of ['likeCount', 'commentCount', 'viewCount', 'shareCount', 'collectCount', 'saveCount', 'playCount', 'diggCount']) {
        const nVal = Number(np[f] ?? 0);
        const eVal = Number(existing[f] ?? 0);
        if (nVal > eVal) { existing[f] = nVal; changed = true; }
      }
      for (const f of ['coverUrl', 'videoUrl', 'mediaType', 'description', 'caption']) {
        if (!existing[f] && np[f]) { existing[f] = np[f]; changed = true; }
      }
      if ((!existing.hashtags || existing.hashtags.length === 0) && np.caption) {
        existing.hashtags = extractHashtags(np.caption);
        existing.mentions = extractMentions(np.caption);
        changed = true;
      }
      if (changed) upgradedCount++;
    }
  }
  const merged = Array.from(byId.values());
  merged.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  return { merged, addedCount, upgradedCount };
}

async function atomicWriteJson(filepath, data) {
  const tmp = filepath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, filepath);
}

async function scrapeAccount(account) {
  const startTime = Date.now();
  const username = account.username;
  const outPath = path.join(OUT_DIR, `${account.slug}.json`);
  console.log(`\n[TT-FREE] @${username} — starting`);

  let existing = null;
  try {
    existing = JSON.parse(await fs.readFile(outPath, 'utf-8'));
    console.log(`  loaded existing: ${(existing.posts ?? []).length} posts`);
  } catch {
    console.log(`  no existing file`);
  }

  // Profile: try Jina web profile (NEW, V28) first — faster, no rate limit.
  // Falls back to TikWM /user/info if Jina fails or returns incomplete data.
  let profile = null;
  let jinaFailed = null;
  try {
    const jinaProfile = await getProfileJina(username);
    if (jinaProfile.followerCount > 0) {
      const existingAccInner = existing?.account ?? account;
      profile = {
        username,
        uniqueId: username,
        nickname: existingAccInner.nickname || existingAccInner.fullName || username,
        fullName: existingAccInner.fullName || existingAccInner.nickname || username,
        avatarUrl: existingAccInner.avatarUrl || '',
        signature: jinaProfile.bio || existingAccInner.signature || '',
        bio: jinaProfile.bio || existingAccInner.bio || '',
        biography: jinaProfile.bio || existingAccInner.biography || '',
        verified: existingAccInner.verified ?? false,
        followerCount: jinaProfile.followerCount,
        followingCount: jinaProfile.followingCount,
        heartCount: jinaProfile.heartCount,
        videoCount: existingAccInner.videoCount || existingAccInner.postCount || 0,
        postCount: existingAccInner.postCount || existingAccInner.videoCount || 0
      };
      console.log(`  Jina profile: ${profile.followerCount} followers, ${profile.followingCount} following, ${profile.heartCount} likes`);
    } else {
      jinaFailed = 'Jina returned 0 followers (profile may be private or page changed)';
    }
  } catch (e) {
    jinaFailed = e.message.slice(0, 80);
  }

  if (!profile) {
    try {
      profile = await getProfile(username);
      console.log(`  TikWM fallback: ${profile.followerCount} followers, ${profile.videoCount} videos, ${profile.nickname}${jinaFailed ? ` (Jina: ${jinaFailed})` : ''}`);
    } catch (e) {
      console.log(`  profile fetch failed: ${e.message.slice(0, 80)}`);
    }
  }

  // Search posts (best effort) — tiered fallback.
  // Tier A: DDG-via-Jina for video IDs + TikWM per-video for metrics.
  //         DDG returns 1-5 IDs per query; enrich each via TikWM per-video.
  // Tier B: TikWM /feed/search via Jina (still mostly CAPTCHA-blocked, but cheap).
  // Tier C: bundled preservation (existing posts kept as-is).
  let videos = [];
  let source = 'bundled-preservation';
  try {
    const ids = await fetchTtVideoIdsViaDdg(username);
    if (ids.length > 0) {
      console.log(`  DDG-via-Jina: ${ids.length} video IDs`);
      const enriched = [];
      for (const id of ids) {
        try {
          const data = await enrichTtVideo(id, username);
          if (data) {
            const normalized = normalizeTtVideo({
              video_id: data.id,
              create_time: data.create_time,
              title: data.title,
              cover: data.cover,
              origin_cover: data.origin_cover,
              duration: data.duration,
              play_count: data.play_count,
              digg_count: data.digg_count,
              comment_count: data.comment_count,
              share_count: data.share_count,
              collect_count: data.collect_count,
              share_url: data.share_url ?? `https://www.tiktok.com/@${username}/video/${id}`,
              music_info: data.music_info
            });
            if (normalized) enriched.push(normalized);
          }
        } catch (e) {
          console.log(`  per-video enrich ${id} failed: ${e.message.slice(0, 60)}`);
        }
      }
      if (enriched.length > 0) {
        videos = enriched;
        source = 'tikwm-per-video (via DDG-Jina)';
        console.log(`  enriched ${enriched.length} videos via TikWM per-video`);
      }
    } else {
      console.log(`  DDG-Jina returned 0 IDs, falling through`);
    }
  } catch (e) {
    console.log(`  DDG-Jina failed: ${e.message.slice(0, 80)}`);
  }

  if (videos.length === 0) {
    try {
      console.log(`  trying TikWM /feed/search via Jina...`);
      const raw = await searchVideos(username, 3);
      videos = raw
        .filter((v) => v.author?.unique_id === username)
        .map(normalizeTtVideo)
        .filter(Boolean);
      if (videos.length > 0) source = 'tikwm feed/search (via Jina)';
      console.log(`  got ${raw.length} search results, ${videos.length} by @${username}`);
    } catch (e) {
      console.log(`  search skipped: ${e.message.slice(0, 80)}`);
    }
  }

  await sleep(DELAY_MS);

  const { merged, addedCount, upgradedCount } = mergePosts(existing?.posts, videos);
  console.log(`  merge: +${addedCount} new posts, ${upgradedCount} upgraded, total=${merged.length}`);

  const existingAcc = existing?.account ?? account;
  const newAccount = {
    ...existingAcc,
    username: profile?.username || existingAcc.username,
    nickname: profile?.nickname || existingAcc.nickname,
    fullName: profile?.fullName || existingAcc.fullName,
    avatarUrl: profile?.avatarUrl || existingAcc.avatarUrl,
    bio: profile?.bio || existingAcc.bio,
    biography: profile?.biography || existingAcc.biography,
    signature: profile?.signature || existingAcc.signature,
    verified: profile?.verified ?? existingAcc.verified,
    followerCount: profile?.followerCount || existingAcc.followerCount,
    followingCount: profile?.followingCount || existingAcc.followingCount,
    heartCount: profile?.heartCount || existingAcc.heartCount,
    postCount: profile?.videoCount || existingAcc.postCount,
    videoCount: profile?.videoCount || existingAcc.videoCount
  };

  const out = {
    platform: 'tiktok',
    account: newAccount,
    posts: merged,
    scrapedAt: new Date().toISOString(),
    lastFreeEnrichAt: new Date().toISOString(),
    stats: {
      totalPosts: merged.length,
      durationMs: Date.now() - startTime,
      isDummy: false,
      enriched: true,
      enrichmentSource: source,
      newPostsAdded: addedCount,
      metricsUpgraded: upgradedCount
    }
  };

  await atomicWriteJson(outPath, out);
  const sec = Math.round((Date.now() - startTime) / 1000);
  console.log(`[TT-FREE] @${username} — DONE. ${merged.length} posts (${sec}s)`);
  return out;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const args = process.argv.slice(2);
  const onlySlug = args.find((a) => a.startsWith('only='))?.split('=')[1];
  const results = [];
  for (const account of ACCOUNTS_TT) {
    if (onlySlug && account.slug !== onlySlug) continue;
    try {
      const r = await scrapeAccount(account);
      results.push({
        slug: account.slug,
        ok: true,
        total: r.posts.length,
        added: r.stats?.newPostsAdded ?? 0,
        upgraded: r.stats?.metricsUpgraded ?? 0,
        source: r.stats?.enrichmentSource ?? 'unknown'
      });
    } catch (err) {
      console.error(`[TT-FREE] @${account.username} — FAILED: ${err.message}`);
      results.push({ slug: account.slug, ok: false, error: err.message });
    }
    await sleep(DELAY_MS);
  }
  console.log(`\n=== TT-FREE SCRAPE COMPLETE ===`);
  console.log('Results:', JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok);
  // V32.4: detect silent zero-new scrape. UPGRADED this to consider metric
  // upgrades: if DDG-Jina found video IDs and TikWM per-video enriched them,
  // that's a real refresh (likes/comments/views bumped). Only exit-2 when
  // ALL accounts returned 0 new AND 0 upgraded — truly no signal at all.
  const okResults = results.filter((r) => r.ok);
  const totallySilent = okResults.filter((r) => (r.added ?? 0) === 0 && (r.upgraded ?? 0) === 0).length;
  if (okResults.length > 0 && totallySilent === okResults.length) {
    console.log(`\n⚠️  V32.4: ${totallySilent}/${okResults.length} TT account(s) returned 0 new posts AND 0 metric upgrades.`);
    console.log(`   Likely cause: Jina / TikWM / DDG all blocked or rate-limited.`);
    console.log(`   Existing data preserved, but today's deploy has the SAME posts as yesterday.`);
    process.exit(2);
  }
  if (failed.length > 0) {
    console.log(`\n${failed.length} account(s) failed:`, failed);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
