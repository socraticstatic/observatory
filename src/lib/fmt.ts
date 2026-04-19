export const fmt = (n: number): string =>
  n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 1 : 2) + 'K' : n.toFixed(0);

export const fmtMs = (n: number): string =>
  n < 1000 ? n.toFixed(0) + 'ms' : (n / 1000).toFixed(2) + 's';

export const fmtUsd = (n: number): string =>
  (n < 0 ? '-' : '') + '$' + Math.abs(n).toFixed(2);
