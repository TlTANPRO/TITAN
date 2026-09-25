// V39: data manifest client.
//
// The full dataset is ~12.5MB, so Home used to show nothing until all of it
// arrived. The manifest is a few KB and carries exactly what a summary view
// needs: account count, post count, scrape time, newest-post time, per-platform
// rollups, and per-metric coverage.
//
// Loading order in the app:
//   1. manifest.json  → summary + freshness render immediately
//   2. accounts-full.json → the chart/post-heavy views, loaded by dataStore
//
// Both are optional. A missing manifest must never break the app, so every
// failure resolves to `null` and callers fall back to the full dataset.
import { useEffect, useState } from 'react';

const DAY_MS = 86_400_000;

// The manifest lives at two different URLs depending on how the build is served,
// which is the same situation dataStore handles for accounts-full.json:
//
//   vite preview / dist  → /TITAN/data/manifest.json   (public/ staging dir)
//   GitHub Pages root    → /TITAN/manifest.json         (deploy.mjs flattens
//                          dist/data/* into the repo root, because gh-pages
//                          serves from the root)
//
// Requesting only the first path 404s in production, and because the load is
// non-fatal by design that failure was silent: the page just quietly lost every
// manifest-derived number. Both paths are tried, first hit wins.
const MANIFEST_URLS = [
  `${import.meta.env.BASE_URL}data/manifest.json`,
  `${import.meta.env.BASE_URL}manifest.json`
];

let _manifest = null;
let _loadPromise = null;
let _error = null;
const _subscribers = new Set();

function notify() {
  for (const cb of _subscribers) {
    try { cb(_manifest); } catch { /* a broken subscriber must not break loading */ }
  }
}

export function getManifest() {
  return _manifest;
}

export function getManifestError() {
  return _error;
}

export function subscribeToManifest(callback) {
  _subscribers.add(callback);
  if (_manifest) {
    try { callback(_manifest); } catch { /* ignore */ }
  }
  return () => _subscribers.delete(callback);
}

export function loadManifest() {
  if (_manifest) return Promise.resolve(_manifest);
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    let lastError = null;

    for (const url of MANIFEST_URLS) {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) {
          lastError = new Error(`HTTP ${res.status} for ${url}`);
          continue;
        }
        const payload = await res.json();
        if (!payload || typeof payload !== 'object' || !Array.isArray(payload.accounts)) {
          lastError = new Error(`${url} does not contain an account list`);
          continue;
        }
        _manifest = payload;
        _error = null;
        notify();
        return _manifest;
      } catch (err) {
        lastError = err;
      }
    }

    // Non-fatal by design: the app keeps working off the full dataset.
    _error = lastError?.message ?? 'manifest tidak dapat dimuat';
    return null;
  })();

  return _loadPromise;
}

/** Kick off manifest loading as early as possible (called from AppShell). */
export function primeManifest() {
  return loadManifest();
}

/**
 * Freshness derived from the manifest, in the same shape dataFreshness.js uses
 * so PortfolioStatus can consume either source without branching twice.
 */
export function getManifestFreshness(manifest, now = Date.now()) {
  if (!manifest) return null;

  const latestPostAt = Number(manifest.latestPostAt) || null;
  const lastScrapeAt = Number(manifest.lastScrapeAt) || null;
  const ageMs = latestPostAt == null ? null : Math.max(0, now - latestPostAt);

  const tone = ageMs == null
    ? 'neutral'
    : ageMs < DAY_MS ? 'success'
      : ageMs < 3 * DAY_MS ? 'warning' : 'danger';

  const platforms = Object.entries(manifest.platforms ?? {}).reduce((acc, [platform, info]) => {
    const platformLatest = Number(info?.latestPostAt) || null;
    const platformAge = platformLatest == null ? null : Math.max(0, now - platformLatest);
    acc[platform] = {
      accountCount: Number(info?.accountCount) || 0,
      postCount: Number(info?.postCount) || 0,
      latestPostAt: platformLatest,
      ageMs: platformAge,
      tone: platformAge == null
        ? 'neutral'
        : platformAge < DAY_MS ? 'success'
          : platformAge < 3 * DAY_MS ? 'warning' : 'danger'
    };
    return acc;
  }, {});

  return {
    source: 'manifest',
    tone,
    latestPostAt,
    lastScrapeAt,
    ageMs,
    accountCount: Number(manifest.accountCount) || 0,
    totalPosts: Number(manifest.totalPosts) || 0,
    version: manifest.version ?? null,
    schemaVersion: manifest.schemaVersion ?? null,
    contentStatus: manifest.contentStatus ?? 'unknown',
    platforms
  };
}

