// TITAN LLM Proxy — Cloudflare Worker (v3: round-robin + provider config)
//
// Changelog vs v2:
//   v3.0  Round-robin key rotation within provider (16 Google keys all used evenly)
//         via Cloudflare Worker state (per-instance best-effort, sufficient for free tier).
//   v3.0  Removed Groq (per user request: simpler chain, less config surface).
//   v3.0  OpenRouter pinned to free models only (`:free` suffix). Filters out paid models.
//   v3.0  Cohere kept as last resort. Add `COHERE_KEYS` to enable.
//   v3.0  Jina search/read unchanged. Key still required.
//
// Capabilities:
//   • Multi-key rotation per provider (comma-separated in env)
//   • Round-robin: each call uses NEXT key, not key#1 always
//   • Auto-rotation on 429/5xx/auth/credit error, transparently try next
//   • Multi-provider chain: google → openrouter (free only) → cohere
//   • Jina AI integration (web search s.jina.ai + reader r.jina.ai) — free tier fallback
//
// Request shape (POST):
//   Headers: X-Titan-Provider (auto|google|openrouter|cohere|jina), X-Titan-Action (chat|search|read|social)
//   Body:    { model?, messages: [...], temperature?, max_tokens?, stream: true }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type, X-Titan-Provider, X-Titan-Action',
  'Access-Control-Max-Age': '86400'
};

// ============ Round-robin key state ============
// Cloudflare Workers are single-threaded per isolate, and we hold no persistence.
// Per-isolate round-robin counter is good enough for free-tier load distribution.
// Maps: providerName -> lastUsedIndex (in-memory, resets on Worker restart)
const rrIndex = new Map();
function nextKeyIndex(providerName, totalKeys) {
  if (totalKeys <= 1) return 0;
  const cur = rrIndex.get(providerName) ?? -1;
  const next = (cur + 1) % totalKeys;
  rrIndex.set(providerName, next);
  return next;
}

// OpenRouter free-model allowlist — verified 16 Jul 2026 via /api/v1/models.
// Only models that (a) appear in the free-tier list and (b) actually return
// 200 OK on chat.completions are included. Older models in v2's list (llama-3.1
// 8b, qwen-2.5-72b, gemma-2 family, dolphin, hermes-3 405b) all 404/429 —
// removed.
const OPENROUTER_FREE_MODELS = new Set([
  'openai/gpt-oss-20b:free',                       // verified 200 OK
  'google/gemma-4-26b-a4b-it:free',                // verified 200 OK ("Halo")
  'google/gemma-4-31b-it:free',                    // listed, currently rate-limited
  'meta-llama/llama-3.2-3b-instruct:free',         // listed
  'meta-llama/llama-3.3-70b-instruct:free',        // listed
  'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'qwen/qwen3-coder:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'tencent/hy3:free',
  'poolside/laguna-xs-2.1:free',
  'poolside/laguna-m.1:free',
  'cohere/north-mini-code:free',
  'nvidia/nemotron-3.5-content-safety:free',
  'nousresearch/hermes-3-llama-3.1-405b:free'
]);

function pickOpenRouterModel(requested) {
  if (requested && OPENROUTER_FREE_MODELS.has(requested)) return requested;
  // Default to a model that was 200 OK in our verification
  return 'google/gemma-4-26b-a4b-it:free';
}

