// V21: FreshnessBadge — color-coded "data freshness" indicator per account.
// 🟢 Fresh (<24h), 🟡 Stale (24-72h), 🔴 Missing (7+ days no post).
import { Chip } from './Chip.jsx';

function freshnessFromLastPost(lastPostAt) {
  if (!lastPostAt) return { tone: 'danger', label: 'Tanpa data', sublabel: 'perlu enrichment' };
  const ageMs = Date.now() - new Date(lastPostAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays < 1) return { tone: 'success', label: 'Fresh', sublabel: '< 1 hari' };
  if (ageDays < 3) return { tone: 'success', label: 'Fresh', sublabel: `${ageDays.toFixed(1)} hari` };
  if (ageDays < 7) return { tone: 'warning', label: 'Stale', sublabel: `${Math.floor(ageDays)} hari` };
  return { tone: 'danger', label: 'Stale', sublabel: `${Math.floor(ageDays)} hari` };
}

export function FreshnessBadge({ lastPostAt, size = 'sm' }) {
  const f = freshnessFromLastPost(lastPostAt);
  return <Chip tone={f.tone} size={size}>{f.label} · {f.sublabel}</Chip>;
}

export function getFreshness(lastPostAt) {
  return freshnessFromLastPost(lastPostAt);
}
