import { z } from 'zod';

export const LookbackSchema = z.enum(['1H', '24H', '30D']);
export type Lookback = z.infer<typeof LookbackSchema>;

export const LOOKBACK_CONFIG = {
  '1H':  { label: '1 Hour',   bucket: 'minute', n: 60,  truncate: "date_trunc('minute', ts)" },
  '24H': { label: '24 Hours', bucket: 'hour',   n: 24,  truncate: "date_trunc('hour', ts)"   },
  '30D': { label: '30 Days',  bucket: 'day',    n: 30,  truncate: "date_trunc('day', ts)"    },
} as const;

export function lookbackToInterval(l: Lookback): string {
  return l === '1H' ? '1 hour' : l === '24H' ? '24 hours' : '30 days';
}
