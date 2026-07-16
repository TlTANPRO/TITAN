// Memory Layer 3: per-account conversation context
const KEY = 'titan.accountContext.v1';
const MAX_RECENT_TOPICS = 5;

export function loadAccountContext(slug) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data[slug] ?? {};
  } catch {
    return {};
  }
}

export function saveAccountContext(slug, update) {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : {};
    const existing = data[slug] ?? {};
    data[slug] = {
      ...existing,
      ...update,
      lastSeen: Date.now()
    };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}

export function pushRecentTopic(slug, topic) {
  const ctx = loadAccountContext(slug);
  const recent = [...(ctx.recentTopics ?? []), topic].slice(-MAX_RECENT_TOPICS);
  saveAccountContext(slug, { recentTopics: recent });
}

export function clearAccountContext(slug) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    delete data[slug];
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}
