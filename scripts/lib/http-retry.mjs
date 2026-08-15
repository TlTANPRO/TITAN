// Shared HTTP retry helper for free scrapers.
// Pattern modeled after scripts/lib/tokenPool.mjs (BACKOFFS_MS exponential).
//
// Distinguishes retryable (429/5xx/timeout/abort/network) from terminal
// (401/403/404/login_required) HTTP outcomes. Honors Retry-After header on
// 429/503. Throws HttpTerminalError immediately on terminal, retries with
// exponential backoff on retryable, gives up after maxAttempts.

export class HttpTerminalError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message);
    this.name = 'HttpTerminalError';
    this.status = status ?? null;
    if (cause) this.cause = cause;
  }
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const TERMINAL_STATUSES = new Set([401, 403, 404]);
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_PATTERNS = [
  /ETIMEDOUT/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /EAI_AGAIN/i,
  /ENOTFOUND/i,
  /AbortError/i,
  /This operation was aborted/i,
  /fetch failed/i,
  /network/i,
  /timeout/i
];

export function classifyError(err, res) {
  if (res && TERMINAL_STATUSES.has(res.status)) return 'terminal';
  if (res && RETRYABLE_STATUSES.has(res.status)) return 'retryable';
  if (res && res.status >= 400 && res.status < 500) return 'terminal';
  if (res && res.status >= 500) return 'retryable';
  if (!err) return 'retryable';
  const msg = String(err.message ?? err);
  if (/login_required|require_login/i.test(msg)) return 'terminal';
  for (const re of RETRYABLE_ERROR_PATTERNS) {
    if (re.test(msg)) return 'retryable';
  }
  return 'retryable';
}

const DEFAULT_BACKOFFS_MS = [0, 2000, 4000, 8000, 16000, 32000];

function parseRetryAfter(res) {
  if (!res) return 0;
  const header = res.headers?.get?.('retry-after');
  if (!header) return 0;
  const secs = Number(header);
  if (Number.isFinite(secs) && secs > 0) return Math.min(secs * 1000, 60000);
  // HTTP-date variant — not handled, default to 0
  return 0;
}

/**
 * fetchWithRetry — fetch with exponential backoff + Retry-After honor.
 *
 * @param {string} url
 * @param {RequestInit} [opts]
 * @param {object} [config]
 * @param {number} [config.maxAttempts=3]
 * @param {number[]} [config.backoffsMs] backoff in ms per attempt (index = attempt-1)
 * @param {string} [config.tag] short label for log lines (e.g. 'IG', 'TT', 'Jina')
 * @returns {Promise<Response>}
 * @throws {HttpTerminalError} on terminal status; original Error on exhausted retries
 */
export async function fetchWithRetry(url, opts = {}, config = {}) {
  const maxAttempts = Math.max(1, config.maxAttempts ?? 3);
  const backoffsMs = config.backoffsMs ?? DEFAULT_BACKOFFS_MS;
  const tag = config.tag ?? 'http';

  let lastErr = null;
  let lastRes = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const backoff = backoffsMs[Math.min(attempt - 1, backoffsMs.length - 1)] ?? 0;
    if (backoff > 0) await sleep(backoff);

    try {
      const res = await fetch(url, opts);
      if (res.ok) return res;

      const cls = classifyError(null, res);
      if (cls === 'terminal') {
        throw new HttpTerminalError(`${tag} HTTP ${res.status} ${res.statusText} at ${url}`, { status: res.status });
      }
      lastRes = res;
      const retryAfter = parseRetryAfter(res);
      if (retryAfter > 0 && attempt < maxAttempts) {
        console.log(`[retry] ${tag} attempt ${attempt}/${maxAttempts} status=${res.status} retry-after=${retryAfter}ms → waiting`);
        await sleep(retryAfter);
      } else if (attempt < maxAttempts) {
        const next = backoffsMs[Math.min(attempt, backoffsMs.length - 1)] ?? 0;
        console.log(`[retry] ${tag} attempt ${attempt}/${maxAttempts} status=${res.status} → waiting ${next}ms`);
      }
      lastErr = new Error(`${tag} HTTP ${res.status} at ${url}`);
    } catch (err) {
      if (err instanceof HttpTerminalError) throw err;
      const cls = classifyError(err, null);
      if (cls === 'terminal') {
        throw new HttpTerminalError(err.message || `${tag} terminal`, { cause: err });
      }
      lastErr = err;
      if (attempt < maxAttempts) {
        const next = backoffsMs[Math.min(attempt, backoffsMs.length - 1)] ?? 0;
        console.log(`[retry] ${tag} attempt ${attempt}/${maxAttempts} error=${err.message?.slice(0, 80) ?? err} → waiting ${next}ms`);
      }
    }
  }

  if (lastRes) {
    throw new Error(`${tag} HTTP ${lastRes.status} at ${url} after ${maxAttempts} attempts`);
  }
  throw lastErr ?? new Error(`${tag} fetch failed at ${url} after ${maxAttempts} attempts`);
}
