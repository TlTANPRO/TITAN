import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'titan.theme.v1';
// 2-option theme: dark or light. (System option removed.)
const VALID = new Set(['dark', 'light']);

function readInitial() {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && VALID.has(saved)) return saved;
  } catch {
    // localStorage can be unavailable in some embeds; fall through
  }
  return 'dark';
}

function resolve(theme) {
  // 'dark' or 'light' only — no system branch.
  return theme === 'light' ? 'light' : 'dark';
}

function apply(theme) {
  if (typeof document === 'undefined') return;
  const resolved = resolve(theme);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.dataset.theme = resolved;
}

// Module-level subscriber list so multiple components stay in sync without context.
const listeners = new Set();
let current = typeof window === 'undefined' ? 'dark' : readInitial();

if (typeof window !== 'undefined') {
  apply(current);
  // Persist initial value so reloads are deterministic even when nothing was set.
  try { localStorage.setItem(STORAGE_KEY, current); } catch { /* ignore */ }
}

function setTheme(next) {
  if (!VALID.has(next)) return;
  current = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  apply(next);
  listeners.forEach((l) => l(next));
}

export function useTheme() {
  const [theme, setLocal] = useState(current);
  useEffect(() => {
    const listener = (t) => setLocal(t);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  const set = useCallback((t) => setTheme(t), []);
  return { theme, resolved: resolve(theme), set, isDark: resolve(theme) === 'dark' };
}
