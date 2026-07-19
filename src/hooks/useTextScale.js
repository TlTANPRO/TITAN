// V24.1: useTextScale — open-webui pattern for user-controllable font size.
// Persists to localStorage titan.textScale.v1. Applies data-text-scale to <html>.
// Options: 'S' (0.875), 'M' (1, default), 'L' (1.125), 'XL' (1.25).
import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'titan.textScale.v1';
export const TEXT_SCALE_OPTIONS = [
  { value: 'S', label: 'Kecil', ratio: 0.875 },
  { value: 'M', label: 'Sedang', ratio: 1 },
  { value: 'L', label: 'Besar', ratio: 1.125 },
  { value: 'XL', label: 'Sangat Besar', ratio: 1.25 }
];

function readInitial() {
  if (typeof window === 'undefined') return 'M';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && TEXT_SCALE_OPTIONS.find((o) => o.value === stored)) return stored;
  return 'M';
}

export function useTextScale() {
  const [scale, setScaleState] = useState(readInitial);

  // Apply to <html> on mount and on change
  useEffect(() => {
    document.documentElement.setAttribute('data-text-scale', scale);
    window.localStorage.setItem(STORAGE_KEY, scale);
  }, [scale]);

  const setScale = useCallback((next) => {
    if (TEXT_SCALE_OPTIONS.find((o) => o.value === next)) {
      setScaleState(next);
    }
  }, []);

  return { scale, setScale, options: TEXT_SCALE_OPTIONS };
}
