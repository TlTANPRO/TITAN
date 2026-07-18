// React hook: subscribe to unified dataStore
// Keeps accounts-full.json OUT of main bundle (3MB → tiny entry)
import { useState, useEffect, useMemo } from 'react';
import { subscribeToAccounts, getAllAccounts, getAccountBySlug } from '../lib/dataStore.js';
import { computeAllInsights, crossAccountComparison } from '../lib/analytics.js';

export function useAccounts() {
  const [accounts, setAccounts] = useState(() => getAllAccounts());
  useEffect(() => {
    return subscribeToAccounts((list) => setAccounts(list));
  }, []);
  return accounts;
}

export function useAccount(slug) {
  const accounts = useAccounts();
  return useMemo(() => accounts.find((a) => a.slug === slug) ?? getAccountBySlug(slug) ?? null, [accounts, slug]);
}

export function useAccountInsights(slug) {
  const account = useAccount(slug);
  return useMemo(() => (account ? computeAllInsights(account) : null), [account]);
}

export function useCrossAccountComparison() {
  const accounts = useAccounts();
  return useMemo(() => crossAccountComparison(accounts), [accounts]);
}