// ============ Provider registry ============
const PROVIDERS = {
  openrouter: {
    label: 'OpenRouter (free only)',
    envKey: 'OPENROUTER_API_KEYS',
    buildUrl: () => 'https://openrouter.ai/api/v1/chat/completions',
    buildHeaders: (key) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'HTTP-Referer': 'https://tltanpro.github.io/TITAN/',
      'X-Title': 'TITAN'
    }),
    buildBody: (model, messages, opts) => ({
      model: pickOpenRouterModel(model),
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.max_tokens ?? 1024,
      stream: true
    }),
    parseStreamChunk: (chunk) => {
      const lines = chunk.split('\n').filter(l => l.startsWith('data: ') && l !== 'data: [DONE]');
      let out = '';
      for (const line of lines) {
        try { out += JSON.parse(line.slice(6)).choices?.[0]?.delta?.content ?? ''; } catch {}
      }
      return out;
    }
  },

  google: {
    label: 'Google AI Studio',
    envKey: 'GOOGLE_KEYS',
    buildUrl: (model, key) => `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-flash-lite-latest'}:streamGenerateContent?alt=sse&key=${key}`,
    buildHeaders: () => ({ 'Content-Type': 'application/json' }),
    buildBody: (model, messages, opts) => {
      const contents = [];
      let systemText = '';
      for (const m of messages) {
        if (m.role === 'system') systemText += m.content + '\n';
        else contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content || '' }] });
      }
      const body = {
        contents,
        generationConfig: { temperature: opts.temperature ?? 0.7, maxOutputTokens: opts.max_tokens ?? 1024 }
      };
      if (systemText.trim()) body.systemInstruction = { parts: [{ text: systemText.trim() }] };
      return body;
    },
    parseStreamChunk: (chunk) => {
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
      let out = '';
      for (const line of lines) {
        try { out += JSON.parse(line.slice(6)).candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? ''; } catch {}
      }
      return out;
    }
  },

  cohere: {
    label: 'Cohere',
    envKey: 'COHERE_KEYS',
    buildUrl: () => 'https://api.cohere.com/v1/chat?stream=true',
    buildHeaders: (key) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    }),
    buildBody: (model, messages, opts) => {
      const lastUser = messages.filter(m => m.role === 'user').pop();
      const chatHistory = messages.filter(m => m.role !== 'system' && m !== lastUser).map(m => ({
        role: m.role === 'assistant' ? 'CHATBOT' : 'USER',
        message: m.content
      }));
      const sys = messages.find(m => m.role === 'system');
      const body = {
        message: lastUser?.content ?? '',
        chat_history: chatHistory,
        model: model || 'command-r-plus',
        stream: true,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.max_tokens ?? 1024
      };
      if (sys) body.preamble = sys.content;
      return body;
    },
    parseStreamChunk: (chunk) => {
      let out = '';
      for (const line of chunk.split('\n').filter(l => l.trim().startsWith('{'))) {
        try {
          const j = JSON.parse(line);
          if (j.event_type === 'text-generation') out += j.text ?? '';
        } catch {}
      }
      return out;
    }
  }
};

