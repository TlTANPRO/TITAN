// TITAN tokens — single source of truth untuk shared utilities
// (color palettes, locale strings, relative time). Konsolidasi dari
// Admin.jsx, KomentarAdmin.jsx, AccountOverview.jsx, EnhancedTable.jsx,
// AccountHealthGrid.jsx, Home.jsx, ViralPostCard.jsx, Calendar.jsx,
// LiveActivityFeed.jsx. Edit ONLY di sini kalau palette/locale berubah.

// === HEALTH SCORE → ACCENT TOKEN MAP ===
// Skor >= 80 = success, 65 = primary, 50/35 = warning, < 35 = danger.
// Mirrors AccountOverview (bg+text+border) + EnhancedTable (text only).
export function healthColor(score) {
  if (score >= 80) {
    return { bg: 'bg-accent-success/10', text: 'text-accent-success', border: 'border-accent-success/30' };
  }
  if (score >= 65) {
    return { bg: 'bg-accent-primary/10', text: 'text-accent-primary', border: 'border-accent-primary/30' };
  }
  if (score >= 50) {
    return { bg: 'bg-accent-warning/10', text: 'text-accent-warning', border: 'border-accent-warning/30' };
  }
  if (score >= 35) {
    return { bg: 'bg-accent-warning/10', text: 'text-accent-warning', border: 'border-accent-warning/30' };
  }
  return { bg: 'bg-accent-danger/10', text: 'text-accent-danger', border: 'border-accent-danger/30' };
}

// Grade → token class (A/B/C/D/E). Sama hue family dengan healthColor.
export const GRADE_COLORS = {
  A: 'bg-accent-success/20 text-accent-success border-accent-success/30',
  B: 'bg-accent-primary/20 text-accent-primary border-accent-primary/30',
  C: 'bg-accent-warning/20 text-accent-warning border-accent-warning/30',
  D: 'bg-accent-secondary/20 text-accent-secondary border-accent-secondary/30',
  E: 'bg-accent-danger/20 text-accent-danger border-accent-danger/30'
};

// === RANK PALETTE (gold/silver/bronze) — V27.2 token-based ===
// Konsisten dengan V23 token rule (no raw Tailwind palette).
export const RANK_COLORS = [
  'text-accent-warning',    // gold (rank 1)
  'text-text-secondary',    // silver (rank 2)
  'text-accent-secondary'   // bronze (rank 3+)
];

// === TIER LABELS (viral → rendah) ===
export const TIER_LABELS = {
  viral:    { label: 'Sangat Viral',     color: 'text-accent-secondary', desc: '> 3× rata-rata' },
  tinggi:   { label: 'Performa Tinggi',  color: 'text-accent-warning',   desc: '1.5–3× rata-rata' },
  bagus:    { label: 'Performa Bagus',   color: 'text-accent-success',   desc: '0.75–1.5× rata-rata' },
  rataRata: { label: 'Rata-rata',        color: 'text-text-secondary',   desc: '0.3–0.75× rata-rata' },
  rendah:   { label: 'Rendah',           color: 'text-text-muted',      desc: '< 0.3× rata-rata' }
};

// === ADMIN ACCENTS (4 palette: primary/success/warning/instagram) ===
// Julian pindah dari secondary ke instagram biar distinct dari Reni/Rifqi/Reta.
// `chip`/`hex`/`bar`/`ring` untuk berbagai konteks render.
export const ADMIN_ACCENTS = [
  { ring: 'ring-accent-primary',   text: 'text-accent-primary',   chip: 'bg-accent-primary/10 text-accent-primary border-accent-primary/30',   hex: '#3b82f6', bar: 'bg-accent-primary' },
  { ring: 'ring-accent-success',   text: 'text-accent-success',   chip: 'bg-accent-success/10 text-accent-success border-accent-success/30',   hex: '#10b981', bar: 'bg-accent-success' },
  { ring: 'ring-accent-warning',   text: 'text-accent-warning',   chip: 'bg-accent-warning/10 text-accent-warning border-accent-warning/30',   hex: '#f59e0b', bar: 'bg-accent-warning' },
  { ring: 'ring-accent-instagram', text: 'text-accent-instagram', chip: 'bg-accent-instagram/10 text-accent-instagram border-accent-instagram/30', hex: '#E1306C', bar: 'bg-accent-instagram' }
];

// Defensive admin → palette index. Unknown admin → first palette.
// ADMIN_ORDER harus di-pass sebagai param untuk loose coupling.
export function accentForAdmin(name, adminOrder) {
  if (!adminOrder || !Array.isArray(adminOrder)) return ADMIN_ACCENTS[0];
  const idx = adminOrder.indexOf(name);
  if (idx >= 0) return ADMIN_ACCENTS[idx % ADMIN_ACCENTS.length];
  return ADMIN_ACCENTS[0];
}

// === INDONESIAN LOCALE STRINGS ===
// MONTH_NAMES_ID full nama untuk bulan label ("Agustus 2026").
// DAY_NAMES_SHORT 3-char ("Min/Sen/Sel") untuk compact view.
// DAY_NAMES_LONG full ("Minggu/Senin/Selasa") untuk kalender.
export const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];
export const DAY_NAMES_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const DAY_NAMES_LONG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// 'YYYY-MM' → 'Agustus 2026'. Empty/all → 'Semua Bulan'.
export function monthLabel(key) {
  if (!key || key === 'all') return 'Semua Bulan';
  const [y, m] = (key || '').split('-');
  return `${MONTH_NAMES_ID[Number(m) - 1] ?? '?'} ${y}`;
}

// === RELATIVE TIME (Indonesian) ===
// Unix ms → "5j lalu" / "3h lalu" / "2mgu lalu" / "4bln lalu".
// Digunakan oleh ViralPostCard. Format.js punya "X ago" (English) — beda purpose.
export function relativeTimeID(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'baru saja';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}j lalu`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}h lalu`;
  const week = Math.floor(day / 7);
  if (week < 5) return `${week}mgu lalu`;
  const month = Math.floor(day / 30);
  return `${month}bln lalu`;
}

// Unix SECONDS → compact Indo "5j" / "3h" / "2mgu". Used by LiveActivityFeed.
export function relativeTimeShort(unixSec, now) {
  const diff = Math.max(0, (now ?? Date.now()) / 1000 - unixSec);
  if (diff < 60) return 'baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}j`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}h`;
  return `${Math.floor(diff / 604800)}mgu`;
}
