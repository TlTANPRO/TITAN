// Single place that reads the Worker proxy configuration.
//
// Split out of llm.js so both the LLM client and the session client can ask
// "is proxy mode on?" without importing each other (which would be a cycle).
export function getProxyUrl() {
  return import.meta.env.VITE_LLM_PROXY_URL ?? '';
}

export function isProxyMode() {
  return Boolean(getProxyUrl());
}

export function getRequestedProvider() {
  return import.meta.env.VITE_LLM_PROXY_URL
    ? 'auto'
    : (import.meta.env.VITE_LLM_PROVIDER || 'openrouter');
}
