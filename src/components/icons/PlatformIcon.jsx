// PlatformIcon — picks IgIcon or TtIcon based on `platform` prop.
// Use anywhere you need a brand-accurate platform mark without conditional logic.
import { IgIcon } from './IgIcon.jsx';
import { TtIcon } from './TtIcon.jsx';

const NORMALIZE = {
  instagram: 'instagram',
  ig: 'instagram',
  tiktok: 'tiktok',
  tt: 'tiktok'
};

export function PlatformIcon({ platform, className, size = 24, title }) {
  const key = NORMALIZE[String(platform ?? '').toLowerCase()] ?? 'instagram';
  if (key === 'tiktok') {
    return <TtIcon className={className} />;
  }
  return <IgIcon className={className} size={size} title={title ?? 'Instagram'} />;
}

export function platformLabel(platform) {
  const key = NORMALIZE[String(platform ?? '').toLowerCase()] ?? 'instagram';
  return key === 'tiktok' ? 'TikTok' : 'Instagram';
}

export function isTikTok(platform) {
  return NORMALIZE[String(platform ?? '').toLowerCase()] === 'tiktok';
}
