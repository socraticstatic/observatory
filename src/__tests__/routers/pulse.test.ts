import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAggregate, mockFindMany, mockCount, mockQueryRaw, mockRegisteredService } = vi.hoisted(() => ({
  mockAggregate: vi.fn(),
  mockFindMany: vi.fn(),
  mockCount: vi.fn().mockResolvedValue(0),
  mockQueryRaw: vi.fn(),
  mockRegisteredService: vi.fn(),
}));

vi.mock('@/server/db', () => ({
  db: {
    llmEvent: { aggregate: mockAggregate, findMany: mockFindMany, count: mockCount },
    $queryRaw: mockQueryRaw,
    registeredService: { findMany: mockRegisteredService },
  },
}));

import { createCallerFactory, createContext } from '@/server/trpc';
import { pulseRouter } from '@/server/routers/pulse';

beforeEach(() => {
  mockAggregate.mockResolvedValue({
    _sum: { costUsd: '21.72', inputTokens: 8000000, outputTokens: 2000000, cachedTokens: 3500000, reasoningTokens: 0 },
    _count: { id: 14284 },
    _avg: { latencyMs: 850, qualityScore: '87.3' },
  });
  mockFindMany.mockResolvedValue([]);
  mockRegisteredService.mockResolvedValue([]);
  // $queryRaw call order for overallCost:
  //   1+2: cacheReadCostSql (current, prev)
  //   3+4: providerCosts, prevProviderCosts
  mockQueryRaw
    .mockResolvedValueOnce([{ cache_read_cost: 0 }])
    .mockResolvedValueOnce([{ cache_read_cost: 0 }])
    .mockResolvedValueOnce([{ provider: 'anthropic', cost: 21.72 }])
    .mockResolvedValueOnce([]);
});

const createCaller = createCallerFactory(pulseRouter);

describe('pulseRouter.overallCost', () => {
  it('returns numeric totalCostUsd', async () => {
    const caller = createCaller(createContext());
    const result = await caller.overallCost({ lookback: '24H' });
    expect(typeof result.totalCostUsd).toBe('number');
    expect(result.totalCostUsd).toBeCloseTo(21.72);
  });
});
