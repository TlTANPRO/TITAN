# Cloudflare Worker — TITAN LLM Proxy (v2)

Holds all LLM API keys server-side. The browser only ever talks to this Worker, never directly to upstream providers. Setting `VITE_LLM_PROXY_URL` to this Worker's URL puts the app in **fully automatic** mode — users do not enter any API keys.

## What's new in v2

- **Multi-key rotation per provider** — store multiple keys per provider (comma-separated). When one key hits 429/rate-limit/auth-error, Worker transparently tries the next.
- **Multi-provider fallback chain** — `openrouter → google → groq → cohere`. If all keys of one provider fail, Worker moves to the next provider.
- **Jina AI integration** — `s.jina.ai` (web search) and `r.jina.ai` (URL reader) available as fallback or supplementary tools, with key rotation.
- **Single endpoint** — Worker re-emits OpenAI-compatible SSE so the existing TITAN client code works unchanged.

## Deploy (5 minutes, no CLI)

### 1. Create Worker
1. Open https://dash.cloudflare.com → sign in (free tier is enough: **100k requests/day**).
2. **Workers & Pages** → **Create application** → **Create Worker**.
3. Choose **Start with Hello World**, name it `titan-llm-proxy`.
4. Click **Deploy**, then **Edit Code**.

### 2. Paste Worker code
1. **Delete all default code** in the editor.
2. Copy the entire contents of `src/index.js` (in this folder) into the editor.
3. Click **Save and Deploy**.

### 3. Set secrets
**Settings → Variables and Secrets → Add Variable** for each key below (Type: **Secret/encrypted**, NOT Plaintext):

| Variable | Required? | Value | Free tier |
|----------|-----------|-------|-----------|
| `OPENROUTER_API_KEYS` | recommended | `sk-or-v1-A,sk-or-v1-B,sk-or-v1-C` (comma-separated, multiple keys = rotation) | pay-as-you-go (~$0.0002/1K tokens Claude Haiku) |
| `GOOGLE_KEYS` | recommended | `AQ.Ab8-1,AQ.Ab8-2` (multiple keys = rotation) | **FREE** — 15 req/min, 1M tokens/day |
| `GROQ_KEYS` | optional | `gsk_...` (rotation supported) | **FREE** — 30 req/min, 14.4K tokens/day |
| `COHERE_KEYS` | optional | (rotation supported) | **FREE** trial — 1K req/month |
| `JINA_KEYS` | optional | `jina_...` (rotation supported) | **FREE** — 1M tokens/month |
| `ALLOWED_ORIGIN` | optional | `https://tltanpro.github.io` (CORS lock-down) | — |

> **At least one of OPENROUTER/GOOGLE/GROQ/COHERE must be set** for chat to work. JINA is for web tools only.

Click **Deploy** after each save.

### 4. Get the Worker URL
**Settings → Triggers** → copy the URL, e.g.
```
https://titan-llm-proxy.YOUR-SUBDOMAIN.workers.dev
```

### 5. Wire into TITAN
In `titan-app/.env`, set:
```
VITE_LLM_PROXY_URL=https://titan-llm-proxy.YOUR-SUBDOMAIN.workers.dev
```
Then rebuild and push:
```bash
cd titan-app
pnpm build
cd dist
git add -A && git commit -m "deploy: enable LLM proxy v2 (multi-key rotation)"
git push -u origin main --force
```

## Test the Worker manually

### Chat (uses Worker fallback chain)
```bash
curl -X POST https://titan-llm-proxy.YOUR-SUBDOMAIN.workers.dev \
  -H "Content-Type: application/json" \
  -H "X-Titan-Provider: auto" \
  -d '{"model":"anthropic/claude-3-haiku","messages":[{"role":"user","content":"halo"}],"max_tokens":30}'
```
A streaming `data: {...}` response = ✅ working. A 502 with `details: [...]` = all providers failed (check env vars).

### Jina web search
```bash
curl -X POST https://titan-llm-proxy.YOUR-SUBDOMAIN.workers.dev \
  -H "Content-Type: application/json" \
  -H "X-Titan-Provider: jina" \
  -H "X-Titan-Action: search" \
  -d '{"query":"tren properti 2026","maxResults":5}'
```

