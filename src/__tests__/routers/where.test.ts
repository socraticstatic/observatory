import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { whereRouter } from '@/server/routers/where';

const createCaller = createCallerFactory(whereRouter);
const mockDb = { $queryRaw: vi.fn() };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const caller = createCaller({ db: mockDb as any });

beforeEach(() => vi.clearAllMocks());

const ROW = { region: 'us-east-1', calls: 50n, cost: 0.1, avg_lat: 800 };

describe('whereRouter.regional', () => {
  it('maps region fields correctly', async () => {
    mockDb.$queryRaw.mockResolvedValue([ROW]);
    const result = await caller.regional({ lookback: '24H' });
    expect(result[0].region).toBe('us-east-1');
    expect(result[0].calls).toBe(50);
    expect(result[0].cost).toBeCloseTo(0.1);
    expect(result[0].avgLatMs).toBe(800);
  });

  it('converts bigint calls to number', async () => {
    mockDb.$queryRaw.mockResolvedValue([{ ...ROW, calls: 10n }]);
    const result = await caller.regional({ lookback: '24H' });
    expect(typeof result[0].calls).toBe('number');
    expect(result[0].calls).toBe(10);
  });

  it('handles null avg_lat by rounding to 0', async () => {
    mockDb.$queryRaw.mockResolvedValue([{ ...ROW, avg_lat: null }]);
    const result = await caller.regional({ lookback: '24H' });
    expect(result[0].avgLatMs).toBe(0);
  });

  it('returns empty array for no rows', async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    const result = await caller.regional({ lookback: '1H' });
    expect(result).toEqual([]);
  });
});
