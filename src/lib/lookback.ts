import { z } from 'zod';

export const LookbackSchema = z.enum(['1H', '24H', '30D', '90D', '1Y']);
export type Lookback = z.infer<typeof LookbackSchema>;

export const LOOKBACK_CONFIG = {
  '1H':  { label: '1 Hour',   bucket: 'minute', n: 60,  truncate: "date_trunc('minute', ts)" },
  '24H': { label: '24 Hours', bucket: 'hour',   n: 24,  truncate: "date_trunc('hour', ts)"   },
  '30D': { label: '30 Days',  bucket: 'day',    n: 30,  truncate: "date_trunc('day', ts)"    },
  '90D': { label: '90 Days',  bucket: 'day',    n: 90,  truncate: "date_trunc('day', ts)"    },
  '1Y':  { label: '1 Year',   bucket: 'day',    n: 365, truncate: "date_trunc('day', ts)"    },
} as const;

export function lookbackToInterval(l: Lookback): string {
  if (l === '1H')  return '1 hour';
  if (l === '24H') return '24 hours';
  if (l === '90D') return '90 days';
  if (l === '1Y')  return '365 days';
  return '30 days';
}

export function lookbackToMs(l: Lookback): number {
  if (l === '1H')  return 3_600_000;
  if (l === '24H') return 86_400_000;
  if (l === '90D') return 90 * 86_400_000;
  if (l === '1Y')  return 365 * 86_400_000;
  return 30 * 86_400_000;
}

// Alias for components that destructure { label } or { n }
export const LOOKBACKS = LOOKBACK_CONFIG;
