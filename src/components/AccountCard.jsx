// AccountCard — single account tile. Uses the real profile photo via the
// Worker /avatar proxy. If the photo URL is missing OR fails to load, we
// render a colored brand-icon tile (IG or TT) — never a letter fallback.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Instagram, Calendar, AlertTriangle } from 'lucide-react';
import { formatNumber, formatPercent, relativeTime } from '../lib/format.js';
import { proxiedImage } from '../lib/imageProxy.js';

function TtIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.62a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.05Z" />
    </svg>
  );
}

export default function AccountCard({ account }) {
  const isIG = account.platform === 'instagram';
  const [avatarFailed, setAvatarFailed] = useState(false);
  const showImg = account.avatarUrl && !avatarFailed;
  const PlatformIcon = isIG ? Instagram : TtIcon;
  const accentColor = isIG ? 'text-accent-instagram' : 'text-accent-tiktok';
  const isLimited = account.availability && !account.availability.hasRealData;

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
            {showImg ? (
              <img
                src={proxiedImage(account.avatarUrl)}
                alt={account.username}
                onError={() => setAvatarFailed(true)}
                className="w-12 h-12 rounded-full object-cover bg-bg-tertiary flex-shrink-0"
              />
            ) : (
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isIG
                    ? 'bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500'
                    : 'bg-black'
                }`}
              >
                <PlatformIcon className={`w-6 h-6 ${isIG ? 'text-white' : 'text-white'}`} />
              </div>
            )}
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
