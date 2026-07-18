// 9 akun target — full-scrape semua
export const ACCOUNTS_IG = [
  { slug: 'ig-majangmejeng_', username: 'majangmejeng_', displayName: 'Majang Mejeng' },
  { slug: 'ig-syahfalahproperti', username: 'syahfalahproperti', displayName: 'PT. SYAHFALAH GRIYA AQUILA' },
  { slug: 'ig-nisyanandaa', username: 'nisyanandaa', displayName: 'Nisyananda' },
  { slug: 'ig-ardiantanah', username: 'ardiantanah', displayName: 'Achmad Ardiansyah' }
];

export const ACCOUNTS_TT = [
  { slug: 'tt-majangmejeng_', username: 'majangmejeng_', displayName: 'Majang Mejeng' },
  { slug: 'tt-syahfalahproperti', username: 'syahfalahproperti', displayName: 'SYAHFALAH GRIYA AQUILA' },
  { slug: 'tt-ardian.tanah', username: 'ardian.tanah', displayName: 'ardian tanah' },
  { slug: 'tt-ardiantanahmenjawab', username: 'ardiantanahmenjawab', displayName: 'achmad ardiansyah' },
  { slug: 'tt-itsnisyananda', username: 'itsnisyananda', displayName: 'Nisyananda' }
];

export const ALL_ACCOUNTS = [...ACCOUNTS_IG, ...ACCOUNTS_TT];

export function findAccountBySlug(slug) {
  return ALL_ACCOUNTS.find((a) => a.slug === slug);
}
