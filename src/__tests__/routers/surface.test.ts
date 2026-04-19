import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { surfaceRouter } from '@/server/routers/surface';

const createCaller = createCallerFactory(surfaceRouter);
const mockDb = { $queryRaw: vi.fn() };
const caller = createCaller({ db: mockDb as any });

beforeEach(() => vi.clearAllMocks());

const ROW = {
  surface: 'claude-code',
  calls: 20n,
  cost: 0.08,
  avg_lat: 900,
  p50_lat: 750,
  sessions: 5n,
};

describe('surfaceRouter.appSurface', () => {
  it('maps surface to id and label', async () => {
    mockDb.$queryRaw.mockResolvedValue([ROW]);
    const result = await caller.appSurface({ lookback: '24H' });
    expect(result[0].id).toBe('claude-code');
    expect(result[0].label).toBe('claude-code');
  });

  it('converts bigint calls and sessions to number', async () => {
    mockDb.$queryRaw.mockResolvedValue([ROW]);
    const result = await caller.appSurface({ lookback: '24H' });
    expect(typeof result[0].calls).toBe('number');
    expect(result[0].calls).toBe(20);
    expect(typeof result[0].sessions).toBe('number');
    expect(result[0].sessions).toBe(5);
  });

  it('computes sharePct from totalCost', async () => {
    mockDb.$queryRaw.mockResolvedValue([
      { ...ROW, cost: 0.06 },
      { ...ROW, surface: 'api', cost: 0.02 },
    ]);
    const result = await caller.appSurface({ lookback: '24H' });
    expect(result[0].sharePct).toBeCloseTo(75);
    expect(result[1].sharePct).toBeCloseTo(25);
  });

  it('rounds latency fields', async () => {
    mockDb.$queryRaw.mockResolvedValue([
      { ...ROW, avg_lat: 900.8, p50_lat: 750.2 },
    ]);
    const result = await caller.appSurface({ lookback: '24H' });
    expect(result[0].avgLatMs).toBe(901);
    expect(result[0].p50LatMs).toBe(750);
  });

  it('outputs costUsd', async () => {
    mockDb.$queryRaw.mockResolvedValue([ROW]);
    const result = await caller.appSurface({ lookback: '24H' });
    expect(result[0].costUsd).toBeCloseTo(0.08);
  });

  it('coalesces null surface to unknown', async () => {
    mockDb.$queryRaw.mockResolvedValue([{ ...ROW, surface: 'unknown' }]);
    const result = await caller.appSurface({ lookback: '24H' });
    expect(result[0].id).toBe('unknown');
    expect(result[0].label).toBe('unknown');
  });

  it('returns empty array for no rows', async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    const result = await caller.appSurface({ lookback: '1H' });
    expect(result).toEqual([]);
  });
});
