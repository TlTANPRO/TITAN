// Web access via free public CORS proxy (allorigins.win)
const PROXY = import.meta.env.VITE_WEB_ACCESS_PROXY || 'https://api.allorigins.win/raw?url=';

// ===== Social media post detection & 3-layer fetch pipeline =====
// Instagram/TikTok/YouTube sangat agresif block scraper tanpa auth.
// Strategy: Layer 1 local lookup → Layer 2 bot UA fallback → Layer 3 Jina browser engine.
// Tested 2026-07-15: 6 bot UA dapat 100% success rate (5 rounds × 4 active posts).

const IG_RE = /instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]{6,15})/i;
const TT_RE = /tiktok\.com\/(?:@[\w.]+\/video\/(\d+)|v\/(\d+)|t\/(\w+))|vm\.tiktok\.com\/(\w+)/i;
const YT_RE = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/i;

// 6 bot UAs yang reliably kasih og:description untuk post IG aktif/publik.
// PENTING: Mozilla/5.0 (compatible; ...) prefix untuk semua.
// Plain "LinkedInBot/1.0" GAGAL, "Pinterestbot/1.0" WORKS tanpa Mozilla prefix.
const BOT_UAS = [
  'Mozilla/5.0 (compatible; LinkedInBot/1.0)',
  'Pinterestbot/1.0 (+http://www.pinterest.com/bot.html)',
  'Mozilla/5.0 (compatible; Discordbot/2.0)',
  'Mozilla/5.0 (compatible; Slackbot-LinkExpanding/1.0)',
  'Mozilla/5.0 (compatible; TelegramBot/1.0)',
  'Mozilla/5.0 (compatible; SkypeUriPreview/1.0)',
];

/**
 * Detect apakah URL adalah social media post (IG/TT/YT) dan extract id.
 * Returns { platform, type, id } atau null.
 */
export function parseSocialUrl(url) {
  if (!url) return null;
  let m = url.match(IG_RE);
  if (m) return { platform: 'instagram', type: 'post', id: m[1] };
  m = url.match(TT_RE);
  if (m) return { platform: 'tiktok', type: 'video', id: m[1] || m[2] || m[3] || m[4] };
  m = url.match(YT_RE);
  if (m) return { platform: 'youtube', type: 'video', id: m[1] };
  return null;
}

// Lazy import untuk avoid 4.8MB accounts-full.json di initial bundle.
// Pakai dataStore unified (sama dengan React hooks) — single source of truth.
import { loadAccounts, getAllAccounts } from './dataStore.js';

async function getAccountsData() {
  // Pastikan sudah loaded, kalau sudah pakai cache
  await loadAccounts();
  return getAllAccounts();
}

/**
 * LAYER 1: Local lookup di accounts-full.json (via dataStore unified).
 * Data sudah normalized — shortcode (IG) = p.shortcode, TT = p.id (numeric).
 * Untuk post yang shortcode/id match dengan data internal (9 akun, 3300+ posts).
 */
async function lookupLocalPost(parsed) {
  const accounts = getAllAccounts();
  if (!accounts || accounts.length === 0) return null;

  const { platform, id } = parsed;
  for (const acc of accounts) {
    const posts = acc?.posts ?? [];
    for (const p of posts) {
      if (platform === 'instagram') {
        // IG: cek shortcode atau postUrl
        if (p.shortcode === id) return { account: acc, post: p };
        if (p.postUrl && p.postUrl.includes(`/${id}`)) return { account: acc, post: p };
      } else if (platform === 'tiktok') {
        // TT: cek id (numeric, normalize() preserves), atau postUrl
        if (String(p.id) === String(id)) return { account: acc, post: p };
        if (p.postUrl && p.postUrl.includes(id)) return { account: acc, post: p };
      } else if (platform === 'youtube') {
        // YT: cek videoId
        if (p.videoId === id || String(p.id) === String(id)) return { account: acc, post: p };
      }
    }
  }
  return null;
}

