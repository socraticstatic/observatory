// src/__tests__/routers/who.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { whoRouter } from '@/server/routers/who';

const createCaller = createCallerFactory(whoRouter);
const mockDb = { $queryRaw: vi.fn() };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const caller = createCaller({ db: mockDb as any });

beforeEach(() => vi.clearAllMocks());

describe('whoRouter.providerBreakdown', () => {
  const ROW = { provider: 'anthropic', calls: 10n, cost: 0.04, tokens: 40000 };

  it('converts bigint calls to number', async () => {
    mockDb.$queryRaw.mockResolvedValue([ROW]);
    const result = await caller.providerBreakdown({ lookback: '24H' });
    expect(typeof result[0].calls).toBe('number');
    expect(result[0].calls).toBe(10);
  });

  it('maps cost to costUsd', async () => {
    mockDb.$queryRaw.mockResolvedValue([ROW]);
    const result = await caller.providerBreakdown({ lookback: '24H' });
    expect(result[0].costUsd).toBeCloseTo(0.04);
  });

  it('computes sharePct as fraction of totalCost', async () => {
    mockDb.$queryRaw.mockResolvedValue([
      { provider: 'anthropic', calls: 10n, cost: 0.04, tokens: 40000 },
      { provider: 'openai',    calls: 5n,  cost: 0.01, tokens: 10000 },
    ]);
    const result = await caller.providerBreakdown({ lookback: '24H' });
    expect(result[0].sharePct).toBeCloseTo(80);
    expect(result[1].sharePct).toBeCloseTo(20);
  });

  it('returns sharePct 0 when totalCost is 0', async () => {
    mockDb.$queryRaw.mockResolvedValue([{ provider: 'anthropic', calls: 1n, cost: 0, tokens: 0 }]);
    const result = await caller.providerBreakdown({ lookback: '24H' });
    expect(result[0].sharePct).toBe(0);
  });

  it('returns empty array for no rows', async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    const result = await caller.providerBreakdown({ lookback: '1H' });
    expect(result).toEqual([]);
  });
});

describe('whoRouter.modelAttribution', () => {
  const ROW = {
    model: 'claude-3-5-sonnet-20241022', provider: 'anthropic',
    calls: 5n, cost: 0.03, avg_lat: 1100, p95_lat: 2200, error_rate: 0,
  };

  it('converts bigint calls to number', async () => {
    mockDb.$queryRaw.mockResolvedValue([ROW]);
    const result = await caller.modelAttribution({ lookback: '24H' });
    expect(typeof result[0].calls).toBe('number');
    expect(result[0].calls).toBe(5);
  });

  it('rounds avgLatMs and p95LatMs', async () => {
    mockDb.$queryRaw.mockResolvedValue([{ ...ROW, avg_lat: 1100.7, p95_lat: 2200.3 }]);
    const result = await caller.modelAttribution({ lookback: '24H' });
    expect(result[0].avgLatMs).toBe(1101);
    expect(result[0].p95LatMs).toBe(2200);
  });

  it('computes share as fraction of total cost', async () => {
    mockDb.$queryRaw.mockResolvedValue([
      { ...ROW, cost: 0.03 },
      { ...ROW, model: 'gpt-4o', provider: 'openai', cost: 0.01 },
    ]);
    const result = await caller.modelAttribution({ lookback: '24H' });
    expect(result[0].share).toBeCloseTo(75);
    expect(result[1].share).toBeCloseTo(25);
  });

  it('maps error_rate to errorRatePct', async () => {
    mockDb.$queryRaw.mockResolvedValue([{ ...ROW, error_rate: 5.5 }]);
    const result = await caller.modelAttribution({ lookback: '24H' });
    expect(result[0].errorRatePct).toBeCloseTo(5.5);
  });

  it('returns share 0 when totalCost is 0', async () => {
    mockDb.$queryRaw.mockResolvedValue([{ ...ROW, cost: 0 }]);
    const result = await caller.modelAttribution({ lookback: '24H' });
    expect(result[0].share).toBe(0);
  });

  it('returns empty array for no rows', async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    const result = await caller.modelAttribution({ lookback: '1H' });
    expect(result).toEqual([]);
  });
});