// Jina handles web search (s.jina.ai) and reader (r.jina.ai), not chat LLM
async function callJina(env, action, payload) {
  const keys = (env.JINA_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
  if (keys.length === 0) return { ok: false, error: 'JINA_KEYS not set on worker' };

  const endpoint = action === 'search'
    ? 'https://s.jina.ai/'
    : action === 'read'
    ? 'https://r.jina.ai/'
    : null;
  if (!endpoint) return { ok: false, error: 'Unknown Jina action' };

  // Round-robin starting point for keys
  const startIdx = nextKeyIndex('jina', keys.length);
  const errors = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(startIdx + i) % keys.length];
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${key}`,
          'X-Return-Format': 'json'
        },
        body: JSON.stringify(action === 'search'
          ? { q: payload.query, num: payload.maxResults ?? 5 }
          : { url: payload.url })
      });
      if (res.ok) {
        const data = await res.json();
        return { ok: true, data, source: 'jina' };
      }
      const errText = await res.text().catch(() => '');
      errors.push(`Jina ${res.status}: ${errText.slice(0, 100)}`);
      if (res.status === 429 || res.status >= 500) continue;
      break;
    } catch (e) {
      errors.push(`Jina network: ${e.message}`);
      continue;
    }
  }
  return { ok: false, error: errors.join(' | ') };
}

// ============ Bot UA fetch (Instagram/TikTok/YouTube OG meta bypass) ============
const BOT_UAS = [
  'Mozilla/5.0 (compatible; LinkedInBot/1.0)',
  'Pinterestbot/1.0 (+http://www.pinterest.com/bot.html)',
  'Mozilla/5.0 (compatible; Discordbot/2.0)',
  'Mozilla/5.0 (compatible; Slackbot-LinkExpanding/1.0)',
  'Mozilla/5.0 (compatible; TelegramBot/1.0)',
  'Mozilla/5.0 (compatible; SkypeUriPreview/1.0)',
];

async function fetchSocialOG(url) {
  const errors = [];
  for (const ua of BOT_UAS) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });
      if (!res.ok) { errors.push(`UA ${ua.slice(0, 30)}: HTTP ${res.status}`); continue; }
      const html = await res.text();
      if (/Log into Instagram|Sign up · Instagram|Log in to Instagram/i.test(html)) {
        errors.push(`UA ${ua.slice(0, 30)}: login wall`);
        continue;
      }
      const desc = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)/i)?.[1]
                || html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)/i)?.[1];
      const title = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)/i)?.[1];
      const image = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i)?.[1];
      if (desc || title) {
        return { ok: true, title, description: desc, image, userAgent: ua };
      }
      errors.push(`UA ${ua.slice(0, 30)}: no og meta`);
    } catch (e) {
      errors.push(`UA ${ua.slice(0, 30)}: ${e.message}`);
    }
  }
  return { ok: false, error: errors.join(' | ') };
}

// ============ Image proxy (avatar/etc) ============
async function handleAvatarProxy(request, env) {
  const url = new URL(request.url);
  const target = url.searchParams.get('url');
  const w = parseInt(url.searchParams.get('w') || '192', 10);
  const h = parseInt(url.searchParams.get('h') || '192', 10);

  if (!target || !/^https?:\/\//i.test(target)) {
    return json({ error: 'Missing or invalid url param' }, 400);
  }

  try {
    const res = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      cf: { cacheTtl: 86400, cacheEverything: true },
    });

    if (!res.ok) {
      return new Response(`Upstream ${res.status}`, { status: 502, headers: CORS });
    }

    const contentType = res.headers.get('Content-Type') || 'image/jpeg';
    const headers = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, immutable',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Titan-Size-W': String(w),
      'X-Titan-Size-H': String(h),
    };

    return new Response(res.body, { status: 200, headers });
  } catch (e) {
    return json({ error: `Avatar fetch failed: ${e.message}` }, 502);
  }
}

// ============ /refresh (V11) — trigger GitHub Actions workflow ============
// Cloudflare Workers can't spawn subprocesses, so we dispatch a workflow run
// via the GitHub Actions API. The action then re-scrapes data and pushes
// the resulting JSON back to the repo (which the GitHub Pages site picks up).
//
// Required env: GH_PAT (Personal Access Token with `workflow` scope).
// Required vars (set as Worker vars, NOT secrets): GH_OWNER, GH_REPO, GH_WORKFLOW
const REFRESH_JOB_TTL_MS = 30 * 60 * 1000; // 30 min
const refreshJobs = new Map(); // jobId -> { status, startedAt, lastChecked, conclusion, logsUrl }

async function handleRefresh(request, env, ctx) {
  if (!env.GH_PAT || !env.GH_OWNER || !env.GH_REPO || !env.GH_WORKFLOW) {
    return json({
      error: 'Refresh not configured',
      hint: 'Set Worker env vars: GH_PAT, GH_OWNER, GH_REPO, GH_WORKFLOW. See cloudflare-worker/README.md.',
      fallback: 'client side: reload accounts-full.json?bust=Date.now()'
    }, 503);
  }

  let body = {};
  try { body = await request.json(); } catch {}
  const platforms = Array.isArray(body.platforms) && body.platforms.length > 0
    ? body.platforms
    : ['instagram', 'tiktok'];

  const jobId = crypto.randomUUID();
  const now = Date.now();
  refreshJobs.set(jobId, { status: 'queued', startedAt: now, lastChecked: now, conclusion: null, logsUrl: null });

  // Fire-and-forget: dispatch workflow, then client polls /refresh-status
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(dispatchWorkflow(env, jobId, platforms));
  } else {
    // Fallback: run inline (without ctx, setTimeout polling still works in isolate)
    dispatchWorkflow(env, jobId, platforms);
  }

  return json({
    jobId,
    status: 'queued',
    statusUrl: `/refresh-status?jobId=${jobId}`,
    platforms,
    queuedAt: new Date(now).toISOString()
  }, 202);
}

async function dispatchWorkflow(env, jobId, platforms) {
  const job = refreshJobs.get(jobId);
  if (!job) return;
  job.status = 'in_progress';
  job.lastChecked = Date.now();
  try {
    const url = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/actions/workflows/${env.GH_WORKFLOW}/dispatches`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${env.GH_PAT}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'titan-worker-refresh'
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { platforms: platforms.join(',') }
      })
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      job.status = 'failed';
      job.conclusion = `GitHub API ${res.status}: ${t.slice(0, 200)}`;
      return;
    }
    // Poll workflow run list to surface conclusion
    await pollWorkflowRun(env, jobId);
  } catch (e) {
    job.status = 'failed';
    job.conclusion = e.message;
  }
}

