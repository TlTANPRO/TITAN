const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function toTimestampMs(value) {
  if (value == null || value === '') return 0;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }

  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && value.trim() !== '') {
      return numeric > 1e12 ? numeric : numeric * 1000;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getLatestPostAt(accounts = []) {
  let latest = 0;

  for (const account of accounts) {
    for (const post of account?.posts ?? []) {
      const timestamp = toTimestampMs(post?.createTime ?? post?.timestamp);
      if (timestamp > latest) latest = timestamp;
    }
  }

  return latest || null;
}

export function getLatestScrapeAt(accounts = []) {
  let latest = 0;

  for (const account of accounts) {
    const timestamp = toTimestampMs(account?.scrapedAt);
    if (timestamp > latest) latest = timestamp;
  }

  return latest || null;
}

export function getAgeMs(timestamp, now = Date.now()) {
  const value = toTimestampMs(timestamp);
  return value ? Math.max(0, now - value) : null;
}

export function formatRelativeAge(ageMs) {
  if (ageMs == null || !Number.isFinite(ageMs)) return 'tidak diketahui';
  if (ageMs < MINUTE_MS) return 'baru';

  const minutes = Math.floor(ageMs / MINUTE_MS);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}j`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} hari`;

  return `${Math.floor(days / 30)} bulan`;
}

export function getContentTone(ageMs) {
  if (ageMs == null) return 'neutral';
  if (ageMs < DAY_MS) return 'success';
  if (ageMs < 3 * DAY_MS) return 'warning';
  return 'danger';
}

export function getPortfolioFreshness(accounts = [], now = Date.now()) {
  const latestPostAt = getLatestPostAt(accounts);
  const lastScrapeAt = getLatestScrapeAt(accounts);
  const ageMs = getAgeMs(latestPostAt, now);
  const tone = getContentTone(ageMs);

  return {
    tone,
    label: latestPostAt ? `Konten ${formatRelativeAge(ageMs)}` : 'Belum ada data konten',
    latestPostAt,
    lastScrapeAt,
    ageMs,
    accountCount: accounts.length,
    platforms: ['instagram', 'tiktok'].reduce((result, platform) => {
      const platformAccounts = accounts.filter(
        (account) => String(account?.platform ?? '').toLowerCase() === platform
      );
      const platformLatestPostAt = getLatestPostAt(platformAccounts);
      const platformAgeMs = getAgeMs(platformLatestPostAt, now);
      result[platform] = {
        accountCount: platformAccounts.length,
        latestPostAt: platformLatestPostAt,
        ageMs: platformAgeMs,
        tone: getContentTone(platformAgeMs),
        label: platformLatestPostAt
          ? `Konten ${formatRelativeAge(platformAgeMs)}`
          : 'Belum ada konten'
      };
      return result;
    }, {})
  };
}

export function getAccountFreshness(account, now = Date.now()) {
  return getPortfolioFreshness(account ? [account] : [], now);
}
