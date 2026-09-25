// Runtime session client (V39)
//
// Why this exists: the browser must never hold a long-lived shared secret, and
// VITE_* values are inlined into the public bundle. So the Worker issues a
// short-lived HMAC token (POST /session) in exchange for the bootstrap
// credential, and the browser stores ONLY that token.
//
// Storage contract:
//   sessionStorage['titan.sessionToken'] = token
//   sessionStorage['titan.sessionExpiresAt'] = ISO string
//   sessionStorage['titan.bootstrap.v1'] = bootstrap credential (owner-entered)
//
// sessionStorage, not localStorage: the token dies with the tab, so a shared
// machine does not keep a live credential around.
import { getProxyUrl, isProxyMode } from './proxyConfig.js';

export const TOKEN_KEY = 'titan.sessionToken';
export const EXPIRES_KEY = 'titan.sessionExpiresAt';
export const BOOTSTRAP_KEY = 'titan.bootstrap.v1';
export const ISSUED_KEY = 'titan.sessionIssuedAt';

// Treat a token as expired slightly early so a request never leaves the browser
// with a token that expires mid-flight.
const EXPIRY_SKEW_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;

let _state = null;
const _subscribers = new Set();

function readStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function getSessionToken() {
  const store = readStorage();
  if (!store) return null;
  try {
    const token = store.getItem(TOKEN_KEY);
    return token && !isSessionExpired(token, store.getItem(EXPIRES_KEY)) ? token : null;
  } catch {
    return null;
  }
}

export function getStoredBootstrap() {
  const store = readStorage();
  if (!store) return '';
  try {
    return store.getItem(BOOTSTRAP_KEY) ?? '';
  } catch {
    return '';
  }
}

function publish() {
  _state = readSessionState();
  for (const cb of _subscribers) {
    try { cb(_state); } catch { /* subscriber errors must not break auth */ }
  }
  return _state;
}

export function subscribeToSession(callback) {
  _subscribers.add(callback);
  callback(_state ?? readSessionState());
  return () => _subscribers.delete(callback);
}

export function clearSession(reason = 'cleared') {
  const store = readStorage();
  if (store) {
    try {
      store.removeItem(TOKEN_KEY);
      store.removeItem(EXPIRES_KEY);
      store.removeItem(ISSUED_KEY);
    } catch { /* storage disabled — nothing to clear */ }
  }
  return publish({ ...(readSessionState() ?? {}), lastEvent: reason });
}

