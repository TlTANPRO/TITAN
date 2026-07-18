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

// ===== Module-level state =====
let _accounts = null;          // Normalized accounts (array)
let _bySlug = null;            // Map<slug, account>
let _loadingPromise = null;    // Single in-flight import
const _subscribers = new Set(); // React state updaters

// Stats per account (dari audit-multi-account.mjs, kalau ada)
let _stats = {};

// ===== Load + normalize =====
async function loadFromJson() {
  const mod = await import('../data/accounts-full.json');
  const raw = mod.default ?? mod;
  // Normalize SEMUA akun lewat schema adapter yang sama
  const normalized = (raw ?? []).map((a) => normalizeAccount(a, a.platform)).filter(Boolean);
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
  // Notify all subscribers
  for (const cb of _subscribers) {
    try { cb(_accounts); } catch (e) { /* ignore */ }
  }
  return _accounts;
}

function ensureLoaded() {
  if (_accounts) return Promise.resolve(_accounts);
  if (_loadingPromise) return _loadingPromise;
  _loadingPromise = loadFromJson().catch((err) => {
    console.error('[dataStore] Failed to load accounts:', err);
    _loadingPromise = null;
    _accounts = [];
    _bySlug = new Map();
    return _accounts;
  });
  return _loadingPromise;
}

// ===== Public sync API (returns cached) =====
export function getAllAccounts() {
  return _accounts ?? [];
}

export function getAccountBySlug(slug) {
  return _bySlug?.get(slug) ?? null;
}

// Latest N posts across ALL accounts, sorted by createTime DESC
// Each post augmented with _accountSlug so caller knows which account it came from
export function getLatestPosts(n = 10) {
  if (!_accounts) return [];
  const all = [];
  for (const acc of _accounts) {
    for (const p of acc.posts ?? []) {
      if (p.createTime > 0) {
        all.push({ ...p, _accountSlug: acc.slug, _accountUsername: acc.username, _accountPlatform: acc.platform });
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

// Expose untuk console debugging / re-deploy script
if (typeof window !== 'undefined') {
  window.__dataStore = { reload, getAllAccounts, getAccountBySlug };
}
