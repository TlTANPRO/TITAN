// Admin hashtag mapping — SSOT for the /admin tab.
//
// Maps each admin display name to the hashtag they own. Live captions may
// carry mixed-case variants (#AgustusRE, #agusutsre etc.) but normalize.js
// extractHashtags() lowercases them to #agustusre on every post. Match
// case-insensitively here too as a defensive belt.
//
// To add/rename admins, edit ADMIN_HASHTAGS only — every consumer reads
// from here.
export const ADMIN_HASHTAGS = [
  { name: 'Reni',   hashtag: '#agustusre', source: '#AgustusRE' },
  { name: 'Rifqi',  hashtag: '#agustusrf', source: '#AgustusRF' },
  { name: 'Reta',   hashtag: '#agustusrm', source: '#AgustusRM' },
  { name: 'Julian', hashtag: '#agustusju', source: '#AgustusJU' }
];

// Returns the lowercase hashtag pattern as a Set for fast O(1) lookups.
const HASHTAG_SET = new Set(ADMIN_HASHTAGS.map((a) => a.hashtag));

// Return the admin object for a given hashtag (case-insensitive), or null
// if the tag isn't a known admin marker.
export function findAdminByHashtag(tag) {
  if (!tag) return null;
  const needle = String(tag).toLowerCase();
  return ADMIN_HASHTAGS.find((a) => a.hashtag === needle) ?? null;
}

// All posts across all accounts that carry the admin's hashtag. Each post
// is decorated with _account metadata so the table can render account UI
// without re-walking accounts.
export function getAdminPosts(accounts, admin) {
  if (!admin || !accounts) return [];
  const needle = admin.hashtag.toLowerCase();
  const out = [];
  for (const a of accounts) {
    for (const p of (a.posts ?? [])) {
      const tags = (p.hashtags ?? []).map((t) => String(t).toLowerCase());
      if (tags.includes(needle)) {
        out.push({
          ...p,
          _account: a,
          _accountSlug: a.slug,
          _accountUsername: a.username,
          _accountPlatform: a.platform,
          _accountAvatar: a.localAvatar || a.profilePicUrl
        });
      }
    }
  }
  out.sort((a, b) => (b.createTime ?? 0) - (a.createTime ?? 0));
  return out;
}

// Aggregate per-admin summary across all posts.
export function getAdminSummary(accounts) {
  return ADMIN_HASHTAGS.map((admin) => {
    const posts = getAdminPosts(accounts, admin);
    const totalLikes = posts.reduce((s, p) => s + (Number(p.likeCount) || 0), 0);
    const totalComments = posts.reduce((s, p) => s + (Number(p.commentCount) || 0), 0);
    const totalViews = posts.reduce((s, p) => s + (Number(p.viewCount) || 0), 0);
    return {
      ...admin,
      posts,
      postCount: posts.length,
      totalLikes,
      totalComments,
      totalViews
    };
  });
}

// Re-export the set for code paths that just need to test membership.
export { HASHTAG_SET };