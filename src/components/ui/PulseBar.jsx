// V36: PulseBar — TITAN signature element.
// Satu baris "heartbeat" di atas setiap page utama: dot per akun (warna =
// platform, intensitas = aktivitas 7 hari) + label ringkas.
// Memorable detail yang membuat dashboard ini tidak generik.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAccounts } from '../../hooks/useAccount.js';

const NOW = () => Date.now() / 1000;

// Aktivitas 7 hari → intensity 0..1 (0 = tidak ada post, 1 = sangat aktif)
function activityIntensity(posts) {
  const cut = NOW() - 7 * 86400;
  const recent = (posts ?? []).filter((p) => (p.createTime ?? 0) > cut).length;
  return Math.min(1, recent / 5); // 5+ post/7d = full intensity
}

// Freshness: post terakhir <48h = hijau, <7d = amber, >7d = redup
function freshnessLevel(posts) {
  const latest = (posts ?? []).reduce((m, p) => Math.max(m, p.createTime ?? 0), 0);
  if (!latest) return 'stale';
  const age = NOW() - latest;
  if (age < 48 * 3600) return 'fresh';
  if (age < 7 * 86400) return 'warm';
  return 'stale';
}

const FRESH_STYLE = {
  fresh: { base: 'bg-accent-success', ring: 'ring-accent-success/40' },
  warm: { base: 'bg-accent-brand', ring: 'ring-accent-brand/40' },
  stale: { base: 'bg-text-disabled', ring: 'ring-border-subtle' }
};

export function PulseBar({ title = 'Pulse' }) {
  const accounts = useAccounts();

  const pulses = useMemo(
    () =>
      (accounts ?? []).map((a) => ({
        slug: a.slug,
        username: a.username,
        platform: a.platform,
        intensity: activityIntensity(a.posts),
        freshness: freshnessLevel(a.posts),
        recent7d: (a.posts ?? []).filter((p) => (p.createTime ?? 0) > NOW() - 7 * 86400).length
      })),
    [accounts]
  );

  const totalRecent = pulses.reduce((s, p) => s + p.recent7d, 0);
  const freshCount = pulses.filter((p) => p.freshness === 'fresh').length;

  return (
    <div
      className="surface px-4 py-3 flex items-center gap-4 flex-wrap"
      role="status"
      aria-label={`Pulse: ${totalRecent} post dalam 7 hari, ${freshCount} akun fresh`}
    >
      <span className="text-[10px] font-mono tracking-widest uppercase text-text-muted flex-shrink-0">
        {title}
      </span>
      <div className="flex items-center gap-2 flex-wrap">
        {pulses.map((p) => {
          const style = FRESH_STYLE[p.freshness] ?? FRESH_STYLE.stale;
          const size = 8 + Math.round(p.intensity * 6); // 8–14px by activity
          return (
            // V37 a11y target-size: visual dot kecil, tapi padding memberi hit area >=24px
            <Link
              key={p.slug}
              to={`/account/${p.slug}`}
              title={`@${p.username} — ${p.recent7d} post/7d`}
              aria-label={`@${p.username} — ${p.recent7d} post per 7 hari`}
              className={`rounded-full ${style.base} ring-2 ring-inset ${style.ring} hover:scale-110 transition-transform [transition-duration:var(--duration-fast)] flex-shrink-0`}
              style={{ width: size + 16, height: size + 16, backgroundClip: 'content-box', padding: 8 }}
            />
          );
        })}
      </div>
      <span className="text-xs text-text-secondary tabular-nums flex-shrink-0">
        <span className="font-semibold text-text-primary">{totalRecent}</span> post / 7 hari
        <span className="text-text-muted mx-1.5">·</span>
        <span className="font-semibold text-accent-success">{freshCount}</span> akun fresh
      </span>
    </div>
  );
}
