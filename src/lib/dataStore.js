// Unified data store — single source of truth untuk accounts-full.json
// Dipakai oleh:
//   - React hooks (useAccounts, useAccount, useAccountInsights, useCrossAccountComparison)
//   - Non-React code (webAccess.js lookup layer, ChatPanel account context)
//
// Features:
//   1. Normalize semua data lewat normalizeAccount() (shape konsisten)
//   2. Dedup per-account by post id (in-file defensive, audit sudah handle cross-file)
//   3. Subscribe pattern: setiap reload, semua subscriber di-notify
//   4. Lazy-load JSON chunk 4.8MB sekali, cache selamanya
//   5. reload() API untuk force-refresh setelah scrape ulang (rebuild + reload page)
//
// Pakai di React:
//   import { useAccounts, useAccount } from '../hooks/useAccount.js'
// Pakai di non-React:
//   import { getAllAccounts, getAccountBySlug } from '../lib/dataStore.js'
import { normalizeAccount } from './normalize.js';
import { loadAccountsFromSplit } from './dataManifest.js';

// ===== Module-level state =====
let _accounts = null;          // Normalized accounts (array)
let _bySlug = null;            // Map<slug, account>
let _loadingPromise = null;    // Single in-flight import
let _degraded = false;         // V39: loaded from split payloads, not the monolith
const _subscribers = new Set(); // React state updaters

// Stats per account (dari audit-multi-account.mjs, kalau ada)
let _stats = {};

// ===== Load + normalize =====
// V36: fetch static JSON at runtime instead of bundling 7.7MB into the JS
// chunk. local previews expose the prebuild copy under /data/, while the
// deployed root is flattened to /accounts-full.json. Try both paths.
const DATA_URLS = [
  `${import.meta.env.BASE_URL}data/accounts-full.json`,
  `${import.meta.env.BASE_URL}accounts-full.json`
];

async function fetchStaticJson() {
  let lastError = null;

  for (const url of DATA_URLS) {
    for (const cache of ['no-cache', 'default']) {
      try {
        const res = await fetch(url, { cache });
        if (!res.ok) {
          lastError = new Error(`HTTP ${res.status} for ${url}`);
          continue;
        }
        return await res.json();
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw lastError ?? new Error('Data TITAN tidak dapat dimuat');
}

async function loadFromJson() {
  // V36: static fetch only — the 7.7MB bundled import is GONE from the JS
  // chunk (public/data/accounts-full.json is copied by prebuild script).
  const raw = await fetchStaticJson();
  // Normalize SEMUA akun lewat schema adapter yang sama. Accept both the
  // deployed array shape and a future `{ accounts: [...] }` manifest shape.
  const records = Array.isArray(raw) ? raw : raw?.accounts ?? [];
  return adoptRecords(records);
}

// V39 degraded mode: the 12MB monolith is the fast path, but if it is missing
// or unparseable we rebuild the same records from the per-account split
// payloads emitted by scripts/build-data-manifest.mjs. Slower first paint,
// but the dashboard still works instead of rendering empty panels.
async function loadFromSplit() {
  const records = await loadAccountsFromSplit();
  if (records.length === 0) {
    throw new Error('Data TITAN tidak dapat dimuat dari manifest maupun payload per-akun');
  }
  console.warn(
    `[dataStore] falling back to per-account split payloads (${records.length} akun)`
  );
  return adoptRecords(records);
}

function adoptRecords(records) {
  const normalized = records.map((a) => normalizeAccount(a, a.platform)).filter(Boolean);
  // Defensive in-file dedup (post id uniqueness) — audit sudah handle tapi double-check
  for (const acc of normalized) {
    const seen = new Set();
    acc.posts = acc.posts.filter((p) => {
      if (!p?.id) return false;
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }
  _accounts = normalized;
  _bySlug = new Map(normalized.map((a) => [a.slug, a]));
  _degraded = false;
  // Notify all subscribers
  for (const cb of _subscribers) {
    try { cb(_accounts); } catch (e) { /* ignore */ }
  }
  return _accounts;
}

function ensureLoaded() {
  if (_accounts) return Promise.resolve(_accounts);
  if (_loadingPromise) return _loadingPromise;
  _loadingPromise = loadFromJson()
    .catch((err) => {
      console.warn('[dataStore] full dataset unavailable:', err?.message ?? err);
      return loadFromSplit();
    })
    .catch((err) => {
      console.error('[dataStore] Failed to load accounts:', err);
      _loadingPromise = null;
      _accounts = [];
      _bySlug = new Map();
      _degraded = false;
      return _accounts;
    });
  return _loadingPromise;
}

/** V39: true when the UI is running on per-account split payloads. */
export function isDegradedMode() {
  return _degraded;
}

// ===== Public sync API (returns cached) =====
export function getAllAccounts() {
  return _accounts ?? [];
}

export function getAccountBySlug(slug) {
  return _bySlug?.get(slug) ?? null;
}

// Latest N posts across ALL accounts, sorted by createTime DESC
// Each post augmented with _accountSlug / _accountUsername / _accountPlatform so
// caller can render account-aware UI (avatar, link, etc.) without re-lookup.
export function getLatestPosts(n = 10) {
  if (!_accounts) return [];
  const all = [];
  for (const acc of _accounts) {
    for (const p of acc.posts ?? []) {
      if (p.createTime > 0) {
        all.push({
          ...p,
          _accountSlug: acc.slug,
          _accountUsername: acc.username,
          _accountPlatform: acc.platform,
          _accountLocalAvatar: acc.localAvatar ?? '',
          _accountDisplayName: acc.displayName ?? ''
        });
      }
    }
  }
  all.sort((a, b) => b.createTime - a.createTime);
  return all.slice(0, n);
}

export function getStats() {
  return _stats;
}

// ===== Async load =====
export function loadAccounts() {
  return ensureLoaded();
}

// ===== React hook: subscribe to data load =====
export function subscribeToAccounts(callback) {
  _subscribers.add(callback);
  // Kalau sudah loaded, immediately fire
  if (_accounts) {
    try { callback(_accounts); } catch { /* ignore */ }
  } else {
    ensureLoaded();
  }
  return () => _subscribers.delete(callback);
}

// ===== Reload (kalau data scrape baru sudah di-build + push) =====
// Pakai setelah re-deploy: window.__dataStore?.reload()
export async function reload() {
  _loadingPromise = null;
  _accounts = null;
  _bySlug = null;
  return ensureLoaded();
}

// Expose for local development diagnostics only. Production data should not be
// globally enumerable from the browser console.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__dataStore = { reload, getAllAccounts, getAccountBySlug, isDegradedMode };
}
