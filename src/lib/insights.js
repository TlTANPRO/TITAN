// AI insights loader — lazy-loads ai-insights.json on first request, then caches in memory.
//
// All insight components (ViralRecipe, GrowthStrategy, StrategyBrief, WeeklyBriefing)
// call this with (slug, type) instead of duplicating fetch + cache logic.
//
// Graceful failure: if the JSON is missing, invalid, or the entry is an error string,
// the components fall back to their pure-analytics view.
let _aiInsights = null;
let _loadingPromise = null;

async function ensureLoaded() {
  if (_aiInsights !== null) return _aiInsights;
  if (_loadingPromise) return _loadingPromise;
  _loadingPromise = (async () => {
    try {
      const mod = await import('../data/ai-insights.json');
      _aiInsights = mod.default ?? mod;
      return _aiInsights;
    } catch {
      _aiInsights = {};
      return _aiInsights;
    }
  })();
  return _loadingPromise;
}

// Kick off load on module import so first component render finds it ready
ensureLoaded();

/**
 * Return the cached insight text for an account, or null if not available.
 * @param {string} slug — account slug (e.g. 'tt-itsnisyananda')
 * @param {'viralRecipe' | 'growthStrategy' | 'strategyBrief'} type
 * @returns {string | null}
 */
export function getInsight(slug, type) {
  if (!_aiInsights?.accounts?.[slug]) return null;
  const text = _aiInsights.accounts[slug]?.[type];
  if (!text || typeof text !== 'string') return null;
  if (text.startsWith('⚠️ Error:')) return null; // quota / network failure
  return text;
}

/**
 * Return the weekly briefing text, or null if not available.
 * @returns {string | null}
 */
export function getWeeklyBriefing() {
  const text = _aiInsights?.weekly;
  if (!text || typeof text !== 'string') return null;
  if (text.startsWith('⚠️ Error:')) return null;
  return text;
}

/**
 * Metadata about the last insights generation run.
 * @returns {{ generatedAt: string | null, accountCount: number, hasErrors: boolean }}
 */
export function getInsightsMeta() {
  if (!_aiInsights) return { generatedAt: null, accountCount: 0, hasErrors: false };
  const slugs = Object.keys(_aiInsights.accounts ?? {});
  const hasErrors = slugs.some((s) => {
    const ins = _aiInsights.accounts[s];
    return !ins || Object.values(ins).some((v) => typeof v === 'string' && v.startsWith('⚠️ Error:'));
  });
  return {
    generatedAt: _aiInsights.generatedAt ?? null,
    accountCount: slugs.length,
    hasErrors
  };
}