async function pollWorkflowRun(env, jobId) {
  if (!refreshJobs.has(jobId)) return;
  const start = Date.now();
  const interval = 8000; // 8s between polls
  while (Date.now() - start < REFRESH_JOB_TTL_MS) {
    await new Promise((r) => setTimeout(r, interval));
    if (!refreshJobs.has(jobId)) return; // cleaned up
    const j = refreshJobs.get(jobId);
    j.lastChecked = Date.now();
    try {
      const listUrl = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/actions/workflows/${env.GH_WORKFLOW}/runs?per_page=1`;
      const res = await fetch(listUrl, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${env.GH_PAT}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'titan-worker-refresh'
        }
      });
      if (!res.ok) continue;
      const data = await res.json();
      const run = data.workflow_runs?.[0];
      if (!run) continue;
      j.logsUrl = run.html_url;
      if (run.status === 'completed') {
        j.status = run.conclusion === 'success' ? 'success' : 'failed';
        j.conclusion = run.conclusion;
        return;
      }
    } catch {
      // keep polling
    }
  }
  const job = refreshJobs.get(jobId);
  if (job) {
    job.status = 'failed';
    job.conclusion = 'Timed out after 30 minutes';
  }
}

async function handleRefreshStatus(request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get('jobId');
  if (!jobId) return json({ error: 'Missing jobId' }, 400);
  const job = refreshJobs.get(jobId);
  if (!job) return json({ error: 'Unknown jobId', jobId }, 404);

  // Garbage collect: drop jobs older than 1 hour
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, j] of refreshJobs.entries()) {
    if (j.startedAt < cutoff) refreshJobs.delete(id);
  }

  return json({
    jobId,
    status: job.status,
    conclusion: job.conclusion,
    startedAt: new Date(job.startedAt).toISOString(),
    lastChecked: new Date(job.lastChecked).toISOString(),
    logsUrl: job.logsUrl
  });
}

// ============ /account-meta (V11) — list accounts for topbar popover ============
// Returns a minimal list of accounts from accounts-full.json (cached at edge).
async function handleAccountMeta(request, env) {
  const origin = env.PUBLIC_DATA_URL || 'https://tltanpro.github.io/TITAN';
  try {
    const res = await fetch(`${origin}/accounts-full.json`, {
      cf: { cacheTtl: 300, cacheEverything: true }
    });
    if (!res.ok) return json({ error: `Upstream ${res.status}` }, 502);
    const data = await res.json();
    const accounts = Array.isArray(data) ? data : data.accounts ?? [];
    const slim = accounts.map((a) => ({
      slug: a.slug,
      username: a.username,
      platform: a.platform,
      followerCount: a.followerCount,
      avatarUrl: a.avatarUrl,
      postCount: a.postCount ?? a.posts?.length ?? 0
    }));
    return json({ accounts: slim, count: slim.length, generatedAt: new Date().toISOString() });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

// ============ /soft-refresh (V11) — just re-fetch + report metadata ============
// The default behavior: read accounts-full.json (with cache-bust) and return
// metadata so the client can confirm the data is fresh. No scraping, no GH
// API calls, no tokens consumed. This is what the topbar button should call.
async function handleSoftRefresh(request, env) {
  const origin = env.PUBLIC_DATA_URL || 'https://tltanpro.github.io/TITAN';
  try {
    // cache: 'no-store' on Cloudflare side via cf.cacheTtl: 0
    const res = await fetch(`${origin}/accounts-full.json?_=${Date.now()}`, {
      cf: { cacheTtl: 0, cacheEverything: false }
    });
    if (!res.ok) return json({ error: `Upstream ${res.status}` }, 502);
    const data = await res.json();
    const accounts = Array.isArray(data) ? data : data.accounts ?? [];
    const generatedAt = data.generatedAt ?? data.metadata?.generatedAt ?? null;
    const lastModified = res.headers.get('Last-Modified');
    return json({
      ok: true,
      accountCount: accounts.length,
      totalPosts: accounts.reduce((acc, a) => acc + (a.posts?.length ?? a.postCount ?? 0), 0),
      generatedAt,
      lastModified,
      source: origin,
      // Hint to client: use this as the cache-bust target
      reloadUrl: '/data/accounts-full.json',
      triggeredAt: new Date().toISOString()
    });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

// ============ /hard-refresh (V11) — full scrape via GH Actions ============
// Auth: requires Authorization: Bearer <password> matching env.HARD_REFRESH_PASSWORD
// This is a protected endpoint — only used for /settings page after login.
// For cron-based incremental refresh, prefer .github/workflows/incremental.yml
// (no auth, runs on schedule, costs only the GH Actions minutes).
async function handleHardRefresh(request, env, ctx) {
  // Auth check
  const auth = request.headers.get('Authorization') ?? '';
  const expected = env.HARD_REFRESH_PASSWORD ?? '';
  if (!expected) {
    return json({ error: 'Hard refresh not configured. Set Worker secret HARD_REFRESH_PASSWORD.' }, 503);
  }
  if (auth !== `Bearer ${expected}`) {
    return json({ error: 'Invalid credentials' }, 401);
  }

  if (!env.GH_PAT || !env.GH_OWNER || !env.GH_REPO || !env.GH_WORKFLOW) {
    return json({ error: 'GH workflow not configured. See wrangler.toml [vars].' }, 503);
  }

  let body = {};
  try { body = await request.json(); } catch {}
  const platforms = Array.isArray(body.platforms) && body.platforms.length > 0
    ? body.platforms
    : ['instagram', 'tiktok'];

  const jobId = crypto.randomUUID();
  const now = Date.now();
  refreshJobs.set(jobId, { status: 'queued', startedAt: now, lastChecked: now, conclusion: null, logsUrl: null });

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(dispatchWorkflow(env, jobId, platforms));
  } else {
    dispatchWorkflow(env, jobId, platforms);
  }

  return json({
    jobId,
    status: 'queued',
    statusUrl: `/refresh-status?jobId=${jobId}`,
    platforms,
    queuedAt: new Date(now).toISOString()
  }, 202);
}

// ============ Helpers ============
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

function sseStream(transformer) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const delta of transformer) {
          const payload = JSON.stringify({ choices: [{ delta: { content: delta } }] });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    }
  });
}

// ============ LLM streaming with round-robin + fallback ============
// v3: try the round-robin starting key first, then iterate through all keys.
// On 429/5xx/auth/credit, try next key. On 400 (bad request), fail fast
// because trying other keys won't fix a wrong model name.
async function streamWithProvider(env, providerName, body) {
  const provider = PROVIDERS[providerName];
  if (!provider) return { ok: false, error: `Unknown provider: ${providerName}` };

  const keys = (env[provider.envKey] || '').split(',').map(k => k.trim()).filter(Boolean);
  if (keys.length === 0) {
    return { ok: false, error: `${provider.envKey} not set on worker` };
  }

  // Round-robin: start from next key, not always key#0
  const startIdx = nextKeyIndex(providerName, keys.length);

  const errors = [];
  for (let i = 0; i < keys.length; i++) {
    const idx = (startIdx + i) % keys.length;
    const key = keys[idx];
    const url = provider.buildUrl(body.model, key);
    const requestBody = provider.buildBody(body.model, body.messages, body);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: provider.buildHeaders(key),
        body: JSON.stringify(requestBody)
      });

      if (res.ok) {
        const decoder = new TextDecoder();
        const reader = res.body.getReader();
        const wrapped = {
          async *[Symbol.asyncIterator]() {
            let buffer = '';
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const chunks = buffer.split('\n\n');
              buffer = chunks.pop() ?? '';
              for (const c of chunks) {
                const d = provider.parseStreamChunk(c);
                if (d) yield d;
              }
            }
            if (buffer) {
              const d = provider.parseStreamChunk(buffer);
              if (d) yield d;
            }
          }
        };
        return { ok: true, stream: sseStream(wrapped), keyUsed: idx, totalKeys: keys.length };
      }

      const errText = await res.text().catch(() => '');
      const errMsg = `${providerName} key#${idx + 1} HTTP ${res.status}: ${errText.slice(0, 120)}`;
      errors.push(errMsg);
      // 429/5xx: quota, try next key
      if (res.status === 429 || res.status >= 500) continue;
      // 401/402/403: auth/credits, try next key
      if (res.status === 401 || res.status === 402 || res.status === 403) continue;
      // 400: bad request (e.g. model not found for this key/account). Try next key
      // because different keys might have access to different models. If all fail
      // with 400, the provider-level loop will move on to next provider.
      if (res.status === 400) continue;
      // Other 4xx: permanent, stop trying this provider
      break;
    } catch (e) {
      errors.push(`${providerName} key#${idx + 1} network: ${e.message}`);
      continue;
    }
  }
  return { ok: false, error: errors.join(' | '), totalKeys: keys.length };
}

