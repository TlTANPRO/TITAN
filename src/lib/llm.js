// LLM client — routes through Cloudflare Worker (recommended) or direct call
// Zero template: caller provides full messages array (system + history + user)
//
// Mode auto-detection:
//   If VITE_LLM_PROXY_URL is set, all calls route through a Cloudflare Worker
//   that holds the API keys server-side, does multi-key rotation per provider,
//   and falls back across providers (OpenRouter → Google → Groq → Cohere).
//   Otherwise, the user must set keys via localStorage (not recommended).
//
// Worker contract:
//   POST {VITE_LLM_PROXY_URL}
//   Headers: X-Titan-Provider: auto  (Worker picks best available)
//   Body: OpenAI-style { model, messages, temperature, max_tokens, stream: true }
//   Response: SSE stream (OpenAI-compatible data: {...}\n\n) — parsed by existing code
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1/';
const GOOGLE_BASE = 'https://generativelanguage.googleapis.com/v1beta/';

const PROFILES = {
  openrouter: {
    base: OPENROUTER_BASE,
    buildUrl: (model) => `${OPENROUTER_BASE}chat/completions`,
    buildHeaders: (key) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://titan.app',
      'X-Title': 'TITAN'
    }),
    buildBody: (model, messages, opts) => ({
      model,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 1024,
      stream: !!opts.stream
    }),
    extractStreamDelta: (chunk) => {
      try {
        const lines = chunk.split('\n').filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]');
        let out = '';
        for (const line of lines) {
          const json = JSON.parse(line.slice(6));
          out += json.choices?.[0]?.delta?.content ?? '';
        }
        return out;
      } catch {
        return '';
      }
    }
  },
  google: {
    base: GOOGLE_BASE,
    buildUrl: (model, key) => `${GOOGLE_BASE}models/${model}:streamGenerateContent?alt=sse&key=${key}`,
    buildHeaders: () => ({ 'Content-Type': 'application/json' }),
    buildBody: (model, messages, opts) => ({
      contents: messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      systemInstruction: messages.find((m) => m.role === 'system')?.content
        ? { parts: [{ text: messages.find((m) => m.role === 'system').content }] }
        : undefined,
      generationConfig: {
        temperature: opts.temperature ?? 0.7,
        maxOutputTokens: opts.maxTokens ?? 1024
      }
    }),
    extractStreamDelta: (chunk) => {
      try {
        const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));
        let out = '';
        for (const line of lines) {
          const json = JSON.parse(line.slice(6));
          out += json.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
        }
        return out;
      } catch {
        return '';
      }
    }
  }
};

function getProviderConfig() {
  const provider = import.meta.env.VITE_LLM_PROVIDER || 'openrouter';
  return PROFILES[provider] ?? PROFILES.openrouter;
}

// API keys (for direct mode — only when no proxy is configured)
const KEYS_STORAGE = 'titan.llmKeys.v1';

function getStoredKey(provider) {
  if (typeof localStorage === 'undefined') return null;
  try {
    const stored = JSON.parse(localStorage.getItem(KEYS_STORAGE) || '{}');
    if (provider === 'google' && stored.googleKey) return stored.googleKey;
    if (provider === 'openrouter' && stored.openrouterKey) return stored.openrouterKey;
  } catch {}
  return null;
}

function getModel(provider) {
  if (provider === 'google') {
    return import.meta.env.VITE_GOOGLE_MODEL || 'gemini-flash-lite-latest';
  }
  // 'auto' provider hits Worker which rotates OpenRouter → Google → Groq → Cohere.
  // 'anthropic/claude-3-haiku' would 404 on Google (not an OpenRouter alias),
  // killing the whole chain. 'gemini-flash-lite-latest' is the only model
  // that works across the actual configured providers (OpenRouter + Google).
  return import.meta.env.VITE_LLM_MODEL || 'gemini-flash-lite-latest';
}

