// React binding for the runtime session (V39).
//
// Session state lives in sessionStorage, which other tabs do not share, so we
// poll a lightweight expiry check instead of listening for a storage event.
// The poll only recomputes local state (no network) and pauses when the tab is
// hidden, so an idle tab costs nothing.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearSession as clearSessionStore,
  describeSessionState,
  getStoredBootstrap,
  readSessionState,
  requestSession as requestSessionStore,
  verifySession as verifySessionStore
} from '../lib/session.js';

const EXPIRY_POLL_MS = 30_000;

export function useSession() {
  const [state, setState] = useState(() => readSessionState());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  const refresh = useCallback(() => {
    setState(readSessionState());
  }, []);

  useEffect(() => {
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setState(readSessionState());
    };
    timerRef.current = setInterval(tick, EXPIRY_POLL_MS);
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const requestSession = useCallback(async (bootstrap) => {
    setBusy(true);
    setError(null);
    const result = await requestSessionStore({ bootstrap });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      refresh();
      return result;
    }
    refresh();
    return result;
  }, [refresh]);

  const verifySession = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await verifySessionStore();
    setBusy(false);
    if (!result.ok && result.reason === 'network') setError(result.error ?? 'Worker tidak dapat dihubungi');
    refresh();
    return result;
  }, [refresh]);

  const clearSession = useCallback(() => {
    clearSessionStore('user');
    setError(null);
    refresh();
  }, [refresh]);

  return {
    state,
    status: state.status,
    label: describeSessionState(state),
    busy,
    error,
    hasBootstrap: Boolean(getStoredBootstrap()),
    requestSession,
    verifySession,
    clearSession,
    refresh
  };
}
