// Aggregate admin comments from raw scraped sources + existing manual dataset.
// Merges scripts/scraped/comments-ig-majangmejeng_.json + comments-tt-majangmejeng_.json
// with existing src/data/admin-comments.json (manual entries).
//
// Output: src/data/admin-comments.json (canonical, committed to repo) +
//         public/data/admin-comments.json (auto-copied by copy-data-to-public.mjs).
//
// Dedup key: id (canonical). Scraped IDs are constructed as
// `${platform}-${postId}-${adminTag}-${timestampMs}` to match manual entries.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRAPED_DIR = path.join(__dirname, 'scraped');
const ROOT_DATA = path.join(__dirname, '..', 'src', 'data', 'admin-comments.json');

const FILTER_START_MS = Date.parse('2026-08-01T00:00:00Z');

// Manual dataset schema (preserve verbatim).
const SCHEMA = {
  _schema: 'TITAN admin-comments dataset v1 — tracks every comment our admins (Reni/Rifqi/Reta/Julian) leave on posts since 2026-08-01. Populated manually + auto-aggregated from scripts/scraped/comments-*.json. Marker rules in _markerRules.',
  _schemaUpdated: new Date().toISOString().slice(0, 10),
  _markerRules: 'Marker tag uses dash-prefix (NOT hashtag) — `-Rf`/`-Rm`/`-Re`/`-Ju`. Optional spacers allowed: `- Rf ` or `-Rf`. Case-insensitive match. Aliases accepted: `-Riki`/`-Rifki` → Rifqi, `-Reta` → Reta, `-Reni` → Reni, `-Julian` → Julian.',
  _fieldDocs: {
    id: 'Synthetic stable ID = `${platform}-${postId}-${adminTag}-${timestampMs}`',
    platform: 'instagram | tiktok',
    accountSlug: 'Which of OUR accounts posted the comment (e.g. ig-majangmejeng_). Empty when account unknown.',
    adminTag: 'Marker tag exactly as written in comment text — e.g. "-Rf"',
    admin: 'Resolved admin name: Reni | Rifqi | Reta | Julian',
    postUrl: 'Full URL to the post we commented on',
    postOwner: 'Owner username of the post we commented on (the post author)',
    commentText: 'Full comment text including marker (preserve for auditing)',
    timestampMs: 'When comment was posted, MS. Vite convention matches post.timestampMs.',
    isOwnPost: 'true if we commented on our own post, false if commented on someone else\'s'
  },
  comments: []
};

// Admin marker canonical forms.
const ADMIN_TAGS = {
  Reni: '-Re',
  Rifqi: '-Rf',
  Reta: '-Rm',
  Julian: '-Ju'
};

function detectAdminTag(text) {
  if (!text) return '';
  const m = text.match(/[-–—]\s*(rf|rm|re|ju|riki|rifki|reta|reni|julian)\s*\.?\s*$/i);
  return m ? `-${m[1].toLowerCase()}` : '';
}

function makeId(platform, postId, admin, ts) {
  const tag = ADMIN_TAGS[admin] ?? '';
  return `${platform}-${postId}-${admin}-${ts}`;
}

function normalize(raw, sourcePlatform) {
  if (!raw) return null;
  const text = String(raw.commentText ?? '');
  const admin = raw.admin ?? null;
  const ts = Number(raw.timestampMs ?? 0);
  if (!Number.isFinite(ts) || ts <= 0 || ts < FILTER_START_MS) return null;
  if (!admin || !ADMIN_TAGS[admin]) return null;
  const platform = raw.platform ?? sourcePlatform;
  if (platform !== 'instagram' && platform !== 'tiktok') return null;

  const postId = String(raw.postId ?? raw.postShortcode ?? '');
  const postUrl = String(raw.postUrl ?? (platform === 'instagram'
    ? `https://www.instagram.com/p/${postId}/`
    : `https://www.tiktok.com/@x/video/${postId}`));

  return {
    id: makeId(platform, postId, admin, ts),
    platform,
    accountSlug: raw.accountSlug ?? (platform === 'instagram' ? 'ig-majangmejeng_' : 'tt-majangmejeng_'),
    adminTag: raw.adminTag || detectAdminTag(text) || ADMIN_TAGS[admin],
    admin,
    postUrl,
    postOwner: raw.postOwner ?? '',
    commentText: text,
    timestampMs: ts,
    isOwnPost: Boolean(raw.isOwnPost)
  };
}

async function readJson(p) {
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  // 1. Load existing manual dataset.
  const existing = await readJson(ROOT_DATA);
  const beforeMerge = existing?.comments?.length ?? 0;
  const byId = new Map();

  if (existing?.comments) {
    for (const c of existing.comments) {
      const n = normalize(c, c.platform);
      if (n) byId.set(n.id, n);
    }
  }

  // 2. Load scraped IG (majangmejeng).
  const igPath = path.join(SCRAPED_DIR, 'comments-ig-majangmejeng_.json');
  const igData = await readJson(igPath);
  let addedFromIG = 0;
  if (igData?.adminComments?.length) {
    for (const raw of igData.adminComments) {
      const n = normalize({ ...raw, platform: 'instagram' }, 'instagram');
      if (!n) continue;
      if (!byId.has(n.id)) {
        byId.set(n.id, n);
        addedFromIG += 1;
      }
    }
  }

  // 3. Load scraped TT (majangmejeng).
  const ttPath = path.join(SCRAPED_DIR, 'comments-tt-majangmejeng_.json');
  const ttData = await readJson(ttPath);
  let addedFromTT = 0;
  if (ttData?.adminComments?.length) {
    for (const raw of ttData.adminComments) {
      const n = normalize({ ...raw, platform: 'tiktok' }, 'tiktok');
      if (!n) continue;
      if (!byId.has(n.id)) {
        byId.set(n.id, n);
        addedFromTT += 1;
      }
    }
  }

  // 4. Sort newest first, write back.
  const merged = [...byId.values()].sort((a, b) => b.timestampMs - a.timestampMs);
  const out = {
    ...SCHEMA,
    _schemaUpdated: new Date().toISOString().slice(0, 10),
    comments: merged
  };

  await fs.mkdir(path.dirname(ROOT_DATA), { recursive: true });
  await fs.writeFile(ROOT_DATA, JSON.stringify(out, null, 2));

  // 5. Also write to public/data/ for Vite asset pipeline.
  const publicDataDir = path.join(__dirname, '..', 'public', 'data');
  await fs.mkdir(publicDataDir, { recursive: true });
  await fs.writeFile(path.join(publicDataDir, 'admin-comments.json'), JSON.stringify(out, null, 2));

  // 6. Summary.
  const dedupCollisions = (addedFromIG + addedFromTT) - ((merged.length - beforeMerge));
  const summary = {
    beforeMerge,
    afterMerge: merged.length,
    addedFromIG,
    addedFromTT,
    dedupCollisions
  };
  console.log('[aggregate-admin-comments] summary:', JSON.stringify(summary, null, 2));
  console.log(`[aggregate-admin-comments] wrote ${ROOT_DATA}`);
  console.log(`[aggregate-admin-comments] wrote ${path.join(publicDataDir, 'admin-comments.json')}`);
}

main().catch((err) => {
  console.error('[aggregate-admin-comments] fatal:', err);
  process.exit(2);
});
