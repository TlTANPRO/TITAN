import { useState, useEffect, useRef } from 'react';
import { useLlmChat } from '../hooks/useLlmChat.js';
import { subscribeToAccounts, getAccountBySlug } from '../lib/dataStore.js';
import {
  Send, X, MessageSquare, Trash2, Square, AlertCircle
} from 'lucide-react';

function formatRelative(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'baru';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

// Minimal markdown for assistant messages: **bold**, *italic*, `code`.
// Inline-only — no headings, no lists. Keeps it safe (no dangerouslySetInnerHTML).
// Renders as <strong>/<em>/<code> via React elements; no string injection.
function renderInlineMarkdown(text) {
  if (!text) return null;
  // Tokenize: split on markdown markers, keep markers as separate tokens
  // Pattern: **...** | *...* | `...`
  const parts = [];
  let i = 0;
  let key = 0;
  const re = /(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|`[^`\n]+?`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) {
      parts.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith('`')) {
      parts.push(<code key={key++} className="px-1 py-0.5 rounded bg-bg-tertiary text-text-primary text-[0.85em] font-mono">{tok.slice(1, -1)}</code>);
    } else {
      parts.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// Detect /account/:slug route and capture the slug
function useCurrentAccountSlug() {
  const [slug, setSlug] = useState(null);
  useEffect(() => {
    const detect = () => {
      const m = window.location.pathname.match(/\/account\/([^/]+)/);
      setSlug(m ? m[1] : null);
    };
    detect();
    window.addEventListener('popstate', detect);
    // Observe pushState/replaceState navigasi
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function (...args) {
      origPush.apply(this, args);
      detect();
    };
    history.replaceState = function (...args) {
      origReplace.apply(this, args);
      detect();
    };
    window.addEventListener('popstate', detect);
    return () => {
      history.pushState = origPush;
      history.replaceState = origReplace;
      window.removeEventListener('popstate', detect);
    };
  }, []);
  return slug;
}

export default function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const currentAccountSlug = useCurrentAccountSlug();

  // Subscribe to dataStore — AI chat pakai data yang SAMA dengan Home/AccountPage
  // (single source of truth). Update paralel otomatis kalau data reloaded.
  const [accountData, setAccountData] = useState(() => {
    if (!currentAccountSlug) return null;
    const found = getAccountBySlug(currentAccountSlug);
    if (!found) return null;
    return {
      platform: found.platform,
      username: found.username,
      displayName: found.displayName,
      followerCount: found.followerCount,
      postCount: found.postCount ?? found.posts?.length,
      bio: found.bio ?? found.biography,
      isVerified: found.isVerified ?? found.verified
    };
  });
  useEffect(() => {
    if (!currentAccountSlug) {
      setAccountData(null);
      return;
    }
    return subscribeToAccounts(() => {
      const found = getAccountBySlug(currentAccountSlug);
      if (!found) { setAccountData(null); return; }
      setAccountData({
        platform: found.platform,
        username: found.username,
        displayName: found.displayName,
        followerCount: found.followerCount,
        postCount: found.postCount ?? found.posts?.length,
        bio: found.bio ?? found.biography,
        isVerified: found.isVerified ?? found.verified
      });
    });
  }, [currentAccountSlug]);

  const { messages, isStreaming, error, send, stop, clear } =
    useLlmChat(currentAccountSlug, accountData);

  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  const handleSend = (e) => {
    e?.preventDefault?.();
    if (!input.trim() || isStreaming) return;
    send(input);
    setInput('');
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-accent-primary hover:bg-accent-primary/90 text-white shadow-2xl flex items-center justify-center transition-colors"
          aria-label="Buka AI Assistant"
          title="TITAN AI — buka chat"
        >
          <MessageSquare className="w-6 h-6" />
        </button>
      )}
      {open && (
        <div className="fixed inset-0 sm:inset-auto sm:bottom-6 sm:right-6 z-50 w-full sm:w-[420px] h-full sm:h-[640px] sm:max-h-[80vh] bg-bg-secondary sm:border sm:border-border-subtle sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-bg-elevated">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent-success animate-pulse-soft" />
              <span className="text-sm font-semibold text-text-primary">TITAN AI</span>
              {currentAccountSlug ? (
                <span className="text-xs text-text-muted">· @{currentAccountSlug.replace(/^(ig|tt)-/, '')}</span>
              ) : (
                <span className="text-xs text-text-muted">· Global</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clear}
                className="p-1.5 rounded-lg hover:bg-bg-tertiary text-text-muted hover:text-text-danger transition-colors"
                aria-label="Clear history"
                title="Hapus semua chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-bg-tertiary text-text-muted hover:text-text-primary transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-text-muted text-sm py-8 px-4">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="mb-1 font-medium text-text-secondary">
                  {currentAccountSlug
                    ? `Tanya apa saja tentang @${currentAccountSlug.replace(/^(ig|tt)-/, '')}.`
                    : 'Tanya apa saja.'}
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} message-enter`}
              >
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    m.role === 'user'
                      ? 'bg-accent-primary text-white rounded-br-sm'
                      : 'bg-bg-elevated text-text-primary rounded-bl-sm border border-border-subtle'
                  }`}
                >
                  {m.content
                    ? (m.role === 'assistant' ? renderInlineMarkdown(m.content) : m.content)
                    : (m.role === 'assistant' && isStreaming && i === messages.length - 1 ? '…' : '')}
                </div>
                <div className="text-[10px] text-text-muted mt-1 px-1">{formatRelative(m.ts)}</div>
              </div>
            ))}
            {error && (
              <div className="text-xs text-accent-danger bg-accent-danger/10 border border-accent-danger/20 rounded-lg p-2 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSend} className="p-3 border-t border-border-subtle bg-bg-elevated">
            <div className="flex items-end gap-2">
              <textarea
                id="chat-message"
                name="message"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Tanya…"
                rows={1}
                autoComplete="off"
                className="flex-1 resize-none bg-bg-secondary border border-border-subtle rounded-xl px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary transition-colors max-h-32"
              />
              {isStreaming ? (
                <button
                  type="button"
                  onClick={stop}
                  className="w-10 h-10 rounded-xl bg-accent-danger text-white flex items-center justify-center hover:bg-accent-danger/90 transition-colors flex-shrink-0"
                  aria-label="Stop"
                >
                  <Square className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="w-10 h-10 rounded-xl bg-accent-primary text-white flex items-center justify-center hover:bg-accent-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                  aria-label="Send"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
