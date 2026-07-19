// V21: PeriodFilter — global "Periode" filter (Grafana-style variable filter).
// Affects all analytics. Default: 'all'. Persists in localStorage + URL (?period=30d).
// Used by Topbar + analytics functions.
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export const PERIOD_OPTIONS = [
  { value: '7d', label: '7 Hari', days: 7 },
  { value: '30d', label: '30 Hari', days: 30 },
  { value: '90d', label: '90 Hari', days: 90 },
  { value: 'all', label: 'Semua', days: null },
  { value: 'custom', label: 'Custom', days: null }
];

const STORAGE_KEY = 'titan.period.v1';

function getInitialPeriod(searchParams) {
  const fromUrl = searchParams.get('period');
  if (fromUrl && PERIOD_OPTIONS.some((p) => p.value === fromUrl)) return fromUrl;
  if (typeof window !== 'undefined') {
    return window.localStorage.getItem(STORAGE_KEY) ?? 'all';
  }
  return 'all';
}

export function usePeriod() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [period, setPeriodState] = useState(() => getInitialPeriod(searchParams));

  const setPeriod = useCallback((next) => {
    setPeriodState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === 'all') p.delete('period');
      else p.set('period', next);
      return p;
    }, { replace: true });
  }, [setSearchParams]);

  return { period, setPeriod, options: PERIOD_OPTIONS };
}

/** Returns a predicate `post => boolean` for filtering by the active period. */
export function periodPredicate(period) {
  const opt = PERIOD_OPTIONS.find((p) => p.value === period);
  if (!opt || opt.days == null) return () => true;
  const cutoff = Date.now() - opt.days * 24 * 60 * 60 * 1000;
  return (post) => {
    const t = Number(post.createTime ?? post.timestamp ?? 0);
    if (t <= 0) return true; // keep undated
    return (t > 1e12 ? t : t * 1000) >= cutoff;
  };
}