// ============ Main handler ============
export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // V11: /avatar (GET), /refresh (POST, deprecated→hard), /refresh-status (GET),
    //      /account-meta (GET), /soft-refresh (POST, default topbar behavior),
    //      /hard-refresh (POST, auth-protected)
    if (request.method === 'GET' && (path.startsWith('/avatar') || path === '/avatar')) {
      return handleAvatarProxy(request, env);
    }
    if (request.method === 'POST' && path === '/refresh') {
      // Backward-compat: treat old /refresh as hard refresh (was the only option in V10)
      return handleHardRefresh(request, env, ctx);
    }
    if (request.method === 'POST' && path === '/hard-refresh') {
      return handleHardRefresh(request, env, ctx);
    }
    if (request.method === 'POST' && path === '/soft-refresh') {
      return handleSoftRefresh(request, env);
    }
    if (request.method === 'GET' && path === '/refresh-status') {
      return handleRefreshStatus(request);
    }
    if (request.method === 'GET' && path === '/account-meta') {
      return handleAccountMeta(request, env);
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405);
    }

    const provider = request.headers.get('X-Titan-Provider') || 'auto';
    const action = request.headers.get('X-Titan-Action') || 'chat';

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    // ---- Jina web tools (search/read) ----
    if (provider === 'jina' || action === 'search' || action === 'read') {
      const r = await callJina(env, action, body);
      if (r.ok) {
        return new Response(JSON.stringify(r), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...CORS }
        });
      }
      return json({ error: r.error }, 502);
    }

    // ---- Social media OG meta fetch ----
    if (action === 'social' || provider === 'social') {
      const targetUrl = body.url;
      if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        return json({ error: 'Invalid url' }, 400);
      }
      const r = await fetchSocialOG(targetUrl);
      if (r.ok) return json(r, 200);
      return json({ error: r.error }, 502);
    }

    // ---- Image proxy (avatar/etc) ----
    if (path.startsWith('/avatar') || action === 'avatar') {
      return handleAvatarProxy(request, env);
    }

    // ---- LLM chat with provider chain ----
    // v3 chain: google (free, primary, 16 keys round-robin) → openrouter (free models only) → cohere
    // Groq REMOVED per user request.
    const chain = provider === 'auto'
      ? ['google', 'openrouter', 'cohere']
      : (PROVIDERS[provider] ? [provider] : null);
    if (!chain) {
      return json({ error: `Unknown provider: ${provider}. Valid: auto, google, openrouter, cohere, jina` }, 400);
    }

    const errors = [];
    for (const pName of chain) {
      const r = await streamWithProvider(env, pName, body);
      if (r.ok) {
        return new Response(r.stream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'X-Titan-Provider': pName,
            'X-Titan-Key': `${r.keyUsed + 1}/${r.totalKeys}`,
            ...CORS
          }
        });
      }
      errors.push(`[${pName}] ${r.error}`);
      if (provider !== 'auto') {
        return json({ error: r.error, provider: pName }, 502);
      }
    }
    return json({
      error: 'All LLM providers failed',
      details: errors,
      hint: 'Cek env vars Worker (GOOGLE_KEYS, OPENROUTER_API_KEYS, COHERE_KEYS). Chain: google → openrouter(free) → cohere.'
    }, 502);
  },

  // ============ V11: scheduled handler (cron backup) ============
  // Configure in wrangler.toml: [triggers] crons = ["0 16 * * *"]  → 23:00 WIB
  // This is a backup for .github/workflows/incremental.yml. If GH Actions
  // fails, the Worker will still trigger a hard refresh.
  async scheduled(event, env, ctx) {
    console.log(`[scheduled] cron fired at ${new Date().toISOString()}`);
    if (!env.GH_PAT || !env.GH_OWNER || !env.GH_REPO || !env.GH_WORKFLOW) {
      console.log('[scheduled] GH workflow not configured, skipping');
      return;
    }
    const jobId = `cron-${event.scheduledTime}-${crypto.randomUUID().slice(0, 8)}`;
    const now = Date.now();
    refreshJobs.set(jobId, {
      status: 'queued',
      startedAt: now,
      lastChecked: now,
      conclusion: null,
      logsUrl: null,
      trigger: 'scheduled'
    });
    ctx.waitUntil(dispatchWorkflow(env, jobId, ['instagram', 'tiktok']));
  }
};
