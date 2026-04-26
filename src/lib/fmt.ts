export const fmt = (n: number): string => {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2) + 'M';
  if (n >= 1_000)         return (n / 1_000).toFixed(n >= 10_000 ? 1 : 2) + 'K';
  return n.toFixed(0);
};

export const fmtMs = (n: number | null | undefined): string => {
  if (n == null || n <= 0) return '—';
  return n < 1000 ? n.toFixed(0) + 'ms' : (n / 1000).toFixed(2) + 's';
};

export const fmtUsd = (n: number): string =>
  (n < 0 ? '-' : '') + '$' + Math.abs(n).toFixed(2);