/** Accounts from the manifest that the user most likely needs to act on. */
export function getManifestStaleAccounts(manifest, now = Date.now()) {
  if (!manifest?.accounts) return [];
  return manifest.accounts
    .map((entry) => {
      const latest = Number(entry?.latestPostAt) || null;
      const ageMs = latest == null ? null : Math.max(0, now - latest);
      return { ...entry, ageMs };
    })
    .filter((entry) => entry.ageMs == null || entry.ageMs > 3 * DAY_MS)
    .sort((a, b) => (b.ageMs ?? Number.MAX_SAFE_INTEGER) - (a.ageMs ?? Number.MAX_SAFE_INTEGER));
}

/** Mean share of posts carrying at least one engagement metric, 0..1. */
export function getManifestCoverage(manifest) {
  if (!manifest?.accounts?.length) return null;
  const shares = manifest.accounts
    .map((a) => Number(a?.coverage?.engagedPostShare))
    .filter((v) => Number.isFinite(v));
  if (!shares.length) return null;
  return shares.reduce((sum, v) => sum + v, 0) / shares.length;
}

/** React binding. Returns `{ manifest, freshness, coverage, stale, loading }`. */
export function useDataManifest() {
  const [manifest, setManifest] = useState(_manifest);
  const [loading, setLoading] = useState(() => !_manifest);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeToManifest((next) => {
      if (!active) return;
      setManifest(next);
      if (next) setLoading(false);
    });
    loadManifest().then((next) => {
      if (!active) return;
      setManifest(next);
      setLoading(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const now = Date.now();
  return {
    manifest,
    freshness: getManifestFreshness(manifest, now),
    coverage: getManifestCoverage(manifest),
    stale: getManifestStaleAccounts(manifest, now),
    loading
  };
}

// ===== Degraded mode: per-account split payloads =====
//
// The build emits data/accounts/<slug>.json next to the 12MB monolith. Those
// files are the fallback, not the fast path: if accounts-full.json is missing,
// truncated, or served with a bad content-type, the app can still render every
// account by fetching the small files in parallel. That is why the extra ~11MB
// of static files is worth shipping — it converts a total outage into a slower
// first paint.

const _detailCache = new Map();

export function getAccountDetailUrl(slug) {
  return `${import.meta.env.BASE_URL}data/accounts/${slug}.json`;
}

/** Fetch one account's split payload. Cached for the page lifetime. */
export async function loadAccountDetail(slug) {
  if (_detailCache.has(slug)) return _detailCache.get(slug);
  const promise = fetch(getAccountDetailUrl(slug), { cache: 'default' })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status} for account ${slug}`);
      return res.json();
    })
    .then((payload) => payload?.record ?? payload)
    .catch((err) => {
      _detailCache.delete(slug);
      throw err;
    });
  _detailCache.set(slug, promise);
  return promise;
}

/**
 * Rebuild the account list from the manifest + split payloads.
 * Returns raw records in the same shape as accounts-full.json so the existing
 * normalizeAccount() pipeline is reused unchanged.
 */
export async function loadAccountsFromSplit(manifest = _manifest, { concurrency = 4 } = {}) {
  const source = manifest ?? (await loadManifest());
  if (!source?.accounts?.length) return [];

  const entries = source.accounts;
  const results = new Array(entries.length);
  let cursor = 0;

  async function worker() {
    while (cursor < entries.length) {
      const index = cursor++;
      try {
        results[index] = await loadAccountDetail(entries[index].slug);
      } catch {
        results[index] = null;
      }
    }
  }

  // Bounded concurrency: 9 files is small, but the cap keeps a future
  // 100-account dataset from opening 100 sockets at once.
  await Promise.all(
    Array.from({ length: Math.min(concurrency, entries.length) }, () => worker())
  );

  return results.filter(Boolean);
}