function formatLocalContext(local, parsed) {
  const { account, post } = local;
  const metrics = [];
  if (post.viewCount != null) metrics.push(`${post.viewCount.toLocaleString('id-ID')} views`);
  if (post.likeCount != null) metrics.push(`${post.likeCount.toLocaleString('id-ID')} likes`);
  if (post.commentCount != null) metrics.push(`${post.commentCount.toLocaleString('id-ID')} comments`);
  const meta = metrics.length ? ` (${metrics.join(', ')})` : '';
  const caption = post.caption || post.text || post.title || '';
  const username = account.username || account.handle || '';
  return {
    ok: true,
    source: 'local',
    platform: parsed.platform,
    url: parsed.originalUrl,
    content: `[Local data — ${parsed.platform} @${username}]\nPost${meta}\nCaption: ${caption.slice(0, 1500)}${post.hashtags?.length ? `\nHashtags: ${post.hashtags.join(' ')}` : ''}`,
    account,
    post,
  };
}

/**
 * LAYER 2: Direct fetch dengan 6 bot UA fallback.
 * Sequential: coba UA pertama, kalau gagal coba berikutnya.
 * Returns og:description + title + image + url.
 *
 * Route via Cloudflare Worker kalau VITE_LLM_PROXY_URL set, supaya:
 * - CORS tidak masalah (Worker forward request)
 * - Tidak kena browser CORS
 * - 6 UA fallback handled di server side (lebih reliable)
 */