/**
 * Check whether the app is configured to use a Cloudflare Worker proxy.
 * When true, no API keys are needed in the client — the Worker handles:
 *   - multi-key rotation per provider (comma-separated in env)
 *   - cross-provider fallback chain (OpenRouter → Google → Groq → Cohere)
 *   - Jina web search/reader integration
 */
export function isProxyMode() {
  return Boolean(import.meta.env.VITE_LLM_PROXY_URL);
}

export function getLlmMode() {
  if (isProxyMode()) return 'proxy (multi-key auto-rotation)';
  return 'direct (set API keys in Settings)';
}

async function callDirect(provider, messages, opts) {
  const profile = PROFILES[provider];
  if (!profile) throw new Error(`Unknown provider: ${provider}`);

  const key = getStoredKey(provider);
  if (!key) {
    throw new Error(
      `No API key for ${provider}. Buka Settings (⚙) di chat panel dan masukkan API key, atau deploy Cloudflare Worker untuk mode otomatis.`
    );
  }
  const model = getModel(provider);
  const url = profile.buildUrl(model, key);
  const body = profile.buildBody(model, messages, { ...opts, stream: true });
  const res = await fetch(url, {
    method: 'POST',
    headers: profile.buildHeaders(key),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${provider} ${res.status}: ${text.slice(0, 200)}`);
  }
  return res;
}

async function callProxy(_provider, messages, opts) {
  const proxyUrl = import.meta.env.VITE_LLM_PROXY_URL;
  if (!proxyUrl) throw new Error('VITE_LLM_PROXY_URL not set');

  // Send 'auto' to Worker so it does multi-provider fallback on its side.
  // Worker re-emits OpenAI-compatible SSE regardless of which provider answered.
  const model = getModel(_provider);
  const body = {
    model,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 1024,
    stream: true
  };
  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Titan-Provider': 'auto' // Worker picks best available across all configured providers
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let detail = text.slice(0, 300);
    try {
      const j = JSON.parse(text);
      if (j.details) detail = j.details.join(' | ');
      else if (j.hint) detail = `${detail} — ${j.hint}`;
    } catch {}
    throw new Error(`proxy: ${detail}`);
  }
  return res;
}

async function* streamFromResponse(res, provider) {
  // Worker re-emits OpenAI-compatible SSE; profile 'openrouter' parses it correctly.
  // For direct calls, parse by actual provider format.
  const profile = provider === 'proxy' ? PROFILES.openrouter : PROFILES[provider];
  const reader = res.body?.getReader();
  if (!reader) throw new Error(`${provider}: no response body`);
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    if (chunks.length > 0) {
      const delta = profile.extractStreamDelta(chunks.join('\n\n'));
      if (delta) yield delta;
    }
  }
  if (buffer) {
    const delta = profile.extractStreamDelta(buffer);
    if (delta) yield delta;
  }
}

/**
 * Stream chat completions. In proxy mode, Worker handles all provider
 * fallback and key rotation transparently.
 */
export async function* streamChat(messages, opts = {}) {
  const requestedProvider = opts.provider || import.meta.env.VITE_LLM_PROVIDER || 'openrouter';
  const proxy = isProxyMode();

  if (proxy) {
    // Single call: Worker handles all fallback
    const res = await callProxy(requestedProvider, messages, opts);
    yield* streamFromResponse(res, 'proxy');
    return;
  }

  // Direct mode: client-side fallback across configured providers
  const providers = requestedProvider === 'google' ? ['google', 'openrouter'] : ['openrouter', 'google'];
  let lastError = null;
  for (const p of providers) {
    try {
      const res = await callDirect(p, messages, opts);
      yield* streamFromResponse(res, p);
      return;
    } catch (err) {
      lastError = err;
      continue;
    }
  }
  throw lastError ?? new Error('All LLM providers failed');
}

export async function chat(messages, opts = {}) {
  let out = '';
  for await (const delta of streamChat(messages, { ...opts, stream: false })) {
    out += delta;
  }
  return out;
}

