import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAggregate, mockFindMany, mockCount } = vi.hoisted(() => ({
  mockAggregate: vi.fn(),
  mockFindMany: vi.fn(),
  mockCount: vi.fn().mockResolvedValue(0),
}));

vi.mock('@/server/db', () => ({
  db: {
    llmEvent: { aggregate: mockAggregate, findMany: mockFindMany, count: mockCount },
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
