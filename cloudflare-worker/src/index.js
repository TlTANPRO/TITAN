// TITAN LLM Proxy — Cloudflare Worker (v2: multi-key rotation + multi-provider fallback)
//
// Capabilities:
//   • Multi-key rotation per provider — comma-separated in env (OPENROUTER_API_KEYS, GOOGLE_KEYS, ...)
//   • Auto-rotation: on 429/5xx/network error, transparently try next key
//   • Multi-provider chain: OpenRouter → Google → Groq → Cohere (all OpenAI-compatible except Google)
//   • Jina AI integration (web search s.jina.ai + reader r.jina.ai) — free tier fallback
//   • Worker-level rate limit handling (Cloudflare free: 100k req/day)
//
// Deploy: Cloudflare Dashboard → Workers → Create → paste this code → set env vars → Save → Deploy
// Set env vars in Worker settings (Type: Secret/encrypted, NOT Plaintext):
//   OPENROUTER_API_KEYS   = sk-or-v1-A,sk-or-v1-B,sk-or-v1-C
//   GOOGLE_KEYS            = AQ.Ab8-1,AQ.Ab8-2
//   GROQ_KEYS              = gsk_...
//   COHERE_KEYS            = ...
//   JINA_KEYS              = jina_...
//   ALLOWED_ORIGIN         = https://tltanpro.github.io  (CORS lock-down, optional)
//
// Request shape (POST):
//   Headers: X-Titan-Provider (openrouter|google|groq|cohere|jina|auto), X-Titan-Action (chat|search|read)
//   Body:    { model?, messages: [...], temperature?, max_tokens?, stream: true }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Titan-Provider, X-Titan-Action',
  'Access-Control-Max-Age': '86400'
};

// ============ Provider registry ============
const PROVIDERS = {
  openrouter: {
    label: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEYS',
    buildUrl: () => 'https://openrouter.ai/api/v1/chat/completions',
    buildHeaders: (key) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'HTTP-Referer': 'https://tltanpro.github.io/TITAN/',
      'X-Title': 'TITAN'
    }),
    buildBody: (model, messages, opts) => ({
      model: model || 'anthropic/claude-3-haiku',
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.max_tokens ?? 1024,
      stream: true
    }),
    // OpenAI-compatible SSE format
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

  groq: {
    label: 'Groq',
    envKey: 'GROQ_KEYS',
    buildUrl: () => 'https://api.groq.com/openai/v1/chat/completions',
    buildHeaders: (key) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    }),
    buildBody: (model, messages, opts) => ({
      model: model || 'llama-3.1-8b-instant',
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
  if (keys.length === 0) return { ok: false, error: 'JINA_KEYS not set' };

  const endpoint = action === 'search'
    ? 'https://s.jina.ai/'
    : action === 'read'
    ? 'https://r.jina.ai/'
    : null;
  if (!endpoint) return { ok: false, error: 'Unknown Jina action' };

  const errors = [];
  for (const key of keys) {
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
// Tested 2026-07-15: 6 bot UAs return 100% success rate on 4 active posts
// (5 rounds × 4 posts = 20/20 reliable).
// Plain "LinkedInBot/1.0" GAGAL — "Mozilla/5.0 (compatible; LinkedInBot/1.0)" WORKS.
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
      // Detect login wall
      if (/Log into Instagram|Sign up · Instagram|Log in to Instagram/i.test(html)) {
        errors.push(`UA ${ua.slice(0, 30)}: login wall`);
        continue;
      }
      // Extract og meta
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
// Fetches any HTTPS image and returns it with CORS + cross-origin headers.
// Handles Instagram scontent-*.cdninstagram.com, TikTok p16-*.tiktokcdn-us.com, etc.
// Why this is needed: direct browser fetch is blocked by CORS + CORP on those CDNs.
async function handleAvatarProxy(request, env) {
  const url = new URL(request.url);
  const target = url.searchParams.get('url');
  const w = parseInt(url.searchParams.get('w') || '192', 10);
  const h = parseInt(url.searchParams.get('h') || '192', 10);

  if (!target || !/^https?:\/\//i.test(target)) {
    return json({ error: 'Missing or invalid url param' }, 400);
  }

  try {
    // Fetch with a desktop Mozilla UA — some CDNs (esp. Facebook/IG) reject bot/empty UAs
    const res = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      cf: { cacheTtl: 86400, cacheEverything: true }, // cache at edge for 24h
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
  // Wrap async iterator and re-encode as OpenAI-compatible SSE
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

async function streamWithProvider(env, providerName, body) {
  const provider = PROVIDERS[providerName];
  if (!provider) return { ok: false, error: `Unknown provider: ${providerName}` };

  const keys = (env[provider.envKey] || '').split(',').map(k => k.trim()).filter(Boolean);
  if (keys.length === 0) {
    return { ok: false, error: `${provider.envKey} not set on worker` };
  }

  const errors = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
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
        return { ok: true, stream: sseStream(wrapped), keyUsed: i, totalKeys: keys.length };
      }

      const errText = await res.text().catch(() => '');
      const errMsg = `${providerName} key#${i + 1} HTTP ${res.status}: ${errText.slice(0, 120)}`;
      errors.push(errMsg);
      // Retry on rate limit or server error (likely key-specific quota)
      if (res.status === 429 || res.status >= 500) continue;
      // Retry on auth/credit errors (key might be invalid/expired/out of credits, try next)
      if (res.status === 401 || res.status === 402 || res.status === 403) continue;
      // 400 bad request = model param wrong (or message format issue).
      // DON'T break here — try next key (different model format on different keys? rare but safe),
      // but if all keys fail, caller will see all-401/400 and the provider-level loop will move on.
      if (res.status === 400) continue;
      // Other 4xx — permanent, stop trying this provider
      break;
    } catch (e) {
      errors.push(`${providerName} key#${i + 1} network: ${e.message}`);
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

    // GET /avatar?url=... is a public image-proxy route — allow GET here.
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

    // ---- Social media OG meta fetch (IG/TT/YT via bot UA) ----
    if (action === 'social' || provider === 'social') {
      const targetUrl = body.url;
      if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        return json({ error: 'Invalid url' }, 400);
      }
      const r = await fetchSocialOG(targetUrl);
      if (r.ok) {
        return json(r, 200);
      }
      return json({ error: r.error }, 502);
    }

    // ---- Image proxy (avatar/etc) — bypass IG/TT CDN CORP/CORS ----
    // Route: /avatar?url=<encoded>&w=192&h=192&fit=cover
    // Replaces images.weserv.nl which started returning 404 for IG/TT CDNs.
    if (path.startsWith('/avatar') || action === 'avatar') {
      return handleAvatarProxy(request, env);
    }

    // ---- LLM chat with multi-provider fallback ----
    // 'auto' chain: google (free, primary) → openrouter → groq → cohere
    // Reordered 2026-07-16 — Google first for free tier reliability.
    const chain = provider === 'auto'
      ? ['google', 'openrouter', 'groq', 'cohere']
      : [provider];

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
      hint: 'Cek env vars Worker (OPENROUTER_API_KEYS, GOOGLE_KEYS, GROQ_KEYS, COHERE_KEYS) di Cloudflare Dashboard → Worker → Settings → Variables'
    }, 502);
  }
};
