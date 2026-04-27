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

describe('pulseRouter.statStrip', () => {
  it('statStrip includes p50, p95, and p99 latency percentiles', async () => {
    mockQueryRaw.mockReset();
    mockAggregate.mockReset();
    mockQueryRaw.mockResolvedValue([{
      p50: 350, p95: 1200, p99: 2100,
      avg_lat: 400, prev_avg_lat: 380,
      llm_input: BigInt(50000), llm_output: BigInt(12000),
    }]);
    mockAggregate.mockResolvedValue({
      _count: { id: 10 }, _avg: { latencyMs: 400, qualityScore: null },
      _sum: { cachedTokens: 5000, inputTokens: 50000, outputTokens: 12000 },
    });
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);

    const caller = createCaller(createContext());
    const result = await caller.statStrip({ lookback: '24H' });

    expect(result.p50LatMs).toBe(350);
    expect(result.p95LatMs).toBe(1200);
    expect(result.p99LatMs).toBe(2100);
  });
});