async function fetchWithBotUA(url) {
  const proxyUrl = import.meta.env.VITE_LLM_PROXY_URL;
  if (proxyUrl) {
    // Server-side route via Worker (no CORS issue)
    try {
      const res = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Titan-Action': 'social',
        },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && (data.description || data.title)) {
          return { ok: true, description: data.description, title: data.title, image: data.image, html: '', userAgent: data.userAgent || 'worker' };
        }
        return { ok: false, error: data?.error || 'Worker returned no og meta' };
      }
      return { ok: false, error: `Worker HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // Fallback: client-side fetch dengan bot UA (kalau CORS allow)
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
      if (!res.ok) continue;
      const html = await res.text();
      // Detect login wall — IG return "Log into Instagram" atau "Sign up"
      if (/Log into Instagram|Sign up · Instagram|Log in to Instagram/i.test(html)) continue;
      // Extract og meta
      const desc = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)/i)?.[1]
                || html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)/i)?.[1];
      const title = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)/i)?.[1];
      const image = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i)?.[1];
      if (desc || title) {
        return { ok: true, description: desc, title, image, html, userAgent: ua };
      }
    } catch {
      // try next UA
    }
  }
  return { ok: false, error: 'All bot UAs failed' };
}

function formatOgContext(og, parsed) {
  const desc = og.description || og.title || '';
  return {
    ok: true,
    source: 'botua',
    platform: parsed.platform,
    url: parsed.originalUrl,
    content: `[Fetched via bot UA from ${parsed.platform}]\nTitle: ${og.title || ''}\nDescription: ${desc.slice(0, 2000)}${og.image ? `\nImage: ${og.image}` : ''}`,
    raw: { title: og.title, description: desc, image: og.image },
  };
}

/**
 * LAYER 3: Jina reader dengan X-Engine: browser header.
 * Fallback terakhir kalau bot UA kena rate limit atau post di-private.
 * Route via Cloudflare Worker supaya JINA_KEY aman di server side.
 */
async function fetchJinaBrowser(url) {
  const proxyUrl = import.meta.env.VITE_LLM_PROXY_URL;
  if (!proxyUrl) return { ok: false, error: 'VITE_LLM_PROXY_URL not configured' };
  try {
    const res = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Titan-Action': 'read',
      },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return { ok: false, error: `Jina HTTP ${res.status}` };
    const data = await res.json();
    const inner = data?.data ?? data;
    const content = inner?.data?.content || inner?.content || '';
    const title = inner?.data?.title || inner?.title || '';
    if (!content || /Log into|sign up|Login Required/i.test(content)) {
      return { ok: false, error: 'Jina returned login wall' };
    }
    return { ok: true, content: content.slice(0, 6000), title };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function formatJinaContext(jina, parsed) {
  return {
    ok: true,
    source: 'jina',
    platform: parsed.platform,
    url: parsed.originalUrl,
    content: `[Fetched via Jina browser engine from ${parsed.platform}]\nTitle: ${jina.title || ''}\nContent: ${jina.content}`,
  };
}

/**
 * Main entry point: fetch social media post (IG/TT/YT) dengan 3-layer fallback.
 *
 * @param {string} url - The social media URL
 * @returns {Promise<{ok: boolean, source?: 'local'|'botua'|'jina', content?: string, error?: string, ...}>}
 */
export async function fetchSocialContent(url) {
  const parsed = parseSocialUrl(url);
  if (!parsed) return { ok: false, error: 'Not a recognized social URL' };
  parsed.originalUrl = url;
  if (typeof console !== 'undefined') console.log('[TITAN-SOCIAL] start:', url, parsed);

  // LAYER 1: Local lookup
  try {
    const local = await lookupLocalPost(parsed);
    if (local) {
      if (typeof console !== 'undefined') console.log('[TITAN-SOCIAL] L1 hit (local)');
      return formatLocalContext(local, parsed);
    }
  } catch (e) {
    if (typeof console !== 'undefined') console.log('[TITAN-SOCIAL] L1 err:', e.message);
  }

  // LAYER 2: Bot UA fallback (6 UAs sequential)
  const og = await fetchWithBotUA(url);
  if (og.ok) {
    if (typeof console !== 'undefined') console.log('[TITAN-SOCIAL] L2 hit (bot UA):', og.title);
    return formatOgContext(og, parsed);
  }
  if (typeof console !== 'undefined') console.log('[TITAN-SOCIAL] L2 fail:', og.error);

  // LAYER 3: Jina browser engine
  const jina = await fetchJinaBrowser(url);
  if (jina.ok) {
    if (typeof console !== 'undefined') console.log('[TITAN-SOCIAL] L3 hit (jina)');
    return formatJinaContext(jina, parsed);
  }
  if (typeof console !== 'undefined') console.log('[TITAN-SOCIAL] L3 fail:', jina.error);

  // Semua gagal
  return {
    ok: false,
    error: `Post ${parsed.platform}/${parsed.id} tidak bisa di-fetch. Kemungkinan: post privat/dihapus, akun di-private, atau kena rate limit. Coba link lain atau post yang masih aktif.`,
    platform: parsed.platform,
    id: parsed.id,
    url,
  };
}

export async function fetchUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, error: 'Invalid URL' };
  }
  try {
    const res = await fetch(PROXY + encodeURIComponent(url));
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const text = await res.text();
    return { ok: true, content: text.slice(0, 8000), url };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export function extractLinks(text) {
  if (!text) return [];
  const matches = String(text).match(/https?:\/\/[^\s<>"']+/g) ?? [];
  return [...new Set(matches)].slice(0, 5);
}

/**
 * DuckDuckGo HTML search via allorigins CORS proxy.
 * Gratis, no API key, returns up to 10 results dengan title/URL/snippet.
 * NOTE: tidak seakurat Google/Bing tapi reliable untuk general queries.
 */
async function searchDuckDuckGo(query, maxResults = 5) {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(PROXY + encodeURIComponent(searchUrl));
  if (!res.ok) return { ok: false, error: `DDG HTTP ${res.status}`, results: [] };
  const html = await res.text();

  const results = [];
  const resultBlocks = html.split(/class="result\s+results_links/gi).slice(1);

  for (const block of resultBlocks) {
    const linkMatch = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    let url = linkMatch[1];
    const title = linkMatch[2].replace(/<[^>]+>/g, '').trim();
    try {
      const parsed = new URL(url, 'https://duckduckgo.com');
      const real = parsed.searchParams.get('uddg');
      if (real) url = real;
    } catch { /* keep as-is */ }
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
    const snippet = snippetMatch
      ? snippetMatch[1].replace(/<[^>]+>/g, '').trim()
      : '';
    if (url && title) results.push({ title, url, snippet });
    if (results.length >= maxResults) break;
  }
  return { ok: results.length > 0, results, source: 'duckduckgo' };
}

/**
 * Wikipedia API search — primary fallback, CORS-friendly, no proxy.
 * Returns list of matching articles + dapat fetch summary untuk top result.
 */
async function searchWikipedia(query, maxResults = 4) {
  try {
    // Step 1: search article titles
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=${maxResults}&format=json&origin=*`;
    const res = await fetch(searchUrl);
    if (!res.ok) return { ok: false, error: `Wikipedia HTTP ${res.status}`, results: [] };
    const data = await res.json();
    const [, titles, , urls] = data;
    if (!titles || titles.length === 0) return { ok: false, error: 'No Wikipedia results', results: [] };

    // Step 2: fetch snippet for each title via action=query
    const titlesParam = titles.map(encodeURIComponent).join('|');
    const queryUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&exsentences=2&titles=${titlesParam}&format=json&origin=*`;
    const qr = await fetch(queryUrl);
    const qdata = await qr.json();
    const pages = qdata?.query?.pages ?? {};

    const results = titles.map((title, i) => {
      const page = Object.values(pages).find((p) => p.title === title);
      const snippet = page?.extract ?? '';
      return { title, url: urls[i] ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`, snippet };
    });
    return { ok: true, results, source: 'wikipedia' };
  } catch (err) {
    return { ok: false, error: err.message, results: [] };
  }
}

