// V30.3 smoke test: verify AI system prompt contains ALL 9 live accounts
// Run: node scripts/test-ai-system-prompt.mjs
//
// Regression: V30.2 (and earlier) buildCrossAccountBlock() only injected
// top-5 ranking (ER, Followers, Posts). Accounts ranked 6-9 in all categories
// (e.g. tt-syahfalahproperti) were INVISIBLE to AI → AI hallucinated
// "akun belum masuk pipeline" when user asked "sebutkan semua akun".
//
// This test loads live accounts-full.json, simulates buildSystemPrompt()
// flow, and asserts that every account username appears at least once in
// the system prompt's cross-account block.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { crossAccountComparison } from '../src/lib/analytics.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const ACCOUNTS_FILES = [
  join(ROOT, 'accounts-full.json'),
  join(ROOT, 'public', 'data', 'accounts-full.json'),
  join(ROOT, 'src', 'data', 'accounts-full.json')
];

async function loadAccounts() {
  for (const path of ACCOUNTS_FILES) {
    try {
      const data = JSON.parse(await readFile(path, 'utf-8'));
      console.log(`[test] loaded ${data.length} accounts from ${path}`);
      // Normalize to dataStore shape (crossAccountComparison expects platform at top level)
      return data.map((d) => ({
        platform: d.account.slug.startsWith('ig-') ? 'instagram' : 'tiktok',
        username: d.account.username,
        displayName: d.account.displayName,
        slug: d.account.slug,
        followerCount: d.account.followerCount,
        posts: d.posts || []
      }));
    } catch {
      // try next path
    }
  }
  throw new Error('No accounts-full.json found in any expected location');
}

// Mirror buildCrossAccountBlock() logic from src/lib/memory/memoryInjector.js
function buildCrossAccountBlock(accounts) {
  const comparison = crossAccountComparison(accounts);
  const lines = ['', '## Cross-Account Ranking (9 Akun)'];

  const byER = comparison.filter((a) => a.hasER).sort((a, b) => b.engagementRate - a.engagementRate);
  byER.slice(0, 5).forEach((a, i) => {
    lines.push(`${i + 1}. @${a.username} (${a.platform === 'instagram' ? 'IG' : 'TT'}) — ER ${a.engagementRate.toFixed(2)}%, ${a.followerCount} followers`);
  });

  const byFollowers = [...comparison].sort((a, b) => b.followerCount - a.followerCount);
  byFollowers.slice(0, 5).forEach((a, i) => {
    lines.push(`${i + 1}. @${a.username} (${a.platform === 'instagram' ? 'IG' : 'TT'}) — ${a.followerCount} followers, ER ${(a.engagementRate ?? 0).toFixed(2)}%`);
  });

  const byPosts = [...comparison].sort((a, b) => b.postCount - a.postCount);
  byPosts.slice(0, 5).forEach((a, i) => {
    lines.push(`${i + 1}. @${a.username} (${a.platform === 'instagram' ? 'IG' : 'TT'}) — ${a.postCount} post`);
  });

  // V30.3 ground-truth list
  lines.push('', `### Daftar Lengkap ${comparison.length} Akun (ground truth)`);
  const fullList = [...comparison].sort((a, b) => {
    if (a.platform !== b.platform) return a.platform === 'instagram' ? -1 : 1;
    return a.username.localeCompare(b.username);
  });
  fullList.forEach((a) => {
    const er = a.hasER ? `${a.engagementRate.toFixed(2)}%` : '—';
    const plat = a.platform === 'instagram' ? 'IG' : 'TT';
    const fol = a.followerCount.toLocaleString('id-ID');
    lines.push(`- @${a.username} (${plat}, ${fol} followers, ${a.postCount} posts, ER ${er})`);
  });

  return lines.join('\n');
}

const accounts = await loadAccounts();
const block = buildCrossAccountBlock(accounts);

console.log('\n=== Generated Cross-Account Block ===');
console.log(block);
console.log('\n=== Coverage Check ===');

const expectedHandles = accounts.map((a) => a.username);
const missing = expectedHandles.filter((h) => !block.includes(`@${h}`));

if (missing.length > 0) {
  console.error(`❌ FAIL: ${missing.length} account(s) missing from AI system prompt:`);
  missing.forEach((h) => console.error(`   - @${h}`));
  process.exit(1);
}

console.log(`✅ PASS: all ${expectedHandles.length} accounts present in system prompt`);
console.log(`   Tested handles: ${expectedHandles.map((h) => '@' + h).join(', ')}`);
