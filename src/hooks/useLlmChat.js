// React hook: orchestrate LLM chat with memory layers
import { useState, useCallback, useRef, useEffect } from 'react';
import { streamChat } from '../lib/llm.js';
import { buildSystemPrompt } from '../lib/memory/memoryInjector.js';
import { loadHistory, saveHistory, appendMessage, clearHistory as clearHist } from '../lib/memory/chatHistory.js';
import { loadAccountContext, saveAccountContext, pushRecentTopic } from '../lib/memory/accountContext.js';
import {
  fetchUrl,
  fetchSocialContent,
  parseSocialUrl,
  extractLinks,
  searchWeb,
  parseSearchCommand,
  formatSearchContext
} from '../lib/webAccess.js';

export function useLlmChat(accountSlug, accountData) {
  const [messages, setMessages] = useState(() => loadHistory());
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  // Auto-search is permanently ON — no toggle. Web search is always available
  // for topically-relevant queries; use /search <query> for explicit search.
  const abortRef = useRef(null);

  useEffect(() => {
    if (accountSlug) {
      saveAccountContext(accountSlug, { accountSlug });
    }
  }, [accountSlug]);

  const send = useCallback(
    async (userText) => {
      if (!userText?.trim() || isStreaming) return;
      setError(null);

      const userMsg = { role: 'user', content: userText, ts: Date.now(), account: accountSlug };
      const updated = appendMessage(messages, 'user', userText, accountSlug);
      setMessages(updated);

      // ====== PRE-PROCESS: collect web context ======
      // 1) Detect explicit /search command — always run
      // 2) If search enabled, auto-search for topically relevant terms
      // 3) Detect URL passthrough → fetch HTML
      const contextBlocks = [];

      const cmd = parseSearchCommand(userText);
      if (cmd.isCommand) {
        // /search foo bar → explicit search
        const sr = await searchWeb(cmd.query, 5);
        contextBlocks.push(formatSearchContext(sr));
        if (sr.ok && sr.results.length > 0) {
          // also fetch full content of top 1 result for deeper context
          const top = await fetchUrl(sr.results[0].url);
          if (top.ok) {
            contextBlocks.push(`[Top result content: ${top.url}]\n${top.content.slice(0, 3000)}`);
          }
        }
      } else {
        // URL passthrough — gunakan fetchSocialContent untuk IG/TT/YT,
        // fetchUrl biasa untuk link generic
        const links = extractLinks(userText);
        if (links.length > 0) {
          const fetched = await Promise.all(links.map(async (l) => {
            const isSocial = parseSocialUrl(l);
            if (typeof console !== 'undefined') console.log('[TITAN-DEBUG] url:', l, 'isSocial:', !!isSocial);
            try {
              const r = isSocial ? await fetchSocialContent(l) : await fetchUrl(l);
              if (typeof console !== 'undefined') console.log('[TITAN-DEBUG] result:', l, r.ok ? `OK source=${r.source}` : `FAIL: ${r.error}`);
              return r;
            } catch (e) {
              if (typeof console !== 'undefined') console.error('[TITAN-DEBUG] throw:', l, e);
              return { ok: false, url: l, error: e.message, platform: parseSocialUrl(l)?.platform, id: parseSocialUrl(l)?.id };
            }
          }));
          const ok = fetched.filter((f) => f.ok);
          if (ok.length > 0) {
            contextBlocks.push(
              `[Web context from ${ok.length} link(s):\n${ok.map((o) => `--- ${o.url} ---\n${o.content.slice(0, 2000)}`).join('\n\n')}]`
            );
          }
          // Beri tahu user kalau ada social post yang gagal di-fetch
          const failed = fetched.filter((f) => !f.ok && f.platform);
          if (failed.length > 0) {
            const failedList = failed.map((f) => `${f.platform}/${f.id}`).join(', ');
            contextBlocks.push(`[⚠️ ${failed.length} social post tidak bisa di-fetch: ${failedList}. Post mungkin privat/dihapus.]`);
          }
        }

        // Auto search: selalu ON. Untuk query yang tidak punya URL,
        // search untuk kasih LLM kemampuan jawab pertanyaan terbaru/topikal.
        // Trigger heuristic: panjang query > 8 char DAN mengandung kata tanya/riset
        // (apa, siapa, bagaimana, latest, berita, harga, dll)
        if (links.length === 0) {
          const needsSearch = /^(apa|siapa|bagaimana|kapan|dimana|dimana|berapa|kenapa|mengapa|latest|terbaru|berita|harga|tren|trend|berapa|info|informasi|tell me|what|who|how|when|where|why|news|price|trend|latest)\b/i.test(userText.trim());
          // Fallback: kalau query > 40 char DAN tidak ada URL, kasih 1 search untuk konteks
          const fallback = !needsSearch && userText.trim().length > 40 && /\?$/.test(userText.trim());
          if (needsSearch || fallback) {
            const sr = await searchWeb(userText.trim(), 4);
            if (sr.ok && sr.results.length > 0) {
              contextBlocks.push(formatSearchContext(sr));
            }
          }
        }
      }

      const enrichedText = contextBlocks.length > 0
        ? `${contextBlocks.join('\n\n')}\n\nUser question: ${userText}`
        : userText;

      const enrichedUserMsg = { ...userMsg, content: enrichedText };
      saveHistory([...loadHistory().slice(0, -1), enrichedUserMsg]); // keep enriched version persistent

      // Build system prompt with all memory layers
      const systemPrompt = await buildSystemPrompt(accountSlug, accountData);

      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...updated.slice(0, -1).filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: enrichedText }
      ];

      const assistantMsg = { role: 'assistant', content: '', ts: Date.now(), account: accountSlug };
      const withAssistant = [...updated, assistantMsg];
      setMessages(withAssistant);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        let buffer = '';
        for await (const delta of streamChat(apiMessages)) {
          if (controller.signal.aborted) break;
          buffer += delta;
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') {
              next[next.length - 1] = { ...last, content: buffer };
            }
            return next;
          });
        }
        const finalMessages = [...withAssistant];
        const lastIdx = finalMessages.length - 1;
        if (finalMessages[lastIdx]?.role === 'assistant') {
          finalMessages[lastIdx] = { ...finalMessages[lastIdx], content: buffer };
        }
        saveHistory(finalMessages);

        // Auto-save topic to account context
        if (accountSlug) {
          pushRecentTopic(accountSlug, userText.slice(0, 80));
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err.message);
          const errMsg = `[Error: ${err.message}]`;
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') {
              next[next.length - 1] = { ...last, content: errMsg };
            }
            return next;
          });
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, isStreaming, accountSlug, accountData]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const clear = useCallback(() => {
    clearHist();
    setMessages([]);
  }, []);

  return { messages, isStreaming, error, send, stop, clear };
}
