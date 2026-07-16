// AccountListPopover — dropdown popup grouped by platform (IG + TT).
// Anchored under the trigger button, scrollable, click-row navigates to /account/:slug.
// Used by TopbarActions in both Home and AccountPage.
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PlatformIcon, platformLabel } from './icons/PlatformIcon.jsx';
import { formatNumber, formatPercent } from '../lib/format.js';
import { X } from 'lucide-react';

const GROUP_ORDER = ['instagram', 'tiktok'];

function groupByPlatform(accounts) {
  const out = new Map();
  for (const a of accounts ?? []) {
    const key = a.platform === 'tiktok' ? 'tiktok' : 'instagram';
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(a);
  }
  // Sort each group by ER desc, fallback to followerCount
  for (const list of out.values()) {
    list.sort((a, b) => (b.engagementRate ?? -1) - (a.engagementRate ?? -1));
  }
  return out;
}

export function AccountListPopover({ accounts, onClose }) {
  const ref = useRef(null);
  const grouped = groupByPlatform(accounts);
  const totalAccounts = accounts?.length ?? 0;

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('keydown', handleEsc);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Daftar akun"
      className="absolute right-0 top-full mt-2 w-[min(420px,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto surface shadow-xl z-50 rounded-lg border border-border-subtle"
    >
      <div className="sticky top-0 bg-bg-secondary border-b border-border-subtle px-4 py-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Daftar Akun</h3>
          <p className="text-xs text-text-muted mt-0.5">{totalAccounts} akun dipantau</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Tutup daftar akun"
          className="p-1 rounded hover:bg-bg-tertiary transition-colors"
        >
          <X className="w-4 h-4 text-text-muted" />
        </button>
      </div>
      {totalAccounts === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-text-muted">
          Belum ada akun
        </div>
      ) : (
        <div className="py-2">
          {GROUP_ORDER.filter((k) => grouped.has(k)).map((platformKey) => {
            const list = grouped.get(platformKey) ?? [];
            return (
              <div key={platformKey} className="mb-2">
                <div className="px-4 py-2 flex items-center gap-2 text-xs font-semibold text-text-muted uppercase tracking-wider">
                  <PlatformIcon platform={platformKey} className="w-4 h-4" />
                  {platformLabel(platformKey)}
                  <span className="ml-auto text-text-muted font-normal normal-case">
                    {list.length} akun
                  </span>
                </div>
                <ul>
                  {list.map((a) => (
                    <li key={a.slug}>
                      <Link
                        to={`/account/${a.slug}`}
                        onClick={onClose}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-bg-tertiary transition-colors"
                      >
                        <PlatformIcon platform={a.platform} className="w-5 h-5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-text-primary truncate">
                            @{a.username}
                          </div>
                          <div className="text-[11px] text-text-muted">
                            {formatNumber(a.followerCount ?? 0)} pengikut
                            {a.engagementRate != null ? ` · ${formatPercent(a.engagementRate)} ER` : ''}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
