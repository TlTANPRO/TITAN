// validate-tokens.mjs — Test 32 ENSEMBLEDATA tokens untuk filter valid/exhausted/invalid
// Usage: node scripts/validate-tokens.mjs
// Output: scripts/token-validation-18jul.json

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const TOKENS = (process.env.ENSEMBLEDATA_TOKENS || '').split(',').map(s => s.trim()).filter(Boolean);
const PROBE_USERNAME = 'instagram'; // 1 cheap call per token
const ENDPOINT = (t) =>
  `https://ensembledata.com/apis/instagram/user/info?username=${PROBE_USERNAME}&token=${t}`;

if (TOKENS.length === 0) {
  console.error('[validate-tokens] No tokens in .env (ENSEMBLEDATA_TOKENS)');
  process.exit(1);
}

console.log(`[validate-tokens] Testing ${TOKENS.length} tokens against /user/info...`);

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
    else if (status === 401 || status === 403 || status === 404 || status === 422) verdict = 'invalid';
    else if (status === 429) verdict = 'rate_limited';
    else if (status >= 500) verdict = 'server_error';

    return { token: token.slice(0, 6) + '...', status, verdict, dur, body: body.slice(0, 100) };
  } catch (err) {
    return { token: token.slice(0, 6) + '...', status: 0, verdict: 'network_error', dur: Date.now() - t0, error: String(err).slice(0, 100) };
  }
}

// Probe all sequentially with small delay (avoid hammering)
const results = [];
for (let i = 0; i < TOKENS.length; i++) {
  const r = await probeOne(TOKENS[i]);
  results.push(r);
  process.stdout.write(`  [${i+1}/${TOKENS.length}] ${r.verdict.padEnd(12)} status=${r.status} dur=${r.dur}ms\n`);
  await new Promise(r => setTimeout(r, 250)); // 250ms between calls
}

// Summary
const summary = {
  total: results.length,
  valid: results.filter(r => r.verdict === 'valid').length,
  exhausted: results.filter(r => r.verdict === 'exhausted').length,
  invalid: results.filter(r => r.verdict === 'invalid').length,
  rate_limited: results.filter(r => r.verdict === 'rate_limited').length,
  server_error: results.filter(r => r.verdict === 'server_error').length,
  network_error: results.filter(r => r.verdict === 'network_error').length,
};

console.log('\n[validate-tokens] Summary:');
console.log(`  valid:        ${summary.valid}`);
console.log(`  exhausted:    ${summary.exhausted}`);
console.log(`  invalid:      ${summary.invalid}`);
console.log(`  rate_limited: ${summary.rate_limited}`);
console.log(`  server_error: ${summary.server_error}`);
console.log(`  network_err:  ${summary.network_error}`);

// Output JSON
const outPath = path.join(process.cwd(), 'scripts', 'token-validation-18jul.json');
fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2));
console.log(`\n[validate-tokens] Saved: ${outPath}`);

if (summary.valid === 0) {
  console.error('\n[validate-tokens] ❌ No valid tokens found! Check token supply.');
  process.exit(1);
}

if (summary.valid < 10) {
  console.warn(`\n[validate-tokens] ⚠️ Only ${summary.valid} valid tokens (target ≥ 10). May need to use fallback providers.`);
}

// Exit 0 even if some tokens are bad — we got info
process.exit(0);
