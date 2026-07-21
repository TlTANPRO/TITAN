// Pre-flight deploy check — verify accounts-full.json is safe to ship
// Per spec: 9 akun, ≥3705 posts, cross-dup=0, VITE_LLM_PROXY_URL set
// Run BEFORE `pnpm run deploy` to catch silent regressions
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_JSON = path.join(__dirname, '..', 'accounts-full.json');
const LIVE_URL = 'https://tltanpro.github.io/TITAN/accounts-full.json';
const MIN_POSTS = 3705;
const EXPECTED_ACCOUNTS = 9;

const checks = [];

function record(name, status, detail) {
  checks.push({ name, status, detail });
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`  ${icon} ${name}: ${status} — ${detail}`);
}

async function fetchLive() {
  // Fetch live JSON for comparison
  try {
    const res = await fetch(LIVE_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

async function check1_FileExists() {
  try {
    const data = JSON.parse(await fs.readFile(LOCAL_JSON, 'utf-8'));
    if (!Array.isArray(data)) {
      return record('1. Local JSON exists + valid array', 'FAIL', 'not an array');
    }
    return record('1. Local JSON exists + valid array', 'PASS', `${data.length} accounts`);
  } catch (e) {
    return record('1. Local JSON exists + valid array', 'FAIL', e.message.slice(0, 80));
  }
}

async function check2_AccountCount(local) {
  const n = local.length;
  if (n !== EXPECTED_ACCOUNTS) {
    return record('2. Account count = 9', 'FAIL', `got ${n}`);
  }
  return record('2. Account count = 9', 'PASS', `${n} accounts`);
}

async function check3_TotalPosts(local) {
  const total = local.reduce((s, a) => s + (a.posts?.length ?? 0), 0);
  if (total < MIN_POSTS) {
    return record(`3. Total posts >= ${MIN_POSTS}`, 'FAIL', `got ${total} (regression!)`);
  }
  return record(`3. Total posts >= ${MIN_POSTS}`, 'PASS', `got ${total}`);
}

async function check4_CrossDup(local) {
  // Composite key per V29.1: platform:shortcode
  const seen = new Set();
  let dup = 0;
  for (const a of local) {
    for (const p of a.posts ?? []) {
      const key = `${a.platform}:${p.shortcode ?? p.id ?? ''}`;
      if (seen.has(key)) {
        dup++;
      } else {
        seen.add(key);
      }
    }
  }
  if (dup > 0) {
    return record('4. Cross-dup = 0', 'FAIL', `${dup} duplicates found`);
  }
  return record('4. Cross-dup = 0', 'PASS', `${seen.size} unique posts`);
}

async function check5_LiveBaseline(local) {
  const live = await fetchLive();
  if (live.error) {
    return record('5. Live baseline fetched', 'FAIL', live.error.slice(0, 80));
  }
  const liveTotal = live.reduce((s, a) => s + (a.posts?.length ?? 0), 0);
  const localTotal = local.reduce((s, a) => s + (a.posts?.length ?? 0), 0);
  if (localTotal < liveTotal) {
    return record('5. Local >= live total', 'FAIL', `local=${localTotal} live=${liveTotal}`);
  }
  return record('5. Local >= live total', 'PASS', `local=${localTotal} live=${liveTotal}`);
}

async function main() {
  console.log('=== TITAN Pre-flight Deploy Check ===\n');

  // Run checks in order; abort early if file missing
  await check1_FileExists();
  if (checks[0].status === 'FAIL') {
    console.log('\n❌ Local JSON missing. Run generate-data.mjs first.');
    process.exit(1);
  }

  const local = JSON.parse(await fs.readFile(LOCAL_JSON, 'utf-8'));
  await check2_AccountCount(local);
  await check3_TotalPosts(local);
  await check4_CrossDup(local);
  await check5_LiveBaseline(local);

  console.log('\n=== Summary ===');
  const pass = checks.filter(c => c.status === 'PASS').length;
  const fail = checks.filter(c => c.status === 'FAIL').length;
  console.log(`Total: ${checks.length} | PASS: ${pass} | FAIL: ${fail}`);

  if (fail > 0) {
    console.log('\n❌ Pre-flight failed. DO NOT deploy. Fix issues first.');
    process.exit(1);
  }
  console.log('\n✅ Pre-flight PASS. Safe to run: pnpm run deploy');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
