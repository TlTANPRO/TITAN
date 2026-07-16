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

// OpenRouter free-model allowlist — only models with `:free` suffix
// are routed. Everything else (paid models) is filtered out.
const OPENROUTER_FREE_MODELS = new Set([
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'meta-llama/llama-3.1-8b-instruct:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'qwen/qwq-32b-preview:free',
  'mistralai/mistral-7b-instruct:free',
  'google/gemma-2-9b-it:free',
  'google/gemma-2-27b-it:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
  'microsoft/phi-3-mini-128k-instruct:free',
  'openchat/openchat-7b:free',
  'undi95/toppy-m-7b:free',
  'huggingfaceh4/zephyr-7b-beta:free',
  'gryphe/mythomist-7b:free',
  'kwaipilot/kat-coder-pro:free'
]);

function pickOpenRouterModel(requested) {
  if (requested && OPENROUTER_FREE_MODELS.has(requested)) return requested;
  // Default to a reliable free model
  return 'meta-llama/llama-3.1-8b-instruct:free';
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
    if (request.method === 'GET' && (path.startsWith('/avatar') || path === '/avatar')) {
      return handleAvatarProxy(request, env);
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
  }
};
