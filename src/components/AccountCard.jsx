// AccountCard — single account tile. Uses the real profile photo via
// <ProxiedAvatar> (which routes IG/TT Akamai-protected URLs browser-direct
// and other CDNs through Worker /avatar). On load failure, falls back to a
// brand-icon tile (IG or TT) — never a letter.
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, AlertTriangle, Instagram } from 'lucide-react';
import { formatNumber, formatPercent, relativeTime } from '../lib/format.js';
import { ProxiedAvatar } from './ProxiedAvatar.jsx';
import { TtIcon } from './icons/TtIcon.jsx';

export default function AccountCard({ account }) {
  const isIG = account.platform === 'instagram';
  const isLimited = account.availability && !account.availability.hasRealData;
  const PlatformIcon = isIG ? Instagram : TtIcon;

  return (
    <motion.div
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      className="h-full"
    >
      <Link
        to={`/account/${account.slug}`}
        className="group surface hover:border-border-default transition-colors p-5 flex flex-col gap-4 relative h-full"
        aria-label={`Buka analisis akun @${account.username}`}
      >
        {isLimited && (
          <div
            className="absolute top-3 right-3 chip bg-accent-warning/10 text-accent-warning text-[10px] z-10"
            title="Akun ini memiliki data terbatas — perlu re-scrape dengan /media/info enrichment"
          >
            <AlertTriangle className="w-3 h-3" />
            Data Terbatas
          </div>
        )}

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <ProxiedAvatar account={account} size={48} className="rounded-full" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="font-semibold text-text-primary truncate">@{account.username}</h3>
                {account.isVerified && <span className="text-accent-primary text-xs">✓</span>}
              </div>
              <p className="text-xs text-text-muted truncate">{account.displayName}</p>
            </div>
          </div>
          <span className={`chip ${isIG ? 'bg-accent-instagram/10 text-accent-instagram' : 'bg-accent-tiktok/10 text-accent-tiktok'}`}>
            <PlatformIcon className="w-3 h-3" />
            {isIG ? 'IG' : 'TT'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border-subtle">
          <div>
            <div className="stat-label">Pengikut</div>
            <div className="text-base font-semibold text-text-primary tabular-nums">{formatNumber(account.followerCount)}</div>
          </div>
          <div>
            <div className="stat-label">Post</div>
            <div className="text-base font-semibold text-text-primary tabular-nums">{formatNumber(account.postCount ?? account.posts?.length ?? 0)}</div>
          </div>
          <div>
            <div className="stat-label">ER</div>
            <div className={`text-base font-semibold tabular-nums ${isLimited ? 'text-text-muted' : 'text-accent-success'}`}>
              {isLimited ? '—' : formatPercent(account.engagementRate ?? null)}
            </div>
          </div>
        </div>

        {account.scrapedAt && (
          <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <Calendar className="w-3 h-3" />
            Diperbarui {relativeTime(new Date(account.scrapedAt).getTime())}
          </div>
        )}
      </Link>
    </motion.div>
  );
}