/**
 * Web search dengan fallback chain:
 *   1. Jina search via Cloudflare Worker (paling reliable, no CORS, current info)
 *   2. Wikipedia API (CORS-friendly, no proxy) — untuk definisi/konsep
 *   3. DuckDuckGo via allorigins (last resort — sering kena CORS 522)
 * Return pertama yang kasih hasil.
 */
export async function searchWeb(query, maxResults = 5) {
  if (!query || !query.trim()) {
    return { ok: false, error: 'Empty query', results: [] };
  }

  // Strategy 1: Jina search via Cloudflare Worker (current info, no CORS)
  const proxyUrl = import.meta.env.VITE_LLM_PROXY_URL;
  if (proxyUrl) {
    try {
      const res = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Titan-Action': 'search' },
        body: JSON.stringify({ query, maxResults }),
      });
      if (res.ok) {
        const wrapper = await res.json();
        // Worker returns: { ok: true, data: { code, status, data: [items] } }
        // Jina items: { title, url, description, content, ... }
        if (wrapper?.ok) {
          const items = wrapper.data?.data ?? wrapper.data?.results ?? wrapper.data ?? [];
          if (Array.isArray(items) && items.length > 0) {
            const results = items.slice(0, maxResults).map((r) => ({
              title: r.title || r.name || '',
              url: r.url || r.link || '',
              snippet: r.description || r.snippet || (typeof r.content === 'string' ? r.content.slice(0, 200) : ''),
            })).filter((r) => r.url);
            if (results.length > 0) {
              return { ok: true, query, results, source: 'jina' };
            }
          }
        }
      }
    } catch (err) {
      if (typeof console !== 'undefined') console.log('[TITAN-SEARCH] Jina err:', err.message);
    }
  }

  // Strategy 2: Wikipedia (always works in browser, no rate limit, definisi/konsep)
  const wiki = await searchWikipedia(query, Math.min(maxResults, 4));
  if (wiki.ok && wiki.results.length > 0) {
    return { ok: true, query, results: wiki.results, source: 'wikipedia' };
  }

  // Strategy 3: DuckDuckGo via allorigins (last resort — sering kena CORS 522)
  try {
    const ddg = await searchDuckDuckGo(query, maxResults);
    if (ddg.ok && ddg.results.length > 0) {
      return { ok: true, query, results: ddg.results, source: 'duckduckgo' };
    }
    return {
      ok: false,
      error: `No results. Jina: unavailable. Wikipedia: ${wiki.error ?? 'none'}. DDG: ${ddg.error ?? 'none'}.`,
      results: []
    };
  } catch (err) {
    return { ok: false, error: err.message, results: [] };
  }
}

/**
 * Detect apakah user pakai search command: /search atau /cari
 * Returns { isCommand, query }.
 */
export function parseSearchCommand(text) {
  if (!text) return { isCommand: false, query: '' };
  const m = text.match(/^\s*\/(?:search|cari|google|find)\s+(.+)$/i);
  if (m) return { isCommand: true, query: m[1].trim() };
  return { isCommand: false, query: '' };
}

/**
 * Format search results sebagai context block untuk LLM.
 */
export function formatSearchContext(searchResult) {
  if (!searchResult?.ok || !searchResult.results?.length) {
    return `[Web search for "${searchResult?.query ?? ''}" returned no results]`;
  }
  const lines = searchResult.results.map(
    (r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`
  );
  return `[Web search results for "${searchResult.query}" (via ${searchResult.source}):\n${lines.join('\n\n')}]`;
}
