// Normalize post → unified shape for analytics + UI
// Handles both real scraped data (likeCount, viewCount, etc.) and dummy data (likes, views, etc.)
export function normalizePost(raw, platform) {
  if (!raw) return null;
  const id = String(raw.id ?? raw.pk ?? raw.shortcode ?? raw.aweme_id ?? '');
  if (!id) return null;

  const caption = raw.caption ?? raw.desc ?? raw.description ?? raw.accessibility_caption ?? '';

  const createTime = Number(
    raw.createTime ?? raw.taken_at ?? raw.taken_at_timestamp ?? raw.timestamp ?? 0
  );
  const timestamp =
    createTime > 1e12 ? createTime : createTime > 0 ? createTime * 1000 : Number(raw.timestamp ?? 0);

  const mediaType = String(
    raw.mediaType ?? raw.media_type ?? raw.type ?? raw.product_type ?? 'IMAGE'
  ).toUpperCase();

  const likeCount = Number(
    raw.likeCount ?? raw.like_count ?? raw.likes ?? raw.diggCount ?? raw.digg_count ?? 0
  );
  const commentCount = Number(
    raw.commentCount ?? raw.comment_count ?? raw.comments ?? 0
  );
  const viewCount = Number(
    raw.viewCount ?? raw.view_count ?? raw.views ?? raw.playCount ?? raw.play_count ?? 0
  );
  const shareCount = Number(raw.shareCount ?? raw.share_count ?? raw.shares ?? 0);
  const saveCount = Number(raw.saveCount ?? raw.save_count ?? raw.saves ?? raw.collectCount ?? raw.collect_count ?? 0);

  return {
    id,
    shortcode: raw.shortcode ?? raw.code ?? id,
    caption,
    desc: caption,
    createTime,
    timestamp,
    thumbnailUrl:
      raw.thumbnailUrl ??
      raw.thumbnail_url ??
      raw.display_url ??
      raw.coverUrl ??
      raw.cover_url ??
      '',
    videoUrl: raw.videoUrl ?? raw.video_url ?? raw.share_url ?? '',
    postUrl: raw.postUrl ?? (platform === 'tiktok' ? raw.videoUrl : `https://www.instagram.com/p/${raw.shortcode ?? id}/`),
    mediaType,
    type: mediaType,
    isVideo: mediaType === 'VIDEO' || mediaType === 'REEL' || mediaType === 'GRAPHVIDEO',
    likeCount,
    commentCount,
    viewCount,
    playCount: viewCount,
    shareCount,
    saveCount,
    durationSeconds: Number(raw.durationSeconds ?? raw.video_duration ?? raw.duration ?? 0) || 0,
    duration: Number(raw.durationSeconds ?? raw.video_duration ?? raw.duration ?? 0) || 0,
    hashtags: Array.isArray(raw.hashtags)
      ? raw.hashtags
      : extractHashtags(caption),
    mentions: Array.isArray(raw.mentions) ? raw.mentions : extractMentions(caption)
  };
}

export function extractHashtags(text) {
  if (!text) return [];
  const matches = String(text).match(/#[\p{L}\p{N}_]+/gu) ?? [];
  return [...new Set(matches.map((t) => t.toLowerCase()))];
}

export function extractMentions(text) {
  if (!text) return [];
  const matches = String(text).match(/@[\w.]+/g) ?? [];
  return [...new Set(matches.map((m) => m.toLowerCase()))];
}

export function normalizeAccount(raw, platform) {
  if (!raw) return null;
  const a = raw.account ?? raw;
  return {
    platform,
    slug: a.slug ?? `${platform}-${a.username ?? a.uniqueId ?? a.unique_id ?? 'unknown'}`,
    username: a.username ?? a.uniqueId ?? a.unique_id ?? '',
    displayName: a.displayName ?? a.fullName ?? a.nickname ?? a.full_name ?? a.username ?? '',
    fullName: a.fullName ?? a.nickname ?? a.full_name ?? a.displayName ?? '',
    bio: a.bio ?? a.biography ?? a.signature ?? '',
    biography: a.biography ?? a.bio ?? a.signature ?? '',
    avatarUrl:
      a.avatarUrl ??
      a.profilePicUrl ??
      a.profile_pic_url ??
      a.profile_pic_url_hd ??
      a.avatarLarger ??
      a.avatar_larger?.url_list?.[0] ??
      '',
    profilePicUrl:
      a.profilePicUrl ??
      a.profile_pic_url ??
      a.profile_pic_url_hd ??
      a.avatarUrl ??
      '',
    followerCount: Number(a.followerCount ?? a.follower_count ?? 0),
    followingCount: Number(a.followingCount ?? a.following_count ?? 0),
    postCount: Number(a.postCount ?? a.media_count ?? a.videoCount ?? a.aweme_count ?? 0),
    mediaCount: Number(a.media_count ?? a.postCount ?? a.videoCount ?? a.aweme_count ?? 0),
    videoCount: Number(a.videoCount ?? a.aweme_count ?? a.postCount ?? 0),
    isVerified: Boolean(a.verified ?? a.is_verified ?? a.isVerified),
    verified: Boolean(a.verified ?? a.is_verified ?? a.isVerified),
    isPrivate: Boolean(a.isPrivate ?? a.is_private),
    externalUrl: a.externalUrl ?? a.external_url ?? '',
    scrapedAt: raw.scrapedAt ?? new Date().toISOString(),
    posts: Array.isArray(raw.posts) ? raw.posts.map((p) => normalizePost(p, platform)).filter(Boolean) : []
  };
}

export function normalizeAccounts(list) {
  return (list ?? []).map((a) => normalizeAccount(a, a.platform)).filter(Boolean);
}
