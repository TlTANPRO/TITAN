// refreshClient — V11 split-refresh strategy
//
// Soft refresh (default, topbar button + auto every 5 min):
//   - POST /soft-refresh → Worker re-fetches accounts-full.json + returns metadata
//   - dataStore.reload() refreshes the in-app store
//   - 0 tokens consumed, 0 GH API calls, < 1s
//
// Hard refresh (manual, /settings page after auth):
//   - POST /hard-refresh with Authorization: Bearer <password>
//   - Worker dispatches GH Actions workflow, polls status
//   - Uses ENSEMBLEDATA tokens; slow (3-10 min)
//
// Scheduled refresh (cron, 23:00 WIB):
//   - .github/workflows/incremental.yml OR Worker scheduled event
//   - User doesn't click anything — data is fresh by morning
//
// Fallback: if Worker is unreachable, refreshClient re-imports the Vite-bundled
// JSON via dataStore.reload(). The data itself only changes after a new build
// (Vite hashes the chunk), so users should hard-reload the page after a deploy.

import { reload as dataStoreReload } from './dataStore.js';

const WORKER_URL = import.meta.env.VITE_LLM_PROXY_URL ?? '';
const HARD_REFRESH_PASSWORD = import.meta.env.VITE_HARD_REFRESH_PASSWORD ?? '';
const DEFAULT_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 10 * 60_000; // 10 minutes (hard refresh can be slower)

async function fetchWithTimeout(url, options = {}, timeout = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

/**
 * Soft refresh — fast, no scraping, just reload JSON + store.
 * Returns `{ ok, message, generatedAt, accountCount, totalPosts, fallback }`.
 */
export async function triggerSoftRefresh() {
  if (!WORKER_URL) {
    return localCacheBust('VITE_LLM_PROXY_URL belum di-setup');
  }
  try {
    const res = await fetchWithTimeout(`${WORKER_URL}/soft-refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, 15_000);
    if (!res.ok) {
      return localCacheBust(`Worker /soft-refresh ${res.status}`);
    }
    const meta = await res.json().catch(() => ({}));
    await dataStoreReload();
    return {
      ok: true,
      message: 'Data berhasil di-reload',
      generatedAt: meta.generatedAt,
      accountCount: meta.accountCount,
      totalPosts: meta.totalPosts,
      source: 'worker-soft'
    };
  } catch (err) {
    return localCacheBust(err?.message ?? 'Network error');
  }
}

/**
 * Hard refresh — full scrape via GH Actions workflow.
 * Requires `VITE_HARD_REFRESH_PASSWORD` to be set in frontend env.
 * Caller should check the password exists before invoking (UI gate).
 *
 * Returns `{ ok, message, jobId, fallback, error }`.
 */
export async function triggerHardRefresh(platforms = ['instagram', 'tiktok']) {
  if (!WORKER_URL) {
    return { ok: false, error: 'VITE_LLM_PROXY_URL belum di-setup' };
  }
  if (!HARD_REFRESH_PASSWORD) {
    return { ok: false, error: 'VITE_HARD_REFRESH_PASSWORD belum di-setup' };
  }
  try {
    const startRes = await fetchWithTimeout(`${WORKER_URL}/hard-refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HARD_REFRESH_PASSWORD}`
      },
      body: JSON.stringify({ platforms })
    }, 30_000);
    if (!startRes.ok) {
      const text = await startRes.text().catch(() => '');
      return { ok: false, error: `Worker /hard-refresh ${startRes.status}: ${text.slice(0, 100)}` };
    }
    const startJson = await startRes.json().catch(() => ({}));
    const jobId = startJson?.jobId;
    if (!jobId) {
      if (startJson?.error) return { ok: false, error: `Worker: ${startJson.error}` };
      return { ok: false, error: 'Worker tidak mengembalikan jobId' };
    }

    // Poll /refresh-status until done
    const pollDeadline = Date.now() + POLL_TIMEOUT_MS;
    let lastStatus = null;
    while (Date.now() < pollDeadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const statusRes = await fetchWithTimeout(
        `${WORKER_URL}/refresh-status?jobId=${encodeURIComponent(jobId)}`,
        {},
        20_000
      );
      if (!statusRes.ok) continue;
      const status = await statusRes.json().catch(() => ({}));
      lastStatus = status;
      if (status?.status === 'success') {
        await dataStoreReload();
        return {
          ok: true,
          message: 'Data berhasil di-scrape ulang',
          jobId,
          logsUrl: status.logsUrl,
          durationMs: Date.now() - status.startedAt
        };
      }
      if (status?.status === 'failed') {
        return {
          ok: false,
          error: `Job gagal: ${status.conclusion ?? 'unknown'}`,
          jobId,
          logsUrl: status.logsUrl
        };
      }
    }
    return {
      ok: false,
      error: 'Polling timeout setelah 10 menit',
      jobId,
      lastStatus
    };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'Network error' };
  }
}

/**
 * @deprecated — kept for V10 backward compat. Alias for triggerSoftRefresh.
 */
export async function triggerRefresh(platforms = ['instagram', 'tiktok']) {
  return triggerSoftRefresh();
}

// ============ Fallback (Worker unreachable OR Vite-bundled data path) ============
// V11 design: accounts-full.json is bundled via Vite import, not served as a static
// file. When Worker /soft-refresh is unreachable, we cannot fetch the JSON from a URL
// (the /data/accounts-full.json path 404s). Instead, ask the dataStore to re-import
// the JSON chunk — the actual "fresh" version lives in the next deployed bundle anyway.
async function localCacheBust(reason) {
  try {
    await dataStoreReload();
    const accounts = (await import('./dataStore.js')).getAllAccounts();
    return {
      ok: true,
      message: `Reload lokal (${reason ?? 'fallback'}) — data akan refresh setelah redeploy`,
      accountCount: accounts.length,
      totalPosts: accounts.reduce((acc, a) => acc + (a.posts?.length ?? 0), 0),
      fallback: true
    };
  } catch (err) {
    return { ok: false, error: `Refresh gagal: ${reason ?? err?.message}` };
  }
}
