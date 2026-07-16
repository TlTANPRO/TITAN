// Lightweight no-op provider — memory is purely localStorage + per-call build
import { useEffect } from 'react';
import { loadUserProfile } from '../memory/userProfile.js';

export function MemoryProvider({ children }) {
  useEffect(() => {
    // warm user profile cache on mount
    loadUserProfile();
  }, []);
  return children;
}
