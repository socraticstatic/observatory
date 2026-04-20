import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { whenRouter } from '@/server/routers/when';

const createCaller = createCallerFactory(whenRouter);
const mockDb = { $queryRaw: vi.fn() };
const caller = createCaller({ db: mockDb as any });

beforeEach(() => vi.clearAllMocks());

const ROW = { d: 15, h: 9, value: 0.0123 };

describe('whenRouter.heatmap', () => {
  it('maps d, h, value correctly', async () => {
    mockDb.$queryRaw.mockResolvedValue([ROW]);
    const result = await caller.heatmap();
    expect(result[0].d).toBe(15);
    expect(result[0].h).toBe(9);
    expect(result[0].value).toBeCloseTo(0.0123);
  });

  it('converts unknown value to number', async () => {
    mockDb.$queryRaw.mockResolvedValue([{ d: 0, h: 0, value: '0.005' }]);
    const result = await caller.heatmap();
    expect(typeof result[0].value).toBe('number');
  });

  it('returns empty array for no rows', async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    const result = await caller.heatmap();
    expect(result).toEqual([]);
  });
});
