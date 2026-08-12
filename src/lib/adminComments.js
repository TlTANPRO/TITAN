// Admin comments dataset — SSOT for the /admin Komentar Admin tab.
//
// Maps each comment to the admin who posted it, aggregates per-admin + per-day +
// per-month KPIs, and groups comments per post URL so the UI can show "5 latest
// samples per post". The marker tag rule differs from post-caption adminHashtags:
// comments use a DASH prefix (`-Rf`/`-Rm`/`-Re`/`-Ju`) instead of `#agustusXX`.
//
// Until a free IG/TT comment scraper is wired in, this dataset is populated
// manually. The schema (see data/admin-comments.json _schema field) is
// self-describing — see /admin tab for UI consumers.
//
// To add/rename admins, edit ADMIN_TAGS below — every consumer reads from here.
import { ADMIN_HASHTAGS } from './adminHashtags.js';

// Marker → admin name. Each entry: { tag: marker regex, name: canonical name }.
// Marker rule: dash-prefix (`-Rf`), case-insensitive. Aliases accepted for
// common typos (e.g. `-Riki` → Rifqi) per user clarification 13 Aug 2026.
const ADMIN_TAGS = [
  { name: 'Reni',   patterns: [/-re\b/i, /-reni\b/i] },
  { name: 'Rifqi',  patterns: [/-rf\b/i, /-riki\b/i, /-rifki\b/i] },
  { name: 'Reta',   patterns: [/-rm\b/i, /-reta\b/i] },
  { name: 'Julian', patterns: [/-ju\b/i, /-julian\b/i] }
];

// Stable admin order — must match ADMIN_HASHTAGS so colors stay attached.
// Mirrors adminHashtags.js ADMIN_HASHTAGS canonical order.
const ADMIN_ORDER = ADMIN_HASHTAGS.map((a) => a.name);

// Filter start date — comments before this date are ignored.
// User clarification 12 Aug 2026: "hanya untuk mulai tanggal 1 agustus saja".
const FILTER_START_MS = Date.parse('2026-08-01T00:00:00Z');

// Returns the admin name for a comment, or null if no marker matched.
// Detection is first-match-wins across the patterns array.
function detectAdmin(commentText) {
  if (!commentText) return null;
  for (const entry of ADMIN_TAGS) {
    for (const re of entry.patterns) {
      if (re.test(commentText)) return entry.name;
    }
  }
  return null;
}

// Normalize a raw comment record from the dataset. Resolves `admin` from
// `commentText` marker if missing, clamps `timestampMs` to a positive int,
// drops rows that fail schema validation. Returns null for bad rows.
function normalizeComment(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const ts = Number(raw.timestampMs);
  if (!Number.isFinite(ts) || ts <= 0) return null;
  const admin = raw.admin ?? detectAdmin(raw.commentText ?? '');
  if (!admin || !ADMIN_ORDER.includes(admin)) return null;
  return {
    id: String(raw.id ?? `${raw.platform}-${raw.postUrl}-${admin}-${ts}`),
    platform: raw.platform === 'tiktok' ? 'tiktok' : 'instagram',
    accountSlug: String(raw.accountSlug ?? ''),
    adminTag: String(raw.adminTag ?? ''),
    admin,
    postUrl: String(raw.postUrl ?? ''),
    postOwner: String(raw.postOwner ?? ''),
    commentText: String(raw.commentText ?? ''),
    timestampMs: ts,
    isOwnPost: Boolean(raw.isOwnPost)
  };
}

// Load + normalize comments. Accepts either the raw dataset object (e.g.
// imported JSON) or a comments array. Returns a sorted array (newest first)
// filtered to FILTER_START_MS onwards.
export function loadAdminComments(source) {
  const raw = Array.isArray(source) ? source : (source?.comments ?? []);
  const out = [];
  for (const r of raw) {
    const n = normalizeComment(r);
    if (!n) continue;
    if (n.timestampMs < FILTER_START_MS) continue;
    out.push(n);
  }
  out.sort((a, b) => b.timestampMs - a.timestampMs);
  return out;
}

