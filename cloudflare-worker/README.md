# Cloudflare Worker — TITAN LLM Proxy (v3)

Holds all LLM API keys server-side. The browser only ever talks to this Worker, never directly to upstream providers.

## What's new in v3

- **Round-robin key rotation within provider** — Google rotates across all 16 keys evenly (was: always key#1).
- **OpenRouter pinned to free models only** — `OPENROUTER_FREE_MODELS` allowlist (16 models with `:free` suffix). Paid models are filtered out. If you ask for a non-free model, the Worker auto-substitutes with `meta-llama/llama-3.1-8b-instruct:free`.
- **Groq removed** — per user request, simpler chain.
- **Cohere kept as last resort** — set `COHERE_KEYS` to enable. Skip silently if not set.
- **Jina unchanged** — `s.jina.ai` (search) + `r.jina.ai` (read) with round-robin keys.
- **Provider chain: `google → openrouter(free) → cohere`**

## v2 → v3 migration

| v2 | v3 |
|----|----|
| Chain: `google → openrouter → groq → cohere` | Chain: `google → openrouter(free) → cohere` |
| Always starts at key#0 | Round-robin across keys (per-isolate state) |
| OpenRouter accepts any model | OpenRouter: only `*:free` allowlist |
| `GROQ_KEYS` recommended | `GROQ_KEYS` ignored (no longer in chain) |

## Deploy (5 minutes, no CLI)

### 1. Create Worker
1. Open https://dash.cloudflare.com → sign in.
2. **Workers & Pages** → **Create application** → **Create Worker**.
3. Name it `titan-llm-proxy`. Click **Deploy**, then **Edit Code**.

### 2. Paste Worker code
1. **Delete all default code** in the editor.
2. Copy the entire contents of `src/index.js` (in this folder) into the editor.
3. Click **Save and Deploy**.

### 3. Set secrets
**Settings → Variables and Secrets → Add Variable** for each key (Type: **Secret/encrypted**):

| Variable | Required? | Value | Free tier |
|----------|-----------|-------|-----------|
| `GOOGLE_KEYS` | **required** (chain breaks otherwise) | `AIzaSy...-1,AIzaSy...-2,...` (16 keys = 16× quota) | **FREE** — 15 req/min, 1M tokens/day per key |
| `OPENROUTER_API_KEYS` | optional (fallback) | `sk-or-v1-A,sk-or-v1-B` (multi-key rotation) | Free models only via this Worker |
| `COHERE_KEYS` | optional (last resort) | `...` (rotation supported) | **FREE** trial — 1K req/month |
| `JINA_KEYS` | optional (web tools) | `jina_...` (rotation supported) | **FREE** — 1M tokens/month |
| `ALLOWED_ORIGIN` | optional | `https://tltanpro.github.io` (CORS lock-down) | — |

> **At least `GOOGLE_KEYS` is required** for chat. The chain breaks if Google is empty (no other LLM provider runs by default in v3).

### 4. Get the Worker URL
**Settings → Triggers** → copy the URL, e.g. `https://titan-llm-proxy.YOUR-SUBDOMAIN.workers.dev`

### 5. Wire into TITAN
In `titan-app/.env`:
```
VITE_LLM_PROXY_URL=https://titan-llm-proxy.YOUR-SUBDOMAIN.workers.dev
VITE_LLM_PROVIDER=google
VITE_LLM_MODEL=gemini-flash-lite-latest
```

## Test the Worker manually

### Chat (auto chain: google → openrouter(free) → cohere)
```bash
curl -X POST https://titan-llm-proxy.YOUR-SUBDOMAIN.workers.dev \
  -H "Content-Type: application/json" \
  -H "X-Titan-Provider: auto" \
  -d '{"model":"gemini-flash-lite-latest","messages":[{"role":"user","content":"halo"}],"max_tokens":30}'
```

### Test specific provider
```bash
# Google only
curl -X POST .../ -H "X-Titan-Provider: google" -d '{"messages":[...]}'

# OpenRouter free (auto-substitutes non-free models)
curl -X POST .../ -H "X-Titan-Provider: openrouter" -d '{"model":"meta-llama/llama-3.3-70b-instruct:free","messages":[...]}'
```

### Jina web search
```bash
curl -X POST .../ \
  -H "X-Titan-Provider: jina" \
  -H "X-Titan-Action: search" \
  -d '{"query":"tren properti 2026","maxResults":5}'
```

### Jina URL reader
```bash
curl -X POST .../ \
  -H "X-Titan-Provider: jina" \
  -H "X-Titan-Action: read" \
  -d '{"url":"https://example.com/article"}'
```

## Round-robin rotation math

Per-isolate `Map<providerName, lastUsedIndex>`. Each call increments the index, so 16 Google keys fire in order 1→2→3→...→16→1→2→... instead of always key#1.

Worker is single-threaded per isolate, so this is thread-safe. Resets on Worker restart (which is rare — Cloudflare keeps isolates warm).

Per-isolate means: each new isolate (new region, scale event) starts at key#0 independently. With Cloudflare's free tier, you typically run 1-2 isolates, so 16 keys still distribute evenly across requests.

## Architecture

```
Browser (TITAN PWA)
       │
       │ POST / { messages, model, ... }
       │ Header: X-Titan-Provider: auto
       ▼
Cloudflare Worker (this code)
       │
       │ Round-robin start key per provider, then iterate
       │ Try google (1/16 → 2/16 → ... → 16/16 → back to 1/16)
       │   ↓ all keys fail?
       │ Try openrouter (free models only, multi-key rotation)
       │   ↓ all keys fail?
       │ Try cohere (if COHERE_KEYS set, otherwise skip)
       │
       │ Re-emits OpenAI-compatible SSE back to browser
       ▼
Google AI Studio / OpenRouter / Cohere
       │
       │ Streams response
       ▼
Browser (TITAN PWA displays streaming text)
```

API keys never leave the Worker. The frontend code in TITAN cannot read any key directly.

## Cost & limits

### Cloudflare Workers free tier
- 100,000 requests/day (~3M/month)
- 10 ms CPU time per request
- Sufficient for production TITAN usage. Upgrade to **Workers Paid** ($5/month, 10M requests) if you exceed 100k/day.

### Upstream provider free tiers (with rotation)

| Provider | Free limit (per key) | With 16 keys rotation |
|----------|----------------------|------------------------|
| **Google AI Studio** | 15 req/min, 1M tokens/day | ~240 req/min, 16M tokens/day effective |
| OpenRouter (free) | varies per free model | depends on upstream quota |
| Cohere (trial) | 1K req/month | multiplied by key count |
| **Jina Reader** | 1M tokens/month | per-key |

## v1 → v3 migration

| v1 | v3 |
|----|----|
| `OPENROUTER_API_KEY=sk-or-v1-A` | `OPENROUTER_API_KEYS=sk-or-v1-A,sk-or-v1-B` |
| `GOOGLE_STUDIO_API_KEY=AQ.Ab8` | `GOOGLE_KEYS=AQ.Ab8-1,AQ.Ab8-2,...` (16 keys recommended) |
| `GROQ_KEYS=gsk_...` | _Remove_ (no longer used) |
| (no Cohere) | Optional: `COHERE_KEYS=...` |
| (no Jina) | Optional: `JINA_KEYS=jina_...` (web tools) |
