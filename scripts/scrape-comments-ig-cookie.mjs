// scrape-comments-ig-cookie.mjs — Instagram admin-comment scraper via owner session cookie
//
// WHY: there is no free public IG comment endpoint (all anonymous routes are
// dead since ~2026-08-25). The only reliable path is the account owner's own
// IG session cookie → android private API, same auth as scrape-ig-cookie.mjs.
//
// Endpoints:
//   - /api/v1/feed/user/{pk}/?count=...             (posts, already scraped)
//   - /api/v1/media/{mediaId}/comments/?count=...   (comment list, paginated via next_max_id)
//   - /api/v1/media/shortcode/{code}/info/          (resolve external shortcode → media pk)
//
// Scope (user clarification 2026-08-30): the Komentar Admin tab must record
// EVERY admin comment left from the majangmejeng_ account (Instagram branch),
// on its own posts AND on other people's posts. Own posts come from
// scripts/scraped/ig-majangmejeng_.json; external posts come from
// comment-scan-extras.json → ig[]. Filtered to FILTER_START_MS (2026-08-01).
//
// What gets recorded: only comments whose text matches an admin marker
// (-Re / -Rf / -Rm / -Ju with aliases) — same rule as the manual dataset +
// TT scraper. Non-admin comments are ignored (dashboard tracks admins only).
//
// Auth: env IG_SESSION_COOKIE = full cookie header from the owner's logged-in
// browser, e.g. "sessionid=ABC...; csrftoken=XYZ...; mid=..." (copy from
// DevTools → Application → Cookies → instagram.com).
//
// Fail soft: no cookie / invalid session / transient error → keep existing
// scraped comment data and exit 2 (workflow surfaces warning, deploy continues).
//
// Usage:
//   node scripts/scrape-comments-ig-cookie.mjs                 # scan majang own + external
//   node scripts/scrape-comments-ig-cookie.mjs limit=200       # cap own posts scanned
//   node scripts/scrape-comments-ig-cookie.mjs slow=1          # conservative pacing (backfill)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'scraped');
const EXTRAS_PATH = path.join(__dirname, 'comment-scan-extras.json');
const OWN_POSTS_PATH = path.join(OUT_DIR, 'ig-majangmejeng_.json');

const COOKIE = process.env.IG_SESSION_COOKIE || '';
const FILTER_START_MS = Date.parse('2026-08-01T00:00:00Z');
const OWN_ACCOUNT = 'ig-majangmejeng_';
const OWN_USERNAME = 'majangmejeng_';

const UA = 'Instagram 219.0.0.12.117 Android (26/8.0.0; 480dpi; 1080x1920; OnePlus; 6T Dev; devitron; qcom; en_US; 314665256)';
const BASE_URL = 'https://i.instagram.com/api/v1';

// Admin marker rules — mirror the canonical `_markerRules` contract.
const ADMIN_PATTERNS = [
  { admin: 'Reni',  tag: '-Re', re: /[-–—]\s*(?:re|reni)\b/i },
  { admin: 'Rifqi', tag: '-Rf', re: /[-–—]\s*(?:rf|riki|rifki|riqi)\b/i },
  { admin: 'Reta',  tag: '-Rm', re: /[-–—]\s*(?:rm|reta)\b/i },
  { admin: 'Julian', tag: '-Ju', re: /[-–—]\s*(?:ju|julian)\b/i }
];
const ADMIN_TAGS = { Reni: '-Re', Rifqi: '-Rf', Reta: '-Rm', Julian: '-Ju' };

function detectAdminTag(text, fallbackAdmin) {
  if (text) {
    const m = String(text).match(/[-–—]\s*(rf|rm|re|ju|riki|rifki|reta|reni|julian)\s*\.?\s*$/i);
    if (m) return `-${m[1].toLowerCase()}`;
  }
  if (fallbackAdmin && ADMIN_TAGS[fallbackAdmin]) return ADMIN_TAGS[fallbackAdmin];
  return '';
}

function detectAdmin(text) {
  if (!text) return null;
  for (const { admin, re } of ADMIN_PATTERNS) {
    if (re.test(text)) return admin;
  }
  return null;
}

function csrftokenFrom() {
  const m = COOKIE.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return m ? m[1] : '';
}

