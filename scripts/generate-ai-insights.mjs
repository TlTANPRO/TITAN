// AI insight pre-generation pipeline untuk TITAN V10.
//
// Orchestrate ~30 LLM calls via Cloudflare Worker proxy:
//   9 accounts × 3 insights (viral recipe, growth strategy, strategy brief) = 27
//   1 weekly briefing (cross-account)
//   = 28 total calls per cycle (~25K tokens, <1 minute on Haiku)
//
// Output: src/data/ai-insights.json (lazy-loaded on demand)
//
// Usage:
//   node scripts/generate-ai-insights.mjs              # full run
//   node scripts/generate-ai-insights.mjs only=ig-xxx   # single account
//   node scripts/generate-ai-insights.mjs briefing=1    # only weekly briefing
//
// Re-run anytime untuk regenerate. Cache invalidation manual (data hash check optional).
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_ACCOUNTS } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'src', 'data');
const PROMPTS_DIR = path.join(__dirname, 'prompts');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts-full.json');

const NICHE_OF = {
  'majangmejeng_': 'properti / desain interior',
  'syahfalahproperti': 'properti / real estate',
  'ardiantanah': 'properti / legal tanah',
  'ardian.tanah': 'properti / legal tanah',
  'ardiantanahmenjawab': 'edukasi properti / legal',
  'nisyanandaa': 'lifestyle / personal brand',
  'itsnisyananda': 'lifestyle / personal brand'
};

async function loadFullAccounts() {
  const raw = await fs.readFile(ACCOUNTS_FILE, 'utf-8');
  return JSON.parse(raw);
}