async function fetchWithTimeout(url, options, timeout = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

/**
 * Exchange the bootstrap credential for a short-lived session token.
 * Returns `{ ok, error?, expiresAt?, state }` — never throws, so callers can
 * render the failure inline.
 */
export async function requestSession({ bootstrap } = {}) {
  if (!isProxyMode()) {
    return { ok: false, error: 'VITE_LLM_PROXY_URL belum di-setup, mode sesi tidak aktif' };
  }

  const credential = (bootstrap ?? '').trim() || getStoredBootstrap();
  if (!credential) {
    return { ok: false, error: 'Bootstrap credential wajib diisi di Settings → Sesi AI' };
  }

  const proxyUrl = getProxyUrl();
  try {
    const res = await fetchWithTimeout(`${proxyUrl}/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Titan-Bootstrap': credential
      },
      body: JSON.stringify({ bootstrap: credential })
    });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        error: payload?.error ?? `Worker /session ${res.status}`,
        status: res.status
      };
    }
    if (!payload?.token || !Number.isFinite(payload?.expiresAt)) {
      return { ok: false, error: 'Worker tidak mengembalikan token sesi yang valid' };
    }

    const store = readStorage();
    if (store) {
      try {
        store.setItem(TOKEN_KEY, payload.token);
        store.setItem(EXPIRES_KEY, String(payload.expiresAt));
        store.setItem(ISSUED_KEY, new Date().toISOString());
        store.setItem(BOOTSTRAP_KEY, credential);
      } catch { /* non-fatal: the in-memory state below is still accurate */ }
    }
    return { ok: true, expiresAt: payload.expiresAt, state: publish() };
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { ok: false, error: 'Permintaan sesi timeout setelah 15 detik' };
    }
    return { ok: false, error: err?.message ?? 'Network error saat meminta sesi' };
  }
}

/** Verify the stored token against the Worker. Expired tokens are pruned. */
export async function verifySession() {
  const store = readStorage();
  const token = store ? store.getItem(TOKEN_KEY) : null;
  if (!token) return { ok: false, valid: false, reason: 'missing-token' };
  if (!isProxyMode()) return { ok: false, valid: false, reason: 'proxy-not-configured' };

  const proxyUrl = getProxyUrl();
  try {
    const res = await fetchWithTimeout(
      `${proxyUrl}/session/verify`,
      { headers: { 'X-Titan-Session': token } },
      10_000
    );
    const payload = await res.json().catch(() => ({}));
    if (res.ok && payload?.valid) {
      if (Number.isFinite(payload.expiresAt)) {
        try { store?.setItem(EXPIRES_KEY, String(payload.expiresAt)); } catch { /* ignore */ }
      }
      return { ok: true, valid: true, expiresAt: payload.expiresAt, state: publish() };
    }
    if (payload?.reason === 'expired' || payload?.reason === 'invalid') {
      clearSession('rejected');
    }
    return { ok: true, valid: false, reason: payload?.reason ?? 'invalid' };
  } catch (err) {
    // Network failure must NOT drop a token that may still be valid.
    return { ok: false, valid: false, reason: 'network', error: err?.message ?? 'Network error' };
  }
}

export function isSessionExpired(token, expiresAt, now = Date.now()) {
  if (!token) return true;
  const ms = Number(expiresAt);
  if (!Number.isFinite(ms)) return true;
  return ms - EXPIRY_SKEW_MS <= now;
}

export function getSessionRemainingMs(now = Date.now()) {
  const store = readStorage();
  if (!store) return null;
  const expiresAt = Number(store.getItem(EXPIRES_KEY));
  if (!Number.isFinite(expiresAt)) return null;
  return Math.max(0, expiresAt - now);
}

/**
 * UI-facing session state. Kept pure so it can be unit tested without a DOM.
 * status: 'disabled' | 'missing' | 'active' | 'expired' | 'unverified'
 */
export function readSessionState(now = Date.now()) {
  const store = readStorage();
  const token = store?.getItem(TOKEN_KEY) ?? '';
  const expiresAt = Number(store?.getItem(EXPIRES_KEY));
  const issuedAt = store?.getItem(ISSUED_KEY) ?? null;

  if (!isProxyMode()) {
    return { status: 'disabled', token: null, expiresAt: null, issuedAt, remainingMs: null };
  }
  if (!token) {
    return { status: 'missing', token: null, expiresAt: null, issuedAt, remainingMs: null };
  }
  if (isSessionExpired(token, expiresAt, now)) {
    return {
      status: 'expired',
      token: null,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
      issuedAt,
      remainingMs: 0
    };
  }
  return {
    status: 'active',
    token,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
    issuedAt,
    remainingMs: Math.max(0, expiresAt - now)
  };
}

export function describeSessionState(state, now = Date.now()) {
  switch (state?.status) {
    case 'disabled':
      return 'Mode langsung aktif — session token tidak dipakai';
    case 'missing':
      return 'Belum ada sesi. Minta sesi di Settings → Sesi AI.';
    case 'expired':
      return 'Sesi kedaluwarsa. Minta sesi baru di Settings → Sesi AI.';
    case 'active': {
      const remaining = state.remainingMs ?? 0;
      const hours = Math.floor(remaining / 3_600_000);
      const minutes = Math.floor((remaining % 3_600_000) / 60_000);
      if (hours > 0) return `Sesi aktif — berlaku ${hours}j ${minutes}m lagi`;
      if (minutes > 0) return `Sesi aktif — berlaku ${minutes}m lagi`;
      return state.expiresAt && now > state.expiresAt
        ? 'Sesi kedaluwarsa. Minta sesi baru di Settings → Sesi AI.'
        : 'Sesi aktif — hampir kedaluwarsa';
    }
    default:
      return 'Status sesi tidak diketahui';
  }
}
