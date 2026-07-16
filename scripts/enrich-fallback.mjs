// Free enrichment fallback — pakai tikwm.com (TT) + i.instagram.com (IG)
// Jalankan HANYA kalau ENSEMBLEDATA quota habis atau sebagian besar posts gagal di-enrich.
// Tested 14 Jul 2026 — both methods work tanpa API key.
//
// Keterbatasan:
// - i.instagram.com cuma kasih 12 post terbaru (no pagination)
// - tikwm.com `/api/user/posts` di-block Cloudflare (cuma profil + video detail)
// - Jadi method ini HANYA enrich profile stats + sample 12 post (verifikasi data real)

import 'dotenv/config';
import fs from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_ACCOUNTS } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRAPED_DIR = path.join(__dirname, 'scraped');

// Headers penting untuk IG bypass mobile-only endpoint
const IG_UA = 'Instagram 123.0.0.21.114 Android';
const TIKWM_BASE = 'https://www.tikwm.com/api';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Native https request (avoid Node fetch SecFetch issue with i.instagram.com).
 */
function nativeFetch(urlString, headers = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const req = https.get(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'GET',
        headers: { 'Accept': 'application/json', ...headers },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () =>
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            text: () => Promise.resolve(body),
            json: () => Promise.resolve(JSON.parse(body)),
          })
        );
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.setTimeout(timeoutMs);
  });
}

/**
 * Instagram profil + 12 post terbaru via i.instagram.com (mobile endpoint).
 * Tested 14 Jul 2026 — return full data untuk akun publik.
 */
async function fetchIgWebProfile(username) {
  const url = `https://i.instagram.com/api/v1/users/web_profile_info/?username=${username}`;
  const res = await nativeFetch(url, {
    'User-Agent': IG_UA,
    'Accept': 'application/json',
    'X-IG-App-ID': '936619743392459',
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`IG HTTP ${res.status} - ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const user = json.data?.user;
  if (!user) return null;

  const edges = user.edge_owner_to_timeline_media?.edges ?? [];
  const posts = edges.map((e) => {
    const node = e.node;
    return {
      id: String(node.id ?? ''),
      shortcode: String(node.shortcode ?? ''),
      caption: node.edge_media_to_caption?.edges?.[0]?.node?.text ?? '',
      timestamp: Number(node.taken_at_timestamp ?? 0) * 1000,
      likeCount: Number(node.edge_liked_by?.count ?? 0),
      commentCount: Number(node.edge_media_to_comment?.count ?? 0),
      viewCount: Number(node.video_view_count ?? 0),
      thumbnailUrl: node.thumbnail_src ?? '',
      postUrl: `https://www.instagram.com/p/${node.shortcode}/`,
      mediaType: node.__typename === 'GraphVideo' ? 'VIDEO' : 'IMAGE',
      source: 'ig-mobile-endpoint',
    };
  });

  return {
    followerCount: user.edge_followed_by?.count,
    followingCount: user.edge_follow?.count,
    postCount: user.edge_owner_to_timeline_media?.count,
    biography: user.biography,
    profilePicUrl: user.profile_pic_url_hd ?? user.profile_pic_url,
    verified: user.is_verified,
    isPrivate: user.is_private,
    samplePosts: posts, // 12 post terbaru
  };
}

/**
 * TikTok profil via tikwm.com.
 * Tested 14 Jul 2026 — return user + stats lengkap. /api/user/posts di-block.
 */
