// validate-tokens-now.mjs
// V27.16: Re-validate the full token pool today, output verdict per token.
//
// IMPORTANT: Do NOT hardcode tokens in this file. The pool comes from
// `scripts/.token-pool.json` (gitignored) or the ENSEMBLEDATA_TOKENS env
// var. This keeps the credentials out of git history.
//
// Usage:
//   node scripts/validate-tokens-now.mjs
// Output:
//   scripts/token-validation-now.json
//   console summary with valid tokens

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

// V27.16: token pool is loaded from a gitignored JSON file. If absent,
// fall back to the ENSEMBLEDATA_TOKENS env var (the standard way).
const POOL_FILE = path.join(process.cwd(), 'scripts', '.token-pool.json');
let TOKEN_POOL = [];

if (fs.existsSync(POOL_FILE)) {
  try {
    TOKEN_POOL = JSON.parse(fs.readFileSync(POOL_FILE, 'utf-8'));
    if (!Array.isArray(TOKEN_POOL)) {
      console.error(`[validate-tokens-now] ${POOL_FILE} is not an array, ignoring`);
      TOKEN_POOL = [];
    }
  } catch (err) {
    console.error(`[validate-tokens-now] Cannot read ${POOL_FILE}: ${err.message}`);
  }
}

if (TOKEN_POOL.length === 0) {
  const envTokens = (process.env.ENSEMBLEDATA_TOKENS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (envTokens.length > 0) {
    TOKEN_POOL = envTokens;
    console.log(`[validate-tokens-now] Loaded ${TOKEN_POOL.length} tokens from ENSEMBLEDATA_TOKENS env var`);
  } else {
    console.error(`[validate-tokens-now] No tokens to test.`);
    console.error(`  Option A: create scripts/.token-pool.json (gitignored) as ["tok1","tok2",...]`);
    console.error(`  Option B: set ENSEMBLEDATA_TOKENS=tok1,tok2 in .env`);
    process.exit(1);
  }
} else {
  console.log(`[validate-tokens-now] Loaded ${TOKEN_POOL.length} tokens from scripts/.token-pool.json`);
}

const PROBE_USERNAME = 'instagram';
const ENDPOINT = (t) =>
  `https://ensembledata.com/apis/instagram/user/info?username=${PROBE_USERNAME}&token=${t}`;

async function probeOne(token) {
  const t0 = Date.now();
  try {
    const res = await fetch(ENDPOINT(token), { method: 'GET' });
    const status = res.status;
    let body = '';
    try { body = (await res.text()).slice(0, 200); } catch {}
    const dur = Date.now() - t0;
    let verdict = 'unknown';
    if (status === 200) verdict = 'valid';
    else if (status === 495 || status === 491) verdict = 'exhausted';
    else if (status === 401 || status === 403) verdict = 'unauthorized';
    else if (status === 404 || status === 422) verdict = 'invalid';
    else if (status === 429) verdict = 'rate_limited';
    else if (status >= 500) verdict = 'server_error';
    return { token, status, verdict, dur, body: body.slice(0, 80) };
  } catch (err) {
    return { token, status: 0, verdict: 'network_error', dur: Date.now() - t0, error: String(err).slice(0, 100) };
  }
}

async function main() {
  console.log(`[validate-tokens-now] Probing ${TOKEN_POOL.length} tokens against /user/info...\n`);

  const results = [];
  for (let i = 0; i < TOKEN_POOL.length; i++) {
    const r = await probeOne(TOKEN_POOL[i]);
    results.push(r);
    const icon =
      r.verdict === 'valid' ? '✅' :
      r.verdict === 'exhausted' ? '⛔' :
      r.verdict === 'unauthorized' ? '🔒' :
      r.verdict === 'invalid' ? '❌' :
      r.verdict === 'rate_limited' ? '⏱️ ' :
      r.verdict === 'server_error' ? '🟠' :
      '❓';
    process.stdout.write(`  [${String(i+1).padStart(2)}/${TOKEN_POOL.length}] ${icon} ${r.token}  ${r.verdict.padEnd(13)} status=${r.status} dur=${r.dur}ms\n`);
    await new Promise(r => setTimeout(r, 300)); // 300ms between calls, gentle
  }

  const validTokens = results.filter(r => r.verdict === 'valid').map(r => r.token);
  const exhausted = results.filter(r => r.verdict === 'exhausted').length;
  const other = results.length - validTokens.length - exhausted;

  console.log(`\n[validate-tokens-now] Summary:`);
  console.log(`  ✅ valid:        ${validTokens.length}`);
  console.log(`  ⛔ exhausted:    ${exhausted}`);
  console.log(`  ⚠️  other:       ${other} (unauthorized/invalid/rate_limited/server_error/network_error)`);
  console.log(`\n[validate-tokens-now] Valid tokens (use these for ENSEMBLEDATA_TOKENS):`);
  if (validTokens.length > 0) {
    validTokens.forEach(t => console.log(`  ${t}`));
    console.log(`\n  Set in .env as:`);
    console.log(`  ENSEMBLEDATA_TOKENS=${validTokens.join(',')}`);
  } else {
    console.log(`  (none)`);
  }

  // Save JSON for future reference
  const outPath = path.join(process.cwd(), 'scripts', 'token-validation-now.json');
  fs.writeFileSync(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    probeEndpoint: '/apis/instagram/user/info?username=instagram',
    summary: { total: results.length, valid: validTokens.length, exhausted, other },
    validTokens,
    results
  }, null, 2));
  console.log(`\n[validate-tokens-now] Saved: ${outPath}`);

  // Recommendation based on count
  if (validTokens.length === 0) {
    console.log(`\n[validate-tokens-now] ❌ ZERO valid tokens — disable ENSEMBLEDATA scraping entirely.`);
    process.exit(2);
  } else if (validTokens.length === 1) {
    console.log(`\n[validate-tokens-now] ⚠️ Only 1 valid token — recommend SKIP ENSEMBLEDATA scraping (use existing data).`);
    process.exit(3);
  } else if (validTokens.length < 5) {
    console.log(`\n[validate-tokens-now] ⚠️ Only ${validTokens.length} valid tokens — scraping OK but rate-limited.`);
    process.exit(0);
  } else {
    console.log(`\n[validate-tokens-now] ✅ ${validTokens.length} valid tokens — full scraping OK.`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