function igHeaders() {
  return {
    'User-Agent': UA,
    'X-IG-App-ID': '936619743392459',
    'X-CSRFToken': csrftokenFrom(),
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://www.instagram.com',
    'Referer': 'https://www.instagram.com/',
    'Cookie': COOKIE,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site'
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (base) => base + Math.random() * 1500;
const SLOW = process.argv.includes('slow=1');
const pageDelayMs = SLOW ? 6000 : 3000;

// Parse args.
const argNum = (name) => {
  const a = process.argv.find((x) => x.startsWith(`${name}=`));
  const n = Number(a?.split('=')[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const ownLimit = argNum('limit') || 100000;

async function igGet(path, { retries = 0 } = {}) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: igHeaders(),
      signal: AbortSignal.timeout(30000)
    });
  } catch (e) {
    throw new Error(`network: ${e.message}`);
  }
  const text = await res.text();
  const isLoginWall =
    text.includes('"login_required"') || text.includes('"require_login":true') ||
    (res.status === 401 && /login/i.test(text.slice(0, 200)));
  const throttled = res.status === 429 || res.status === 403 || (res.status === 401 && !isLoginWall);
  if (isLoginWall && retries < 2) {
    console.log(`  [retry] login_required at ${path} — throttle, waiting ${10 * (retries + 1)}s`);
    await sleep(10000 * (retries + 1));
    return igGet(path, { retries: retries + 1 });
  }
  if (isLoginWall) {
    throw Object.assign(new Error(`login_required at ${path}`), { terminal: true });
  }
  if (throttled) {
    throw new Error(`HTTP ${res.status} at ${path}: ${text.slice(0, 120)}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} at ${path}: ${text.slice(0, 120)}`);
  }
  return JSON.parse(text);
}

// Fetch ALL comments on one media, paginated.
async function fetchAllMediaComments(mediaId, { capPages = 40 } = {}) {
  const all = [];
  let maxId = '';
  const seen = new Set();
  let more = true;
  for (let page = 0; page < capPages && more; page++) {
    let p = `/media/${mediaId}/comments/?count=50`;
    if (maxId) p += `&max_id=${encodeURIComponent(maxId)}`;
    const raw = await igGet(p);
    const items = raw.comments ?? [];
    let gotNew = 0;
    for (const c of items || []) {
      if (!c || c.pk == null) continue;
      if (!seen.has(c.pk)) { seen.add(c.pk); all.push(c); gotNew++; }
    }
    more = Boolean(raw.has_more_headload_comments ?? raw.next_max_id ?? false);
    maxId = raw.next_max_id ?? '';
    if (!maxId) more = false;
    if (items.length > 0 && maxId) await sleep(jitter(pageDelayMs));
  }
  return all;
}

// Resolve an external shortcode → { mediaId, takenAtEpochMs, commentCount }.
async function resolveShortcode(code) {
  const raw = await igGet(`/media/shortcode/${code}/info/`);
  const m = raw?.items?.[0] ?? raw?.media ?? null;
  if (!m || !m.pk) throw new Error(`can't resolve shortcode ${code}`);
  return {
    mediaId: String(m.pk),
    takenAtMs: (Number(m.taken_at) || 0) * 1000,
    commentCount: Number(m.comment_count) || 0
  };
}

function normalize(raw, { postId, postUrl, postOwner, isOwnPost }) {
  const text = String(raw.text ?? '');
  const admin = detectAdmin(text);
  if (!admin) return null;
  const ts = (Number(raw.created_at) || Number(raw.created_at_utc) || 0) * 1000;
  if (!Number.isFinite(ts) || ts <= 0 || ts < FILTER_START_MS) return null;
  return {
    platform: 'instagram',
    postId,
    postUrl,
    postOwner,
    isOwnPost,
    accountSlug: isOwnPost ? OWN_ACCOUNT : '',
    admin,
    adminTag: detectAdminTag(text, admin),
    commentText: text,
    timestampMs: ts,
    userHandle: raw.user?.username || raw.user?.full_name || ''
  };
}

async function readJson(p) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return null; }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  if (!COOKIE) {
    console.error('::error::IG_SESSION_COOKIE env not set — skipping authenticated IG comment scrape.');
    process.exit(2);
  }

  // ── Candidate posts ──────────────────────────────────────────────────────
  // 1. Own posts (majangmejeng_) since Aug 1, newest first.
  const ownPayload = await readJson(OWN_POSTS_PATH);
  const ownPosts = (ownPayload?.posts ?? [])
    .filter((p) => {
      const ts = Number(p.timestampMs ?? p.timestamp ?? 0) || (Number(p.createTime ?? 0) * 1000);
      return Number.isFinite(ts) && ts >= FILTER_START_MS;
    })
    .sort((a, b) => (Number(b.timestampMs ?? 0) || 0) - (Number(a.timestampMs ?? 0) || 0))
    .slice(0, ownLimit);
  // Only scan own posts that actually have comments (commentCount > 0) — posts
  // with zero comments can't hold an admin comment and would waste requests.
  const ownWithComments = ownPosts.filter((p) => (Number(p.commentCount) || 0) > 0);
  console.log(`[ig-comments] own posts since Aug1: ${ownPosts.length} (with comments: ${ownWithComments.length})`);

  // 2. External IG posts from comment-scan-extras.json.
  const extras = (await readJson(EXTRAS_PATH))?.ig || [];
  const externalTargets = [];
  for (const ex of extras) {
    const s = String(ex.url ?? '').replace(/\/+$/, '');
    const code = s.includes('/p/') || s.includes('/reel/') || s.includes('/tv/')
      ? s.split('/').pop()
      : '';
    if (!code) continue;
    externalTargets.push({ code, url: ex.url, owner: ex.owner || '' });
  }
  console.log(`[ig-comments] external IG targets: ${externalTargets.length}`);

  // ── Scan ────────────────────────────────────────────────────────────────
  const adminComments = [];
  const postReport = {};
  let postsOk = 0, postsFail = 0;

  const scanComments = async (mediaId, { url, owner, isOwnPost }) => {
    let comments;
    try {
      comments = await fetchAllMediaComments(mediaId);
    } catch (e) {
      throw e;
    }
    const found = [];
    for (const c of comments) {
      const n = normalize(c, { postId: mediaId, postUrl: url, postOwner: owner, isOwnPost });
      if (n) found.push(n);
    }
    adminComments.push(...found);
    return { comments: comments.length, adminFound: found.length };
  };

  // Own posts first (newest first).
  for (const p of ownWithComments) {
    const code = p.shortcode || '';
    let mediaId = String(p.id ?? '');
    if (!mediaId && code) {
      try {
        mediaId = (await resolveShortcode(code)).mediaId;
      } catch { postsFail++; continue; }
    }
    if (!mediaId) continue;
    try {
      const r = await scanComments(mediaId, {
        url: p.postUrl || `https://www.instagram.com/p/${code}/`,
        owner: OWN_USERNAME,
        isOwnPost: true
      });
      postReport[code || mediaId] = { ok: true, owner: OWN_USERNAME, isOwnPost: true, comments: r.comments, adminFound: r.adminFound, fetchedAt: new Date().toISOString() };
      postsOk++;
      console.log(`  [${code || mediaId}] ${r.comments} comments, ${r.adminFound} admin`);
    } catch (e) {
      postsFail++;
      postReport[code || mediaId] = { ok: false, owner: OWN_USERNAME, isOwnPost: true, error: e.message, fetchedAt: new Date().toISOString() };
      console.warn(`  [${code || mediaId}] FAIL: ${e.message.slice(0, 90)}`);
    }
    await sleep(jitter(1500));
  }

  // External posts second.
  for (const ex of externalTargets) {
    try {
      const resolved = await resolveShortcode(ex.code);
      const r = await scanComments(resolved.mediaId, { url: ex.url, owner: ex.owner, isOwnPost: false });
      postReport[ex.code] = { ok: true, owner: ex.owner, isOwnPost: false, comments: r.comments, adminFound: r.adminFound, fetchedAt: new Date().toISOString() };
      postsOk++;
      console.log(`  ext [${ex.code}] ${r.comments} comments, ${r.adminFound} admin`);
    } catch (e) {
      postsFail++;
      postReport[ex.code] = { ok: false, owner: ex.owner, isOwnPost: false, error: e.message, fetchedAt: new Date().toISOString() };
      console.warn(`  ext [${ex.code}] FAIL: ${e.message.slice(0, 90)}`);
    }
    await sleep(jitter(2000));
  }

  const out = {
    scrapedAt: new Date().toISOString(),
    filterStartMs: FILTER_START_MS,
    platform: 'instagram',
    account: OWN_ACCOUNT,
    stats: {
      ownPostsSinceAug1: ownPosts.length,
      ownPostsWithComments: ownWithComments.length,
      externalTargets: externalTargets.length,
      postsOk,
      postsFail,
      adminCommentsFound: adminComments.length
    },
    posts: postReport,
    adminComments
  };

  const dest = path.join(OUT_DIR, 'comments-ig-majangmejeng_.json');
  await fs.writeFile(dest, JSON.stringify(out, null, 2));
  console.log(`\n[ig-comments] summary: ${postsOk}/${postsOk + postsFail} posts OK, ${adminComments.length} admin comments`);
  console.log(`[ig-comments] wrote ${dest}`);

  // Terminal login_required everywhere = cookie dead. Partial success = keep data.
  const failures = Object.values(postReport).filter((r) => !r.ok);
  const terminal = failures.filter((r) => /login_required/i.test(r.error || ''));
  if (postsOk === 0 && failures.length > 0 && terminal.length === failures.length) {
    console.error('::error::IG session cookie invalid/expired — refresh IG_SESSION_COOKIE secret');
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('[ig-comments] fatal:', err);
  process.exit(1);
});
