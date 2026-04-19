import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { whatRouter } from '@/server/routers/what';

const createCaller = createCallerFactory(whatRouter);
const mockDb = { $queryRaw: vi.fn() };
const caller = createCaller({ db: mockDb as any });

beforeEach(() => vi.clearAllMocks());

const ROW = {
  bucket: new Date('2026-01-01T10:00:00Z'),
  input: 1000n,
  output: 500n,
  reasoning: 100n,
  cached: 200n,
  cache_creation: 50n,
};

describe('whatRouter.tokenLifecycle', () => {
  it('converts bigint token fields to number', async () => {
    mockDb.$queryRaw.mockResolvedValue([ROW]);
    const result = await caller.tokenLifecycle({ lookback: '24H' });
    expect(typeof result[0].input).toBe('number');
    expect(typeof result[0].output).toBe('number');
    expect(typeof result[0].reasoning).toBe('number');
    expect(typeof result[0].cached).toBe('number');
    expect(result[0].input).toBe(1000);
    expect(result[0].output).toBe(500);
    expect(result[0].reasoning).toBe(100);
    expect(result[0].cached).toBe(200);
    expect(typeof result[0].cacheCreation).toBe('number');
    expect(result[0].cacheCreation).toBe(50);
  });

  it('formats bucket as ISO label', async () => {
    mockDb.$queryRaw.mockResolvedValue([ROW]);
    const result = await caller.tokenLifecycle({ lookback: '24H' });
    expect(result[0].label).toBe('2026-01-01T10:00:00.000Z');
  });

  it('converts bigint cache_creation to numeric cacheCreation', async () => {
    mockDb.$queryRaw.mockResolvedValue([ROW]);
    const result = await caller.tokenLifecycle({ lookback: '24H' });
    expect(typeof result[0].cacheCreation).toBe('number');
    expect(result[0].cacheCreation).toBe(50);
  });

  it('returns empty array for no rows', async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    const result = await caller.tokenLifecycle({ lookback: '1H' });
    expect(result).toEqual([]);
  });
});