### Jina URL reader
```bash
curl -X POST https://titan-llm-proxy.YOUR-SUBDOMAIN.workers.dev \
  -H "Content-Type: application/json" \
  -H "X-Titan-Provider: jina" \
  -H "X-Titan-Action: read" \
  -d '{"url":"https://example.com/article"}'
```

## Request shape

**Chat (LLM):**
```http
POST /
Content-Type: application/json
X-Titan-Provider: auto | openrouter | google | groq | cohere

{
  "model": "anthropic/claude-3-haiku",  // optional, default per provider
  "messages": [{ "role": "user", "content": "..." }],
  "temperature": 0.7,
  "max_tokens": 1024,
  "stream": true
}
```

**Jina tools:**
```http
POST /
X-Titan-Provider: jina
X-Titan-Action: search | read

// search:
{ "query": "...", "maxResults": 5 }
// read:
{ "url": "https://..." }
```

Response: SSE stream (OpenAI-compatible for chat) or JSON (for Jina).

## Fallback chain (when X-Titan-Provider: auto)

```
1. OpenRouter (key1 → key2 → key3)
   ↓ if all keys fail
2. Google AI Studio (key1 → key2 → ...)
   ↓ if all keys fail
3. Groq (key1 → key2 → ...)
   ↓ if all keys fail
4. Cohere (key1 → key2 → ...)
   ↓ if all fail
   → HTTP 502 with details: [...errors]
```

Each step only fires if the **previous provider returned no successful stream**. If OpenRouter key#1 returns 429, Worker tries OpenRouter key#2 BEFORE moving to Google. This is the **most resilient** setup — even if one entire provider is down, the next picks up.

## Cost & limits

### Cloudflare Workers free tier
- **100,000 requests/day** (~3M/month)
- 10 ms CPU time per request
- Sufficient for production TITAN usage. Upgrade to **Workers Paid** ($5/month, 10M requests) if you exceed 100k/day.

### Upstream provider free tiers (rotation recommended because each key is limited)

| Provider | Free limit | Best for |
|----------|-----------|----------|
| **Google AI Studio** | 15 req/min, 1M tokens/day | Primary backup — generous free tier, fast |
| **Groq** | 30 req/min, 14.4K tokens/day | Fast inference (Llama 3.1) |
| **Cohere** | 1K req/month trial | Low-priority fallback |
| **Jina Reader** | 1M tokens/month | Web reading & search |
| OpenRouter | pay-as-you-go (no free tier) | High-quality, low cost Claude Haiku |

### Per-key rotation math
If you set 3 OpenRouter keys + 3 Google keys, you get 3× the per-key quota **on each provider** before falling back. With 4 providers, the theoretical max is 12× a single key's quota.

## Architecture

```
Browser (TITAN PWA)
       │
       │ POST / { messages, model, ... }
       │ Header: X-Titan-Provider: auto
       ▼
Cloudflare Worker (this code)
       │
       │ Try key1 → key2 → key3 of openrouter
       │   ↓ all failed?
       │ Try key1 → key2 → key3 of google
       │   ↓ all failed?
       │ Try key1 → key2 → key3 of groq
       │   ↓ all failed?
       │ Try key1 → key2 → key3 of cohere
       │
       │ Re-emits OpenAI-compatible SSE back to browser
       ▼
OpenRouter / Google / Groq / Cohere
       │
       │ Streams response
       ▼
Browser (TITAN PWA displays streaming text)
```

API keys never leave the Worker. The frontend code in TITAN cannot read any key directly — the Worker is the only place that holds them.

## Migrating from v1 (single-key)

Old v1 env vars (`OPENROUTER_API_KEY`, `GOOGLE_STUDIO_API_KEY`) are **no longer read**. Rename them to `OPENROUTER_API_KEYS` / `GOOGLE_KEYS` and add the comma-separated multi-key value.

| v1 | v2 |
|----|----|
| `OPENROUTER_API_KEY=sk-or-v1-A` | `OPENROUTER_API_KEYS=sk-or-v1-A,sk-or-v1-B` |
| `GOOGLE_STUDIO_API_KEY=AQ.Ab8` | `GOOGLE_KEYS=AQ.Ab8-1,AQ.Ab8-2` |
