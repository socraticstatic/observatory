'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';
import { LookbackSchema, type Lookback } from '@/lib/lookback';

export function useLookback(defaultVal: Lookback = '24H') {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const raw = params.get('lookback') ?? defaultVal;
  const lookback = LookbackSchema.safeParse(raw).success
    ? (raw as Lookback)
    : defaultVal;

  const setLookback = useCallback((l: Lookback) => {
    const next = new URLSearchParams(params.toString());
    next.set('lookback', l);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);

  return [lookback, setLookback] as const;
}