async function fetchTikwmProfile(username) {
  const url = `${TIKWM_BASE}/user/info?unique_id=${username}&hd=1`;
  const res = await nativeFetch(url, {});
  if (!res.ok) {
    throw new Error(`Tikwm HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.code !== 0 || !json.data) return null;
  const data = json.data;
  return {
    user: data.user,
    stats: data.stats,
    followerCount: data.stats?.followerCount,
    followingCount: data.stats?.followingCount,
    postCount: data.stats?.videoCount,
    heartCount: data.stats?.heartCount,
    profilePicUrl: data.user?.avatarLarger ?? data.user?.avatarMedium,
    signature: data.user?.signature,
    verified: data.user?.verified,
  };
}

/**
 * Enrich satu post dengan data dari IG mobile endpoint (kalau shortcode match).
 * Returns { updated, fields }.
 */
function enrichPostFromIgSample(post, samplePosts) {
  const sample = samplePosts.find((s) => s.shortcode === post.shortcode);
  if (!sample) return { updated: false, fields: [] };
  const fields = [];
  if (sample.likeCount > 0 && (post.likeCount ?? 0) === 0) {
    post.likeCount = sample.likeCount;
    fields.push('likeCount');
  }
  if (sample.commentCount > 0 && (post.commentCount ?? 0) === 0) {
    post.commentCount = sample.commentCount;
    fields.push('commentCount');
  }
  if (sample.viewCount > 0 && (post.viewCount ?? 0) === 0) {
    post.viewCount = sample.viewCount;
    fields.push('viewCount');
  }
  if (sample.thumbnailUrl && !post.thumbnailUrl) {
    post.thumbnailUrl = sample.thumbnailUrl;
    fields.push('thumbnailUrl');
  }
  return { updated: fields.length > 0, fields };
}

async function main() {
  console.log('[FB-ENRICH] Starting free-method fallback enrichment');
  console.log('[FB-ENRICH] Sources: i.instagram.com (IG), tikwm.com (TT)');
  console.log('');

  let totalAccounts = 0;
  let totalEnriched = 0;
  let totalPostsEnriched = 0;

  for (const acc of ALL_ACCOUNTS) {
    const slug = acc.slug;
    const filePath = path.join(SCRAPED_DIR, `${slug}.json`);

    let data;
    try {
      data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    } catch (err) {
      console.warn(`[FB-ENRICH] ⚠️  ${slug}: no scrape file, skip`);
      continue;
    }

    console.log(`[FB-ENRICH] Processing @${acc.username} (${acc.slug})`);
    totalAccounts++;

    try {
      if (acc.slug.startsWith('ig-')) {
        const result = await fetchIgWebProfile(acc.username);
        if (!result) {
          console.log(`  ⚠️  No data from i.instagram.com`);
          continue;
        }

        // Update profile (hanya kalau ENSEMBLEDATA kasih 0)
        const accFields = [];
        if (result.followerCount && !data.account.followerCount) {
          data.account.followerCount = result.followerCount;
          accFields.push('followerCount');
        }
        if (result.followingCount != null && data.account.followingCount == null) {
          data.account.followingCount = result.followingCount;
          accFields.push('followingCount');
        }
        if (result.postCount && !data.account.postCount) {
          data.account.postCount = result.postCount;
          accFields.push('postCount');
        }
        if (result.biography && !data.account.biography) {
          data.account.biography = result.biography;
          accFields.push('biography');
        }
        if (result.profilePicUrl && !data.account.profilePicUrl) {
          data.account.profilePicUrl = result.profilePicUrl;
          accFields.push('profilePicUrl');
        }
        if (result.verified != null) {
          data.account.verified = result.verified;
          accFields.push('verified');
        }

        // Enrich up to 12 post terbaru yang match
        let postsEnrichedThis = 0;
        for (const post of data.posts ?? []) {
          const { updated, fields } = enrichPostFromIgSample(post, result.samplePosts);
          if (updated) {
            postsEnrichedThis++;
            if (postsEnrichedThis <= 2) {
              console.log(`  → enriched post ${post.shortcode} (+${fields.join(', ')})`);
            }
          }
        }

        console.log(`  ✅ Profile fields updated: ${accFields.length > 0 ? accFields.join(', ') : 'none needed'}`);
        console.log(`  ✅ Posts enriched: ${postsEnrichedThis}/12 sample`);
        totalEnriched++;
        totalPostsEnriched += postsEnrichedThis;
      } else if (acc.slug.startsWith('tt-')) {
        const result = await fetchTikwmProfile(acc.username);
        if (!result) {
          console.log(`  ⚠️  No data from tikwm.com`);
          continue;
        }

        const accFields = [];
        if (result.followerCount && !data.account.followerCount) {
          data.account.followerCount = result.followerCount;
          accFields.push('followerCount');
        }
        if (result.followingCount != null && data.account.followingCount == null) {
          data.account.followingCount = result.followingCount;
          accFields.push('followingCount');
        }
        if (result.postCount && !data.account.postCount) {
          data.account.postCount = result.postCount;
          accFields.push('postCount');
        }
        if (result.heartCount && !data.account.heartCount) {
          data.account.heartCount = result.heartCount;
          accFields.push('heartCount');
        }
        if (result.profilePicUrl && !data.account.profilePicUrl) {
          data.account.profilePicUrl = result.profilePicUrl;
          accFields.push('profilePicUrl');
        }
        if (result.signature && !data.account.biography) {
          data.account.biography = result.signature;
          accFields.push('biography');
        }
        if (result.verified != null) {
          data.account.verified = result.verified;
          accFields.push('verified');
        }

        console.log(`  ✅ Profile fields updated: ${accFields.length > 0 ? accFields.join(', ') : 'none needed'}`);
        console.log(`  ℹ️  Posts tidak di-enrich (tikwm /api/user/posts di-block Cloudflare)`);
        totalEnriched++;
      }

      // Update stats block
      data.stats = data.stats || {};
      data.stats.enrichedWithFreeFallback = true;
      data.stats.freeFallbackAt = new Date().toISOString();

      // Write back
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (err) {
      console.warn(`[FB-ENRICH] ⚠️  ${slug}: ${err.message}`);
    }

    // Rate limit: 1.5s antar akun
    await sleep(1500);
  }

  console.log('');
  console.log('=== FREE FALLBACK COMPLETE ===');
  console.log(`Accounts processed: ${totalAccounts}`);
  console.log(`Accounts enriched: ${totalEnriched}`);
  console.log(`Posts enriched (IG only): ${totalPostsEnriched}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
