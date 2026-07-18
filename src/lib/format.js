// Format number ke K/M (konsisten, sesuai standar V8)
export function formatNumber(n) {
  if (n == null || isNaN(n)) return '0';
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return Math.round(n).toString();
}

// Format number full Indonesia (1.234.567) tanpa K/M — untuk stat pill profesional
export function formatCompact(n) {
  if (n == null || isNaN(n)) return '0';
  return Math.round(Number(n)).toLocaleString('id-ID');
}

export function formatPercent(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—';
  return `${Number(n).toFixed(decimals)}%`;
}

export function formatDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function relativeTime(ts) {
  if (!ts) return '-';
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}mo ago`;
  return `${Math.floor(month / 12)}y ago`;
}
