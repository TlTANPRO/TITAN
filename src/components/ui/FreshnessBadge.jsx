// Per-account content freshness indicator. The label describes the newest
// post, not the pipeline run time.
import { Chip } from './Chip.jsx';
import { formatRelativeAge, getAgeMs, getContentTone } from '../../lib/dataFreshness.js';

function freshnessFromLastPost(lastPostAt) {
  const ageMs = getAgeMs(lastPostAt);
  if (ageMs == null) return { tone: 'danger', label: 'Tanpa data', sublabel: 'perlu enrichment' };

  const tone = getContentTone(ageMs);
  return {
    tone,
    label: tone === 'success' ? 'Aman' : 'Periksa',
    sublabel: formatRelativeAge(ageMs)
  };
}

export function FreshnessBadge({ lastPostAt, size = 'sm' }) {
  const f = freshnessFromLastPost(lastPostAt);
  return <Chip tone={f.tone} size={size}>{f.label} · {f.sublabel}</Chip>;
}

export function getFreshness(lastPostAt) {
  return freshnessFromLastPost(lastPostAt);
}