// Per-admin aggregate totals. Returns array ordered by ADMIN_ORDER, with
// `commentCount`, plus `ownPostCount` and `externalPostCount` for completeness.
export function buildAdminKpi(comments, adminNames = ADMIN_ORDER) {
  const byAdmin = new Map(adminNames.map((n) => [n, { admin: n, commentCount: 0, ownPostCount: 0, externalPostCount: 0 }]));
  for (const c of comments) {
    const slot = byAdmin.get(c.admin);
    if (!slot) continue;
    slot.commentCount += 1;
    if (c.isOwnPost) slot.ownPostCount += 1;
    else slot.externalPostCount += 1;
  }
  return adminNames.map((n) => byAdmin.get(n));
}

// Monthly KPI per admin. Returns array sorted by `commentCount` DESC so the
// row with the highest comment total sits at the top — user wanted the most
// active month+admin pair to be the headline row. Tiebreak: monthKey DESC then
// canonical admin order. Row shape: { monthKey, admin, commentCount, ... }.
export function buildMonthlyKpi(comments, adminNames = ADMIN_ORDER) {
  const map = new Map();
  for (const c of comments) {
    const d = new Date(c.timestampMs);
    const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const k = `${monthKey}__${c.admin}`;
    if (!map.has(k)) {
      map.set(k, { monthKey, admin: c.admin, commentCount: 0, ownPostCount: 0, externalPostCount: 0 });
    }
    const slot = map.get(k);
    slot.commentCount += 1;
    if (c.isOwnPost) slot.ownPostCount += 1;
    else slot.externalPostCount += 1;
  }
  return [...map.values()].sort((a, b) => {
    if (b.commentCount !== a.commentCount) return b.commentCount - a.commentCount;
    if (b.monthKey !== a.monthKey) return b.monthKey.localeCompare(a.monthKey);
    return adminNames.indexOf(a.admin) - adminNames.indexOf(b.admin);
  });
}

// Distinct month keys (DESC) across all comments.
export function listCommentMonths(comments) {
  const set = new Set();
  for (const c of comments) {
    const d = new Date(c.timestampMs);
    set.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return [...set].sort().reverse();
}

// Group comments by postUrl. Returns Map<postUrl, Comment[]> where each
// group is sorted newest-first internally.
export function groupByPost(comments) {
  const out = new Map();
  for (const c of comments) {
    if (!out.has(c.postUrl)) out.set(c.postUrl, []);
    out.get(c.postUrl).push(c);
  }
  for (const arr of out.values()) arr.sort((a, b) => b.timestampMs - a.timestampMs);
  return out;
}

// Truncate a comment text for previews. Strips the trailing marker tag so
// preview body reads naturally. Marker still visible in dedicated columns.
export function previewCommentText(text, maxLen = 100) {
  if (!text) return '';
  // Strip trailing marker tag if present (e.g. "...info bermanfaat -Rf" → "...info bermanfaat")
  const stripped = text.replace(/\s*[-–—]\s*(rf|rm|re|ju|riki|rifki|reta|reni|julian)\s*\.?\s*$/i, '');
  if (stripped.length <= maxLen) return stripped;
  return stripped.slice(0, maxLen - 1) + '…';
}

// Returns the trailing marker tag from a comment, e.g. "Info bermanfaat -Rf" → "-Rf".
// Falls back to the admin's first marker pattern (default `-Rf` etc) when comment
// text lacks a clean marker (defensive — caller may have stripped it during preview).
export function extractMarkerTag(text, fallbackAdmin) {
  if (text) {
    const m = text.match(/[-–—]\s*(rf|rm|re|ju|riki|rifki|reta|reni|julian)\b\s*\.?\s*$/i);
    if (m) return `-${m[1].toLowerCase()}`;
  }
  if (fallbackAdmin === 'Reni') return '-Re';
  if (fallbackAdmin === 'Reta') return '-Rm';
  if (fallbackAdmin === 'Rifqi') return '-Rf';
  if (fallbackAdmin === 'Julian') return '-Ju';
  return '';
}

// Re-export for downstream code that wants the canonical admin order + tags.
export { detectAdmin, ADMIN_ORDER, ADMIN_TAGS, FILTER_START_MS };