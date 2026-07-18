// Token pool dengan round-robin, retry on 495 (quota exhausted)
import 'dotenv/config';

export class TokenPool {
  constructor() {
    const raw = process.env.ENSEMBLEDATA_TOKENS || '';
    const all = raw.split(',').map((t) => t.trim()).filter(Boolean);
    // Optional: filter to a specific subset via ENSEMBLEDATA_TOKENS_FILTER (comma-separated prefixes)
    const filter = (process.env.ENSEMBLEDATA_TOKENS_FILTER || '').split(',').map((s) => s.trim()).filter(Boolean);
    this.tokens = filter.length > 0
      ? all.filter((t) => filter.some((f) => t.startsWith(f)))
      : all;
    this.exhausted = new Set(); // token yang 495 hari ini
    this.pointer = 0;
    if (this.tokens.length === 0) {
      throw new Error(
        filter.length > 0
          ? `ENSEMBLEDATA_TOKENS_FILTER (${filter.join(',')}) matched 0 tokens`
          : 'ENSEMBLEDATA_TOKENS not set in .env'
      );
    }
    console.log(`[TokenPool] Loaded ${this.tokens.length} tokens${filter.length > 0 ? ` (filtered by ${filter.length} prefix)` : ''}`);
  }

  /**
   * Get next available token (skip exhausted).
   * Returns null kalau semua exhausted.
   */
  next() {
    if (this.exhausted.size >= this.tokens.length) {
      return null;
    }
    for (let i = 0; i < this.tokens.length; i++) {
      const idx = (this.pointer + i) % this.tokens.length;
      const token = this.tokens[idx];
      if (!this.exhausted.has(token)) {
        this.pointer = (idx + 1) % this.tokens.length;
        return token;
      }
    }
    return null;
  }

  markExhausted(token) {
    this.exhausted.add(token);
    console.warn(`[TokenPool] Token ${token.slice(0, 8)}... marked exhausted (${this.exhausted.size}/${this.tokens.length})`);
  }

  isAllExhausted() {
    return this.exhausted.size >= this.tokens.length;
  }

  stats() {
    return {
      total: this.tokens.length,
      exhausted: this.exhausted.size,
      available: this.tokens.length - this.exhausted.size
    };
  }
}

/**
 * HTTP fetch dengan retry on 495 + token rotation + exponential backoff.
 * Backoff: 0, 1s, 2s, 4s, 8s, 16s (maks 31s total per attempt sequence).
 * Usage:
 *   const data = await ensembledataFetch('instagram', '/user/info', { username: 'x' });
 */
export async function ensembledataFetch(platform, path, params = {}, tokenPool) {
  const base = platform === 'instagram'
    ? 'https://ensembledata.com/apis/instagram'
    : 'https://ensembledata.com/apis/tt';
  const maxRetries = 6;
  // Exponential backoff: attempt 0 = no delay, 1 = 1s, 2 = 2s, ..., 5 = 16s
  const BACKOFFS_MS = [0, 1000, 2000, 4000, 8000, 16000];

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const token = tokenPool.next();
    if (!token) {
      throw new Error('All ENSEMBLEDATA tokens exhausted for today');
    }

    // Apply exponential backoff sebelum attempt (attempt 0 = no delay)
    if (BACKOFFS_MS[attempt] > 0) {
      await sleep(BACKOFFS_MS[attempt]);
    }

    const url = new URL(`${base}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v));
      }
    }
    // ENSEMBLEDATA butuh token sebagai query param, bukan header
    url.searchParams.set('token', token);

    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      });

      if (res.status === 495) {
        tokenPool.markExhausted(token);
        console.log(`[Fetch] 495 — rotating token, attempt ${attempt + 1}/${maxRetries} (next backoff: ${BACKOFFS_MS[attempt + 1] ?? 'end'}ms)`);
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`ENSEMBLEDATA ${res.status}: ${body.slice(0, 200)}`);
      }

      return await res.json();
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      console.log(`[Fetch] Error ${err.message.slice(0, 80)} — retrying with backoff`);
    }
  }
  throw new Error('Max retries exceeded');
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