// ===== Worker config =====
const WORKER_URL = process.env.VITE_LLM_PROXY_URL || 'https://titan-llm-proxy.nickasad10007.workers.dev';
const MODEL = process.env.AI_MODEL || 'gemini-flash-lite-latest'; // free, supports streaming, no 429 for new projects
const TEMP = 0.7;
const MAX_TOKENS = 1500;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ===== LLM call via Worker (returns SSE stream, parse & concatenate deltas) =====
async function callLLM(messages) {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Titan-Provider': 'auto'
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: TEMP,
      max_tokens: MAX_TOKENS,
      stream: true
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Worker ${res.status}: ${text.slice(0, 200)}`);
  }
  // Parse SSE: "data: {json}\n\n" lines, terminate on "data: [DONE]"
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return content;
      try {
        const j = JSON.parse(payload);
        const delta = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? '';
        if (delta) content += delta;
      } catch { /* skip non-JSON line */ }
    }
  }
  return content;
}

// ===== Prompt loaders =====
async function loadPrompt(name, ctx) {
  const tpl = await fs.readFile(path.join(PROMPTS_DIR, `${name}.md`), 'utf-8');
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => ctx[k] ?? '');
}

// ===== Context builders =====
function buildAccountContext(acc) {
  const posts = acc.posts ?? [];
  const totalLikes = posts.reduce((s, p) => s + (p.likeCount ?? 0), 0);
  const totalComments = posts.reduce((s, p) => s + (p.commentCount ?? 0), 0);
  const totalViews = posts.reduce((s, p) => s + (p.viewCount ?? 0), 0);
  const totalShares = posts.reduce((s, p) => s + (p.shareCount ?? 0), 0);
  const avgLikes = posts.length > 0 ? Math.round(totalLikes / posts.length) : 0;
  const avgComments = posts.length > 0 ? Math.round(totalComments / posts.length) : 0;
  const avgViews = posts.length > 0 ? Math.round(totalViews / posts.length) : 0;
  const er = acc.platform === 'tiktok'
    ? (totalViews > 0 ? ((totalLikes + totalComments + totalShares) / totalViews * 100) : 0)
    : (acc.followerCount > 0 ? ((totalLikes + totalComments) / Math.max(1, posts.length) / acc.followerCount * 100) : 0);
  return {
    username: acc.username,
    platform: acc.platform,
    displayName: acc.displayName ?? acc.username,
    niche: acc.niche ?? 'properti',
    followerCount: acc.followerCount ?? 0,
    postCount: posts.length,
    avgLikes, avgComments, avgViews,
    engagementRate: Math.round(er * 100) / 100,
    topPost: posts.filter((p) => p.viewCount > 0).sort((a, b) => b.viewCount - a.viewCount)[0] ?? null
  };
}

function buildCrossAccountContext(accounts) {
  const lastWeek = Date.now() / 1000 - 7 * 86400;
  const recent = [];
  for (const acc of accounts) {
    for (const p of acc.posts ?? []) {
      if (p.createTime >= lastWeek) {
        recent.push({ ...p, platform: acc.platform, username: acc.username });
      }
    }
  }
  recent.sort((a, b) => b.viewCount - a.viewCount);
  // Anti-hallucination: build explicit account list with @ prefix + platform + followers.
  // The LLM prompt instructs it to ONLY cite these names.
  const accountList = accounts
    .map((a) => `- @${a.username} (${a.platform}, ${a.followerCount ?? 0} followers)`)
    .join('\n');
  return {
    accountCount: accounts.length,
    igCount: accounts.filter((a) => a.platform === 'instagram').length,
    ttCount: accounts.filter((a) => a.platform === 'tiktok').length,
    accountList,
    totalPostsThisWeek: recent.length,
    topViral: recent.slice(0, 3).map((p) => ({ username: p.username, platform: p.platform, viewCount: p.viewCount, likeCount: p.likeCount }))
  };
}

// ===== Insight generation per account =====
async function generateAccountInsights(acc) {
  const ctx = buildAccountContext(acc);
  const slug = acc.slug;

  // 1. Viral recipe
  const viralTpl = await loadPrompt('viral-recipe', ctx);
  const viralMessages = [{ role: 'user', content: viralTpl }];

  // 2. Growth strategy
  const growthTpl = await loadPrompt('growth-strategy', ctx);
  const growthMessages = [{ role: 'user', content: growthTpl }];

  // 3. Strategy brief
  const briefTpl = await loadPrompt('strategy-brief', ctx);
  const briefMessages = [{ role: 'user', content: briefTpl }];

  console.log(`  [${slug}] generating 3 insights...`);
  const [viralRecipe, growthStrategy, strategyBrief] = await Promise.all([
    callLLM(viralMessages).catch((e) => `⚠️ Error: ${e.message}`),
    callLLM(growthMessages).catch((e) => `⚠️ Error: ${e.message}`),
    callLLM(briefMessages).catch((e) => `⚠️ Error: ${e.message}`)
  ]);

  return { viralRecipe, growthStrategy, strategyBrief, generatedAt: new Date().toISOString() };
}

// ===== Weekly briefing =====
async function generateWeeklyBriefing(accounts) {
  const ctx = buildCrossAccountContext(accounts);
  const tpl = await loadPrompt('weekly-briefing', ctx);
  const messages = [{ role: 'user', content: tpl }];
  console.log(`  [weekly] generating...`);
  return callLLM(messages).catch((e) => `⚠️ Error: ${e.message}`);
}

// ===== Main =====
async function main() {
  const args = process.argv.slice(2);
  const onlySlug = args.find((a) => a.startsWith('only='))?.split('=')[1];
  const briefingOnly = args.includes('briefing=1');

  // Load full account data (posts + stats) from data file
  const fullAccounts = await loadFullAccounts();
  // Map slug -> merged record (account meta + posts + stats)
  const accountsBySlug = {};
  for (const rec of fullAccounts) {
    const slug = rec.account?.slug;
    if (!slug) continue;
    accountsBySlug[slug] = {
      slug,
      username: rec.account.username,
      displayName: rec.account.displayName ?? rec.account.username,
      platform: rec.platform,
      niche: NICHE_OF[rec.account.username] ?? 'properti',
      followerCount: rec.account.followerCount ?? 0,
      posts: rec.posts ?? []
    };
  }

  // Resolve target list
  const targetMeta = onlySlug
    ? ALL_ACCOUNTS.filter((a) => a.slug === onlySlug)
    : ALL_ACCOUNTS;
  const targetAccounts = targetMeta
    .map((m) => accountsBySlug[m.slug])
    .filter(Boolean);

  console.log(`\nResolved ${targetAccounts.length} account(s) with post data:`);
  for (const a of targetAccounts) {
    console.log(`  - ${a.slug} (${a.platform}, ${a.posts.length} posts, ${a.followerCount} followers)`);
  }

  if (targetAccounts.length === 0) {
    console.error('No accounts found with data. Run `pnpm pipeline` first.');
    process.exit(1);
  }

  // Load existing insights (for partial regen)
  const outFile = path.join(DATA_DIR, 'ai-insights.json');
  let existing = { generatedAt: null, weekly: null, accounts: {} };
  try {
    existing = JSON.parse(await fs.readFile(outFile, 'utf-8'));
  } catch { /* first run */ }

  const result = { ...existing, generatedAt: new Date().toISOString() };

  // Weekly briefing
  if (!onlySlug) {
    console.log(`\n=== Generating weekly briefing ===`);
    try {
      let text = await generateWeeklyBriefing(targetAccounts);
      // Anti-hallucination safety net: strip any @-mention that is not in the real account list.
      // Catches single-character typos like "@ardiantanah." (extra period) or
      // accidental LLM inventions.
      const realUsernames = new Set(targetAccounts.map((a) => a.username));
      text = text.replace(/@([A-Za-z0-9_.]+)/g, (match, name) => {
        return realUsernames.has(name) ? match : '';
      });
      result.weekly = text;
      console.log(`  ✓ weekly briefing generated (${result.weekly.length} chars)`);
    } catch (e) {
      console.error(`  ✗ weekly briefing failed: ${e.message}`);
    }
    await sleep(1000);
  }

  if (briefingOnly) {
    await fs.writeFile(outFile, JSON.stringify(result, null, 2));
    console.log(`\n✓ Saved (briefing only) to ${outFile}`);
    return;
  }

  // Per-account insights
  result.accounts = result.accounts ?? {};
  for (const acc of targetAccounts) {
    try {
      const insights = await generateAccountInsights(acc);
      result.accounts[acc.slug] = insights;
      console.log(`  ✓ @${acc.username} done`);
    } catch (e) {
      console.error(`  ✗ @${acc.username} failed: ${e.message}`);
    }
    await sleep(800); // rate limit politeness
  }

  await fs.writeFile(outFile, JSON.stringify(result, null, 2));
  console.log(`\n✓ Saved ${Object.keys(result.accounts).length} account insights + briefing to ${outFile}`);
  console.log(`  File size: ${(JSON.stringify(result).length / 1024).toFixed(1)} KB`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
