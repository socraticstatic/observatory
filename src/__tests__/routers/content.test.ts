import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { contentRouter } from '@/server/routers/content';

const createCaller = createCallerFactory(contentRouter);
const mockDb = { $queryRaw: vi.fn() };
const caller = createCaller({ db: mockDb as any });

beforeEach(() => vi.clearAllMocks());

const ROW = {
  ct: 'text',
  calls: 30n,
  input: 5000n,
  output: 2000n,
  cost: 0.015,
  avg_quality: 4.2,
};

describe('contentRouter.contentTypes', () => {
  it('maps ct to id and label', async () => {
    mockDb.$queryRaw.mockResolvedValue([ROW]);
    const result = await caller.contentTypes({ lookback: '24H' });
    expect(result[0].id).toBe('text');
    expect(result[0].label).toBe('text');
  });

  it('converts bigint token counts and calls to number', async () => {
    mockDb.$queryRaw.mockResolvedValue([ROW]);
    const result = await caller.contentTypes({ lookback: '24H' });
    expect(typeof result[0].inputTokens).toBe('number');
    expect(result[0].inputTokens).toBe(5000);
    expect(typeof result[0].outputTokens).toBe('number');
    expect(result[0].outputTokens).toBe(2000);
    expect(typeof result[0].calls).toBe('number');
    expect(result[0].calls).toBe(30);
  });

  it('outputs costUsd', async () => {
    mockDb.$queryRaw.mockResolvedValue([ROW]);
    const result = await caller.contentTypes({ lookback: '24H' });
    expect(result[0].costUsd).toBeCloseTo(0.015);
  });

  it('includes avgQuality', async () => {
    mockDb.$queryRaw.mockResolvedValue([ROW]);
    const result = await caller.contentTypes({ lookback: '24H' });
    expect(result[0].avgQuality).toBeCloseTo(4.2);
  });

  it('falls back avgQuality to 0 when null', async () => {
    mockDb.$queryRaw.mockResolvedValue([{ ...ROW, avg_quality: null }]);
    const result = await caller.contentTypes({ lookback: '24H' });
    expect(result[0].avgQuality).toBe(0);
  });

  it('returns empty array for no rows', async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    const result = await caller.contentTypes({ lookback: '1H' });
    expect(result).toEqual([]);
  });
});
