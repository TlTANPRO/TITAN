// Memory Layer 1: chat history per device
const KEY = 'titan.chatHistory.v1';
const MAX_MESSAGES = 50; // keep last 50, summarize older

export function loadHistory() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function saveHistory(messages) {
  try {
    const trimmed = messages.slice(-MAX_MESSAGES);
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    // quota or private mode — silent fail
  }
}

export function clearHistory() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export function appendMessage(messages, role, content, accountSlug) {
  return [
    ...messages,
    { role, content, ts: Date.now(), account: accountSlug ?? null }
  ];
}
